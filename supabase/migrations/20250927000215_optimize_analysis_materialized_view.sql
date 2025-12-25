-- =========================================================================
-- OPTIMIZE mv_analysis_results MATERIALIZED VIEW AND INDEXES
-- =========================================================================

-- This migration optimizes the underlying query for mv_analysis_results
-- materialized view and adds performance indexes to reduce refresh time
-- and improve query performance.

-- =========================================================================
-- STEP 1: ANALYZE CURRENT PERFORMANCE AND ADD MISSING INDEXES
-- =========================================================================

-- Add covering indexes for the materialized view query
-- These indexes will significantly speed up the JOIN operations

-- Optimize llm_analysis_results table
CREATE INDEX IF NOT EXISTS idx_llm_analysis_results_prompt_created
ON beekon_data.llm_analysis_results (prompt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_analysis_results_analyzed_at
ON beekon_data.llm_analysis_results (analyzed_at DESC)
WHERE analyzed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_analysis_results_confidence_sentiment
ON beekon_data.llm_analysis_results (confidence_score, sentiment_score, is_mentioned)
WHERE confidence_score IS NOT NULL;

-- Optimize prompts table
CREATE INDEX IF NOT EXISTS idx_prompts_topic_active
ON beekon_data.prompts (topic_id, id)
WHERE topic_id IS NOT NULL;

-- Optimize topics table
CREATE INDEX IF NOT EXISTS idx_topics_website_active
ON beekon_data.topics (website_id, is_active, id)
WHERE is_active = true;

-- Optimize analysis_sessions table
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_covering
ON beekon_data.analysis_sessions (id, analysis_name, status);

-- =========================================================================
-- STEP 2: CREATE OPTIMIZED MATERIALIZED VIEW DEFINITION
-- =========================================================================

-- First, let's create a more efficient version of the materialized view
-- with optimized query structure and better performance characteristics

CREATE OR REPLACE VIEW beekon_data.v_analysis_results_optimized AS
WITH analysis_base AS (
    -- Base analysis data with minimal joins
    SELECT
        lar.prompt_id,
        lar.llm_provider,
        lar.is_mentioned,
        lar.rank_position,
        lar.confidence_score,
        lar.sentiment_score,
        lar.summary_text,
        lar.response_text,
        lar.analyzed_at,
        lar.created_at,
        lar.analysis_session_id,
        p.prompt_text,
        p.reporting_text as prompt_reporting_text,
        p.recommendation_text,
        p.strengths,
        p.opportunities,
        p.topic_id,
        t.website_id,
        t.topic_name
    FROM beekon_data.llm_analysis_results lar
    JOIN beekon_data.prompts p ON lar.prompt_id = p.id
    JOIN beekon_data.topics t ON p.topic_id = t.id
    WHERE t.is_active = true
),
session_info AS (
    -- Separate session information lookup
    SELECT
        id as session_id,
        analysis_name,
        status as session_status
    FROM beekon_data.analysis_sessions
),
topic_aggregates AS (
    -- Pre-compute topic-level aggregates efficiently
    SELECT
        topic_id,
        website_id,
        COUNT(*) as total_analyses,
        COUNT(*) FILTER (WHERE is_mentioned = true) as mentions,
        AVG(confidence_score) as avg_confidence,
        AVG(sentiment_score) as avg_sentiment,
        AVG(rank_position) FILTER (WHERE rank_position IS NOT NULL) as avg_rank
    FROM analysis_base
    GROUP BY topic_id, website_id
)
SELECT
    ab.prompt_id,
    ab.website_id,
    ab.prompt_text,
    ab.topic_name,
    ab.llm_provider,
    ab.is_mentioned,
    ab.rank_position,
    ab.confidence_score,
    ab.sentiment_score,
    ab.summary_text,
    ab.response_text,
    ab.analyzed_at,
    ab.created_at,
    ab.prompt_reporting_text,
    ab.recommendation_text,
    ab.strengths,
    ab.opportunities,
    -- Session information (left join for performance)
    si.session_id,
    si.analysis_name,
    si.session_status,
    -- Pre-computed topic aggregates (much faster than window functions)
    ta.total_analyses as topic_total_analyses,
    ta.mentions as topic_mentions,
    ta.avg_confidence as topic_avg_confidence,
    ta.avg_sentiment as topic_avg_sentiment,
    ta.avg_rank as topic_avg_rank
FROM analysis_base ab
LEFT JOIN session_info si ON ab.analysis_session_id = si.session_id
LEFT JOIN topic_aggregates ta ON ab.topic_id = ta.topic_id AND ab.website_id = ta.website_id;

-- =========================================================================
-- STEP 3: CREATE PERFORMANCE MONITORING FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.analyze_mv_performance()
RETURNS TABLE(
    table_name TEXT,
    index_name TEXT,
    index_size TEXT,
    table_size TEXT,
    seq_scan BIGINT,
    seq_tup_read BIGINT,
    idx_scan BIGINT,
    idx_tup_fetch BIGINT,
    performance_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH table_stats AS (
        SELECT
            schemaname,
            tablename,
            seq_scan,
            seq_tup_read,
            idx_scan,
            idx_tup_fetch,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size
        FROM pg_stat_user_tables
        WHERE schemaname = 'beekon_data'
          AND tablename IN ('llm_analysis_results', 'prompts', 'topics', 'analysis_sessions', 'mv_analysis_results')
    ),
    index_stats AS (
        SELECT
            schemaname,
            tablename,
            indexname,
            idx_scan,
            pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'beekon_data'
          AND tablename IN ('llm_analysis_results', 'prompts', 'topics', 'analysis_sessions', 'mv_analysis_results')
    )
    SELECT
        ts.tablename::TEXT,
        COALESCE(ist.indexname, 'N/A')::TEXT,
        COALESCE(ist.index_size, 'N/A')::TEXT,
        ts.table_size::TEXT,
        ts.seq_scan,
        ts.seq_tup_read,
        COALESCE(ist.idx_scan, 0),
        ts.idx_tup_fetch,
        -- Performance score: higher is better (more index usage vs sequential scans)
        CASE
            WHEN ts.seq_scan + COALESCE(ist.idx_scan, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(ist.idx_scan, 0)::NUMERIC / (ts.seq_scan + COALESCE(ist.idx_scan, 0))) * 100, 2)
        END as performance_score
    FROM table_stats ts
    LEFT JOIN index_stats ist ON ts.tablename = ist.tablename
    ORDER BY performance_score DESC, ts.seq_scan DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 4: CREATE REFRESH PERFORMANCE BENCHMARKING FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.benchmark_analysis_refresh_performance(
    test_runs INTEGER DEFAULT 3
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    run_number INTEGER;
    results JSONB := '[]';
    run_result JSONB;
    total_duration NUMERIC := 0;
    avg_duration NUMERIC;
    min_duration NUMERIC := 999999;
    max_duration NUMERIC := 0;
    current_duration NUMERIC;
BEGIN
    operation_id := 'benchmark_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Log benchmark start
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Refresh performance benchmark %s: starting %s test runs', operation_id, test_runs), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Run multiple refresh tests
    FOR run_number IN 1..test_runs LOOP
        start_time := NOW();

        BEGIN
            -- Test the concurrent refresh
            EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results';
            end_time := NOW();
            current_duration := EXTRACT(EPOCH FROM (end_time - start_time));

            run_result := jsonb_build_object(
                'run_number', run_number,
                'status', 'success',
                'method', 'concurrent',
                'duration_seconds', current_duration,
                'started_at', start_time,
                'completed_at', end_time
            );

        EXCEPTION WHEN OTHERS THEN
            -- Fallback to blocking refresh for this test
            BEGIN
                EXECUTE 'REFRESH MATERIALIZED VIEW beekon_data.mv_analysis_results';
                end_time := NOW();
                current_duration := EXTRACT(EPOCH FROM (end_time - start_time));

                run_result := jsonb_build_object(
                    'run_number', run_number,
                    'status', 'success_with_fallback',
                    'method', 'blocking',
                    'duration_seconds', current_duration,
                    'concurrent_error', SQLERRM,
                    'started_at', start_time,
                    'completed_at', end_time
                );

            EXCEPTION WHEN OTHERS THEN
                current_duration := EXTRACT(EPOCH FROM (NOW() - start_time));
                run_result := jsonb_build_object(
                    'run_number', run_number,
                    'status', 'failed',
                    'error', SQLERRM,
                    'duration_seconds', current_duration,
                    'failed_at', NOW()
                );
            END;
        END;

        -- Collect statistics
        IF (run_result->>'status') LIKE 'success%' THEN
            total_duration := total_duration + current_duration;
            min_duration := LEAST(min_duration, current_duration);
            max_duration := GREATEST(max_duration, current_duration);
        END IF;

        results := results || jsonb_build_array(run_result);

        -- Wait between runs to avoid resource conflicts
        IF run_number < test_runs THEN
            PERFORM pg_sleep(2);
        END IF;
    END LOOP;

    -- Calculate averages
    avg_duration := CASE WHEN test_runs > 0 THEN total_duration / test_runs ELSE 0 END;

    -- Return comprehensive benchmark results
    RETURN jsonb_build_object(
        'benchmark_summary', jsonb_build_object(
            'operation_id', operation_id,
            'test_runs', test_runs,
            'avg_duration_seconds', ROUND(avg_duration, 2),
            'min_duration_seconds', ROUND(min_duration, 2),
            'max_duration_seconds', ROUND(max_duration, 2),
            'total_duration_seconds', ROUND(total_duration, 2),
            'benchmark_completed_at', NOW()
        ),
        'individual_runs', results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 5: CREATE REFRESH STRATEGY SELECTOR FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.select_optimal_refresh_strategy(
    target_duration_seconds INTEGER DEFAULT 30,
    allow_emergency BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
    mv_size_mb NUMERIC;
    recent_changes_count BIGINT;
    last_refresh_hours NUMERIC;
    recommended_strategy TEXT;
    strategy_reason TEXT;
    estimated_duration NUMERIC;
BEGIN
    -- Get materialized view size
    SELECT ROUND(pg_total_relation_size('beekon_data.mv_analysis_results') / 1024.0 / 1024.0, 2)
    INTO mv_size_mb;

    -- Count recent changes (last 24 hours)
    SELECT COUNT(*) INTO recent_changes_count
    FROM beekon_data.llm_analysis_results
    WHERE created_at >= (NOW() - INTERVAL '24 hours');

    -- Estimate hours since last refresh (rough approximation)
    SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - last_vacuum)) / 3600, 48) INTO last_refresh_hours
    FROM pg_stat_user_tables
    WHERE schemaname = 'beekon_data' AND relname = 'mv_analysis_results';

    -- Determine optimal strategy based on conditions
    IF mv_size_mb > 100 AND target_duration_seconds < 20 AND allow_emergency THEN
        recommended_strategy := 'emergency_critical';
        strategy_reason := format('Large view (%.1f MB) with tight time constraint (%s sec)', mv_size_mb, target_duration_seconds);
        estimated_duration := 8;

    ELSIF recent_changes_count = 0 AND last_refresh_hours < 6 THEN
        recommended_strategy := 'skip_no_changes';
        strategy_reason := format('No recent changes (%s) and recently refreshed (%.1f hours ago)', recent_changes_count, last_refresh_hours);
        estimated_duration := 0;

    ELSIF recent_changes_count < 100 AND target_duration_seconds < 45 THEN
        recommended_strategy := 'smart_incremental';
        strategy_reason := format('Few recent changes (%s) with moderate time constraint', recent_changes_count);
        estimated_duration := 15;

    ELSIF mv_size_mb < 50 OR target_duration_seconds > 60 THEN
        recommended_strategy := 'full_concurrent';
        strategy_reason := format('Small/medium view (%.1f MB) or relaxed time constraint (%s sec)', mv_size_mb, target_duration_seconds);
        estimated_duration := GREATEST(mv_size_mb * 0.5, 20);

    ELSE
        recommended_strategy := 'staging_based';
        strategy_reason := format('Balanced approach for %.1f MB view with %s recent changes', mv_size_mb, recent_changes_count);
        estimated_duration := 25;
    END IF;

    RETURN jsonb_build_object(
        'recommended_strategy', recommended_strategy,
        'strategy_reason', strategy_reason,
        'estimated_duration_seconds', estimated_duration,
        'analysis', jsonb_build_object(
            'mv_size_mb', mv_size_mb,
            'recent_changes_count', recent_changes_count,
            'last_refresh_hours', ROUND(last_refresh_hours, 1),
            'target_duration_seconds', target_duration_seconds,
            'allow_emergency', allow_emergency
        ),
        'available_functions', jsonb_build_object(
            'emergency_critical', 'beekon_data.refresh_analysis_emergency_critical()',
            'smart_incremental', 'beekon_data.refresh_analysis_smart()',
            'full_concurrent', 'beekon_data.refresh_analysis_atomic()',
            'staging_based', 'beekon_data.refresh_analysis_with_staging()',
            'failsafe', 'beekon_data.refresh_analysis_failsafe()'
        ),
        'analyzed_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 6: ADD UNIQUE INDEX FOR MATERIALIZED VIEW CONCURRENT REFRESH
-- =========================================================================

-- Ensure the main materialized view has proper unique index for concurrent refresh
-- This is critical for the REFRESH MATERIALIZED VIEW CONCURRENTLY to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_analysis_results_unique_concurrent
ON beekon_data.mv_analysis_results (id);

-- =========================================================================
-- GRANT PERMISSIONS
-- =========================================================================

GRANT SELECT ON beekon_data.v_analysis_results_optimized TO authenticated;
GRANT SELECT ON beekon_data.v_analysis_results_optimized TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.analyze_mv_performance TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.analyze_mv_performance TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.benchmark_analysis_refresh_performance TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.benchmark_analysis_refresh_performance TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.select_optimal_refresh_strategy TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.select_optimal_refresh_strategy TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON VIEW beekon_data.v_analysis_results_optimized IS
'Optimized view definition for mv_analysis_results with better query performance and reduced complexity.';

COMMENT ON FUNCTION beekon_data.analyze_mv_performance IS
'Analyzes performance statistics for analysis-related tables and indexes. Use to identify performance bottlenecks.';

COMMENT ON FUNCTION beekon_data.benchmark_analysis_refresh_performance IS
'Benchmarks materialized view refresh performance with multiple test runs. Use to measure optimization impact.';

COMMENT ON FUNCTION beekon_data.select_optimal_refresh_strategy IS
'Intelligent strategy selector that recommends the best refresh approach based on current conditions and constraints.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Materialized view optimization completed - performance indexes and strategy selection available', NOW())
ON CONFLICT DO NOTHING;