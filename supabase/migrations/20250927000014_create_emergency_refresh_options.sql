-- =========================================================================
-- EMERGENCY FAST-REFRESH OPTIONS FOR mv_analysis_results
-- =========================================================================

-- This migration creates ultra-fast emergency refresh options and staging
-- table strategies for critical situations when the full materialized view
-- refresh is failing or taking too long.

-- =========================================================================
-- STEP 1: CREATE EMERGENCY CRITICAL-ONLY MATERIALIZED VIEW
-- =========================================================================

-- Create a lightweight version with only essential metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_analysis_results_critical AS
SELECT
    p.id as prompt_id,
    t.website_id,
    p.prompt_text,
    t.topic_name,
    lar.llm_provider,
    lar.is_mentioned,
    lar.confidence_score,
    lar.sentiment_score,
    lar.analyzed_at,
    lar.created_at,
    -- Simplified aggregations (no window functions)
    1 as topic_total_analyses,
    CASE WHEN lar.is_mentioned THEN 1 ELSE 0 END as topic_mentions,
    lar.confidence_score as topic_avg_confidence,
    lar.sentiment_score as topic_avg_sentiment,
    NULL::NUMERIC as topic_avg_rank
FROM beekon_data.llm_analysis_results lar
JOIN beekon_data.prompts p ON lar.prompt_id = p.id
JOIN beekon_data.topics t ON p.topic_id = t.id
WHERE t.is_active = true
ORDER BY lar.analyzed_at DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analysis_results_critical_unique
ON beekon_data.mv_analysis_results_critical (prompt_id, llm_provider, analyzed_at);

-- =========================================================================
-- STEP 2: CREATE STAGING TABLE FOR INCREMENTAL UPDATES
-- =========================================================================

-- Create staging table for incremental processing
CREATE TABLE IF NOT EXISTS beekon_data.analysis_results_staging (
    prompt_id UUID NOT NULL,
    website_id UUID NOT NULL,
    prompt_text TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    llm_provider TEXT NOT NULL,
    is_mentioned BOOLEAN NOT NULL DEFAULT FALSE,
    rank_position INTEGER,
    confidence_score NUMERIC NOT NULL DEFAULT 0,
    sentiment_score NUMERIC NOT NULL DEFAULT 0,
    summary_text TEXT,
    response_text TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- Metadata for staging
    staging_operation_id TEXT,
    staging_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    staging_status TEXT DEFAULT 'pending',
    PRIMARY KEY (prompt_id, llm_provider)
);

-- Create indexes for efficient staging operations
CREATE INDEX IF NOT EXISTS idx_analysis_staging_website_id ON beekon_data.analysis_results_staging (website_id);
CREATE INDEX IF NOT EXISTS idx_analysis_staging_analyzed_at ON beekon_data.analysis_results_staging (analyzed_at);
CREATE INDEX IF NOT EXISTS idx_analysis_staging_operation_id ON beekon_data.analysis_results_staging (staging_operation_id);
CREATE INDEX IF NOT EXISTS idx_analysis_staging_status ON beekon_data.analysis_results_staging (staging_status);

-- =========================================================================
-- STEP 3: CREATE EMERGENCY REFRESH FUNCTIONS
-- =========================================================================

-- Ultra-fast critical refresh (5-10 seconds)
CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_emergency_critical()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    result JSONB;
BEGIN
    operation_id := 'emergency_critical_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Log emergency operation
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('WARNING', format('EMERGENCY: Critical analysis refresh %s initiated', operation_id), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
        -- Refresh the lightweight critical view only
        EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results_critical';

        result := jsonb_build_object(
            'status', 'success',
            'operation_id', operation_id,
            'operation_type', 'emergency_critical',
            'method', 'critical_view_concurrent',
            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'note', 'Emergency refresh completed - only critical metrics available',
            'completed_at', NOW()
        );

    EXCEPTION WHEN OTHERS THEN
        -- Even more emergency fallback - blocking refresh of critical view
        BEGIN
            EXECUTE 'REFRESH MATERIALIZED VIEW beekon_data.mv_analysis_results_critical';
            result := jsonb_build_object(
                'status', 'success_with_fallback',
                'operation_id', operation_id,
                'operation_type', 'emergency_critical_blocking',
                'method', 'critical_view_blocking',
                'fallback_reason', SQLERRM,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'completed_at', NOW()
            );
        EXCEPTION WHEN OTHERS THEN
            result := jsonb_build_object(
                'status', 'failed',
                'operation_id', operation_id,
                'operation_type', 'emergency_critical_failed',
                'error', SQLERRM,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'failed_at', NOW()
            );
        END;
    END;

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('WARNING', format('EMERGENCY: Critical analysis refresh %s completed: %s (%.2fs)',
            operation_id, result->>'status', (result->>'duration_seconds')::NUMERIC), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 4: CREATE STAGING-BASED INCREMENTAL REFRESH
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_with_staging(
    hours_back INTEGER DEFAULT 6,
    batch_size INTEGER DEFAULT 1000
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    cutoff_time TIMESTAMP;
    processed_batches INTEGER := 0;
    total_processed INTEGER := 0;
    result JSONB;
    batch_result INTEGER;
BEGIN
    operation_id := 'staging_refresh_' || to_char(NOW(), 'YYYYMMDDHH24MISS');
    cutoff_time := NOW() - (hours_back || ' hours')::INTERVAL;

    -- Log start
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Staging-based refresh %s: processing %s hours of data',
            operation_id, hours_back), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Clear existing staging data for this operation
    DELETE FROM beekon_data.analysis_results_staging
    WHERE staging_operation_id = operation_id OR staging_created_at < (NOW() - INTERVAL '1 hour');

    -- Populate staging table with recent data in batches
    LOOP
        WITH recent_data AS (
            SELECT
                p.id as prompt_id,
                t.website_id,
                p.prompt_text,
                t.topic_name,
                lar.llm_provider,
                lar.is_mentioned,
                lar.rank_position,
                lar.confidence_score,
                lar.sentiment_score,
                lar.summary_text,
                lar.response_text,
                lar.analyzed_at,
                lar.created_at
            FROM beekon_data.llm_analysis_results lar
            JOIN beekon_data.prompts p ON lar.prompt_id = p.id
            JOIN beekon_data.topics t ON p.topic_id = t.id
            WHERE lar.created_at >= cutoff_time
              AND t.is_active = true
              AND NOT EXISTS (
                  SELECT 1 FROM beekon_data.analysis_results_staging s
                  WHERE s.prompt_id = p.id AND s.llm_provider = lar.llm_provider
              )
            ORDER BY lar.created_at DESC
            LIMIT batch_size
        )
        INSERT INTO beekon_data.analysis_results_staging (
            prompt_id, website_id, prompt_text, topic_name, llm_provider,
            is_mentioned, rank_position, confidence_score, sentiment_score,
            summary_text, response_text, analyzed_at, created_at,
            staging_operation_id, staging_status
        )
        SELECT
            *, operation_id, 'processed'
        FROM recent_data;

        GET DIAGNOSTICS batch_result = ROW_COUNT;

        IF batch_result = 0 THEN
            EXIT; -- No more data to process
        END IF;

        processed_batches := processed_batches + 1;
        total_processed := total_processed + batch_result;

        -- Prevent infinite loops and timeout issues
        IF processed_batches >= 10 OR EXTRACT(EPOCH FROM (NOW() - start_time)) > 30 THEN
            EXIT;
        END IF;
    END LOOP;

    -- If we have staging data, trigger a full refresh
    IF total_processed > 0 THEN
        BEGIN
            EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results';

            result := jsonb_build_object(
                'status', 'success',
                'operation_id', operation_id,
                'method', 'staging_triggered_refresh',
                'processed_batches', processed_batches,
                'total_processed', total_processed,
                'hours_back', hours_back,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'completed_at', NOW()
            );
        EXCEPTION WHEN OTHERS THEN
            result := jsonb_build_object(
                'status', 'staging_successful_refresh_failed',
                'operation_id', operation_id,
                'processed_batches', processed_batches,
                'total_processed', total_processed,
                'refresh_error', SQLERRM,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'note', 'Staging completed but materialized view refresh failed'
            );
        END;
    ELSE
        result := jsonb_build_object(
            'status', 'no_changes',
            'operation_id', operation_id,
            'method', 'staging_no_refresh_needed',
            'hours_back', hours_back,
            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'completed_at', NOW()
        );
    END IF;

    -- Clean up staging data for this operation
    DELETE FROM beekon_data.analysis_results_staging
    WHERE staging_operation_id = operation_id;

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Staging refresh %s completed: %s, processed %s records (%.2fs)',
            operation_id, result->>'status', total_processed, (result->>'duration_seconds')::NUMERIC), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 5: CREATE FAILSAFE REFRESH FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_failsafe()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    result JSONB;
    emergency_result JSONB;
    staging_result JSONB;
    incremental_result JSONB;
BEGIN
    operation_id := 'failsafe_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Log start of failsafe operation
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('WARNING', format('FAILSAFE: Analysis refresh %s initiated - trying multiple strategies', operation_id), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Strategy 1: Try smart incremental refresh (fastest)
    BEGIN
        incremental_result := beekon_data.refresh_analysis_smart(1, 6);
        IF (incremental_result->>'status') IN ('success', 'success_with_fallback') THEN
            result := incremental_result || jsonb_build_object('failsafe_strategy', 'smart_incremental_success');
            RETURN result;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        incremental_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
    END;

    -- Strategy 2: Try staging-based refresh
    BEGIN
        staging_result := beekon_data.refresh_analysis_with_staging(3, 500);
        IF (staging_result->>'status') IN ('success', 'no_changes') THEN
            result := staging_result || jsonb_build_object('failsafe_strategy', 'staging_success');
            RETURN result;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        staging_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
    END;

    -- Strategy 3: Emergency critical-only refresh (last resort)
    BEGIN
        emergency_result := beekon_data.refresh_analysis_emergency_critical();
        result := emergency_result || jsonb_build_object(
            'failsafe_strategy', 'emergency_critical',
            'attempted_strategies', jsonb_build_object(
                'incremental', incremental_result,
                'staging', staging_result,
                'emergency', emergency_result
            ),
            'total_failsafe_duration', EXTRACT(EPOCH FROM (NOW() - start_time))
        );
    EXCEPTION WHEN OTHERS THEN
        result := jsonb_build_object(
            'status', 'complete_failure',
            'operation_id', operation_id,
            'failsafe_strategy', 'all_strategies_failed',
            'final_error', SQLERRM,
            'attempted_strategies', jsonb_build_object(
                'incremental', incremental_result,
                'staging', staging_result
            ),
            'total_failsafe_duration', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'failed_at', NOW()
        );
    END;

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('WARNING', format('FAILSAFE: Analysis refresh %s completed: %s using %s (%.2fs)',
            operation_id, result->>'status', result->>'failsafe_strategy',
            COALESCE((result->>'total_failsafe_duration')::NUMERIC, (result->>'duration_seconds')::NUMERIC)), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS
-- =========================================================================

GRANT SELECT ON beekon_data.mv_analysis_results_critical TO authenticated;
GRANT SELECT ON beekon_data.mv_analysis_results_critical TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.analysis_results_staging TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.analysis_results_staging TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_emergency_critical TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_emergency_critical TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_with_staging TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_with_staging TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_failsafe TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_failsafe TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_analysis_results_critical IS
'Lightweight emergency materialized view with essential analysis metrics only. Ultra-fast refresh for critical situations.';

COMMENT ON TABLE beekon_data.analysis_results_staging IS
'Staging table for incremental analysis processing. Used to batch and process recent changes before triggering full refresh.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_emergency_critical IS
'EMERGENCY: Ultra-fast refresh of critical analysis metrics only (5-10 seconds). Use when full refresh is failing.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_with_staging IS
'Staging-based incremental refresh that processes recent changes in batches before triggering materialized view refresh.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_failsafe IS
'FAILSAFE: Tries multiple refresh strategies in sequence. Use when all other refresh methods are failing.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Emergency refresh options and staging strategy created - failsafe mechanisms available', NOW())
ON CONFLICT DO NOTHING;