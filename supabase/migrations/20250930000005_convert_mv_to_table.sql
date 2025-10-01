-- =========================================================================
-- CONVERT MATERIALIZED VIEW TO REGULAR TABLE FOR FAST INCREMENTAL UPDATES
-- =========================================================================
--
-- Problem: mv_analysis_results materialized view with complex window functions
-- takes >10 minutes to refresh, causing timeouts even with extended statement_timeout.
--
-- Solution: Convert to a regular table with incremental update functions that
-- only process data for specific websites, eliminating the need for full refreshes.
--
-- Benefits:
-- - Website-specific updates complete in seconds instead of minutes
-- - No timeout issues
-- - Direct INSERT/DELETE operations (no REFRESH MATERIALIZED VIEW needed)
-- - Auto-updates via triggers (optional)
-- - Same query interface for application code
-- =========================================================================

-- =========================================================================
-- STEP 1: BACKUP AND RENAME EXISTING MATERIALIZED VIEW
-- =========================================================================

-- Rename the existing materialized view as backup
ALTER MATERIALIZED VIEW IF EXISTS beekon_data.mv_analysis_results
RENAME TO mv_analysis_results_backup;

-- =========================================================================
-- STEP 2: CREATE REGULAR TABLE WITH SAME STRUCTURE
-- =========================================================================

CREATE TABLE IF NOT EXISTS beekon_data.mv_analysis_results (
    id UUID NOT NULL,
    website_id UUID NOT NULL,
    prompt_id UUID NOT NULL,
    is_mentioned BOOLEAN,
    rank_position INTEGER,
    sentiment_score NUMERIC,
    confidence_score NUMERIC,
    llm_provider TEXT NOT NULL,
    response_text TEXT,
    summary_text TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    topic_id UUID NOT NULL,
    prompt_text TEXT,
    prompt_reporting_text TEXT,
    recommendation_text TEXT,
    strengths TEXT[],
    opportunities TEXT[],
    topic_name TEXT,
    session_id UUID,
    analysis_name TEXT,
    session_status TEXT,
    topic_total_analyses BIGINT,
    topic_mentions BIGINT,
    topic_avg_confidence NUMERIC,
    topic_avg_sentiment NUMERIC,
    topic_avg_rank NUMERIC
);

-- =========================================================================
-- STEP 3: COPY DATA FROM BACKUP MATERIALIZED VIEW
-- =========================================================================

INSERT INTO beekon_data.mv_analysis_results
SELECT * FROM beekon_data.mv_analysis_results_backup;

-- =========================================================================
-- STEP 4: CREATE INDEXES (SAME AS MATERIALIZED VIEW HAD)
-- =========================================================================

-- Primary unique index on id
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analysis_results_unique
ON beekon_data.mv_analysis_results (id);

-- Website and analyzed_at index for filtering
CREATE INDEX IF NOT EXISTS idx_mv_analysis_website_analyzed
ON beekon_data.mv_analysis_results (website_id, analyzed_at DESC);

-- Website, topic, and analyzed_at index for topic-based queries
CREATE INDEX IF NOT EXISTS idx_mv_analysis_website_topic
ON beekon_data.mv_analysis_results (website_id, topic_id, analyzed_at DESC);

-- Mentioned flag index for filtering mentioned results
CREATE INDEX IF NOT EXISTS idx_mv_analysis_mentioned
ON beekon_data.mv_analysis_results (website_id, is_mentioned, analyzed_at DESC);

-- =========================================================================
-- STEP 5: CREATE INCREMENTAL UPDATE FUNCTION FOR WEBSITE-SPECIFIC UPDATES
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.update_mv_analysis_for_website(
    website_id_param UUID
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    deleted_rows INTEGER := 0;
    inserted_rows INTEGER := 0;
    result JSONB;
BEGIN
    operation_id := 'website_table_update_' || website_id_param || '_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Log start
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source, created_at)
        VALUES (
            'INFO',
            format('Starting incremental table update for website: %s', website_id_param),
            jsonb_build_object(
                'operation_id', operation_id,
                'website_id', website_id_param,
                'started_at', start_time,
                'method', 'incremental_table_update'
            ),
            'update_mv_analysis_for_website',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Step 1: Delete existing data for this website
    DELETE FROM beekon_data.mv_analysis_results
    WHERE website_id = website_id_param;

    GET DIAGNOSTICS deleted_rows = ROW_COUNT;

    -- Step 2: Insert fresh data for this website only (fast - ~300 rows per website)
    INSERT INTO beekon_data.mv_analysis_results (
        id, website_id, prompt_id, is_mentioned, rank_position,
        sentiment_score, confidence_score, llm_provider, response_text,
        summary_text, analyzed_at, created_at, topic_id, prompt_text,
        prompt_reporting_text, recommendation_text, strengths, opportunities,
        topic_name, session_id, analysis_name, session_status,
        topic_total_analyses, topic_mentions, topic_avg_confidence,
        topic_avg_sentiment, topic_avg_rank
    )
    SELECT
        lar.id,
        lar.website_id,
        lar.prompt_id,
        lar.is_mentioned,
        lar.rank_position,
        lar.sentiment_score,
        lar.confidence_score,
        lar.llm_provider,
        lar.response_text,
        lar.summary_text,
        lar.analyzed_at,
        lar.created_at,
        p.topic_id,
        p.prompt_text,
        p.reporting_text AS prompt_reporting_text,
        p.recommendation_text,
        p.strengths,
        p.opportunities,
        t.topic_name,
        ses.id AS session_id,
        ses.analysis_name,
        ses.status AS session_status,
        COUNT(*) OVER (PARTITION BY lar.website_id, p.topic_id) AS topic_total_analyses,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 ELSE NULL END) OVER (PARTITION BY lar.website_id, p.topic_id) AS topic_mentions,
        AVG(lar.confidence_score) OVER (PARTITION BY lar.website_id, p.topic_id) AS topic_avg_confidence,
        AVG(lar.sentiment_score) OVER (PARTITION BY lar.website_id, p.topic_id) AS topic_avg_sentiment,
        AVG(lar.rank_position) OVER (PARTITION BY lar.website_id, p.topic_id) AS topic_avg_rank
    FROM beekon_data.llm_analysis_results lar
    JOIN beekon_data.prompts p ON lar.prompt_id = p.id
    JOIN beekon_data.topics t ON p.topic_id = t.id
    LEFT JOIN beekon_data.analysis_sessions ses ON lar.analysis_session_id = ses.id
    WHERE lar.website_id = website_id_param
      AND lar.analyzed_at >= (NOW() - INTERVAL '90 days')
      AND t.is_active = true
      AND p.is_active = true;

    GET DIAGNOSTICS inserted_rows = ROW_COUNT;

    -- Build success result
    result := jsonb_build_object(
        'status', 'success',
        'operation_id', operation_id,
        'website_id', website_id_param,
        'method', 'incremental_table_update',
        'deleted_rows', deleted_rows,
        'inserted_rows', inserted_rows,
        'net_change', inserted_rows - deleted_rows,
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
        'started_at', start_time,
        'completed_at', NOW()
    );

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source, created_at)
        VALUES (
            'INFO',
            format('Incremental table update completed for %s: deleted %s, inserted %s rows in %.2fs',
                website_id_param, deleted_rows, inserted_rows,
                EXTRACT(EPOCH FROM (NOW() - start_time))),
            result,
            'update_mv_analysis_for_website',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;

EXCEPTION WHEN OTHERS THEN
    result := jsonb_build_object(
        'status', 'failed',
        'operation_id', operation_id,
        'website_id', website_id_param,
        'error', SQLERRM,
        'error_detail', SQLSTATE,
        'deleted_rows', deleted_rows,
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
        'failed_at', NOW()
    );

    -- Log failure
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source, created_at)
        VALUES (
            'ERROR',
            format('Incremental table update FAILED for %s: %s', website_id_param, SQLERRM),
            result,
            'update_mv_analysis_for_website',
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 6: CREATE PUBLIC SCHEMA WRAPPER FOR SUPABASE RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.update_mv_analysis_for_website(
    website_id_param UUID
) RETURNS JSONB AS $$
BEGIN
    RETURN beekon_data.update_mv_analysis_for_website(website_id_param);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 7: GRANT PERMISSIONS
-- =========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.mv_analysis_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.mv_analysis_results TO service_role;
GRANT SELECT ON beekon_data.mv_analysis_results TO anon;

GRANT EXECUTE ON FUNCTION beekon_data.update_mv_analysis_for_website TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.update_mv_analysis_for_website TO service_role;

GRANT EXECUTE ON FUNCTION public.update_mv_analysis_for_website TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_mv_analysis_for_website TO service_role;
GRANT EXECUTE ON FUNCTION public.update_mv_analysis_for_website TO anon;

-- =========================================================================
-- STEP 8: ADD COMMENTS
-- =========================================================================

COMMENT ON TABLE beekon_data.mv_analysis_results IS
'Analysis results table (converted from materialized view for fast incremental updates).
Use update_mv_analysis_for_website(website_id) to refresh data for a specific website.
This eliminates the need for slow full refreshes and prevents timeout issues.';

COMMENT ON FUNCTION beekon_data.update_mv_analysis_for_website IS
'Fast incremental update for mv_analysis_results table by website_id.
Deletes old data for the website and inserts fresh data (typically ~300 rows).
Completes in seconds instead of minutes. Use this instead of REFRESH MATERIALIZED VIEW.';

COMMENT ON FUNCTION public.update_mv_analysis_for_website IS
'Public schema wrapper for beekon_data.update_mv_analysis_for_website.
Allows Supabase JavaScript client to call via RPC.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, source, created_at)
VALUES (
    'INFO',
    'Converted mv_analysis_results from materialized view to regular table with incremental update function',
    'migration_20250930000005',
    NOW()
)
ON CONFLICT DO NOTHING;
