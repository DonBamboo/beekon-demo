-- =========================================================================
-- FIX STATEMENT TIMEOUT ISSUES IN refresh_all_materialized_views
-- =========================================================================

-- This migration addresses the 57014 statement timeout error by:
-- 1. Creating timeout-resistant refresh function with early detection
-- 2. Adding missing unique index for concurrent refresh
-- 3. Implementing chunked refresh strategy with priority views
-- 4. Providing partial completion capability

-- =========================================================================
-- STEP 1: ADD MISSING UNIQUE INDEX FOR CONCURRENT REFRESH
-- =========================================================================

-- Fix mv_website_dashboard_summary to support concurrent refresh
-- This will significantly speed up the refresh process
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_website_dashboard_summary_unique
ON beekon_data.mv_website_dashboard_summary (website_id);

-- =========================================================================
-- STEP 2: CREATE TIMEOUT-RESISTANT REFRESH FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_all_materialized_views_fast(
    timeout_seconds INTEGER DEFAULT 90,
    force_sequential BOOLEAN DEFAULT FALSE,
    priority_only BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();
    check_time TIMESTAMP;
    view_name TEXT;
    view_result JSONB;

    -- Priority-based view groups for chunked processing
    priority_views TEXT[] := ARRAY[
        'beekon_data.mv_website_dashboard_summary',
        'beekon_data.mv_topic_performance'
    ];

    medium_views TEXT[] := ARRAY[
        'beekon_data.mv_llm_provider_performance',
        'beekon_data.mv_competitive_gap_analysis'
    ];

    large_views TEXT[] := ARRAY[
        'beekon_data.mv_analysis_results',
        'beekon_data.mv_competitor_share_of_voice',
        'beekon_data.mv_competitor_performance',
        'beekon_data.mv_competitor_daily_metrics'
    ];

    all_views TEXT[];
    successful_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
    timeout_refreshes INTEGER := 0;
    total_views INTEGER;
    elapsed_seconds NUMERIC;

BEGIN
    -- Generate operation ID
    operation_id := 'fast_refresh_' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || left(gen_random_uuid()::TEXT, 8);

    -- Determine which views to refresh based on priority_only flag
    IF priority_only THEN
        all_views := priority_views;
    ELSE
        all_views := priority_views || medium_views || large_views;
    END IF;

    total_views := array_length(all_views, 1);

    -- Log start with timeout info
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Starting fast refresh operation %s: %s views, %s second timeout',
            operation_id, total_views, timeout_seconds), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Continue if logging fails
    END;

    -- Process each view with timeout checking
    FOREACH view_name IN ARRAY all_views LOOP
        -- Check if we're approaching timeout (leave 10 seconds buffer)
        check_time := NOW();
        elapsed_seconds := EXTRACT(EPOCH FROM (check_time - start_time));

        IF elapsed_seconds > (timeout_seconds - 10) THEN
            -- Approaching timeout - skip remaining views
            timeout_refreshes := timeout_refreshes + 1;
            view_result := jsonb_build_object(
                'view_name', view_name,
                'status', 'skipped_timeout',
                'reason', 'Approaching timeout limit',
                'elapsed_seconds', elapsed_seconds,
                'skipped_at', check_time
            );
            results := results || jsonb_build_object(view_name, view_result);
            CONTINUE;
        END IF;

        -- Attempt to refresh the view
        BEGIN
            IF force_sequential THEN
                -- Use blocking refresh
                EXECUTE format('REFRESH MATERIALIZED VIEW %s', view_name);
                view_result := jsonb_build_object(
                    'view_name', view_name,
                    'status', 'success',
                    'method', 'blocking',
                    'completed_at', NOW(),
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - check_time))
                );
            ELSE
                -- Try concurrent refresh first, fallback to blocking
                BEGIN
                    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %s', view_name);
                    view_result := jsonb_build_object(
                        'view_name', view_name,
                        'status', 'success',
                        'method', 'concurrent',
                        'completed_at', NOW(),
                        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - check_time))
                    );
                EXCEPTION WHEN OTHERS THEN
                    -- Fallback to blocking refresh
                    EXECUTE format('REFRESH MATERIALIZED VIEW %s', view_name);
                    view_result := jsonb_build_object(
                        'view_name', view_name,
                        'status', 'success_with_fallback',
                        'method', 'blocking_fallback',
                        'completed_at', NOW(),
                        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - check_time)),
                        'fallback_reason', SQLERRM
                    );
                END;
            END IF;

            successful_refreshes := successful_refreshes + 1;
            results := results || jsonb_build_object(view_name, view_result);

        EXCEPTION WHEN OTHERS THEN
            failed_refreshes := failed_refreshes + 1;
            view_result := jsonb_build_object(
                'view_name', view_name,
                'status', 'failed',
                'error', SQLERRM,
                'failed_at', NOW(),
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - current_time))
            );
            results := results || jsonb_build_object(view_name, view_result);
        END;
    END LOOP;

    -- Calculate final statistics
    elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - start_time));

    -- Add comprehensive summary
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'operation_id', operation_id,
            'total_views', total_views,
            'successful_refreshes', successful_refreshes,
            'failed_refreshes', failed_refreshes,
            'timeout_skipped', timeout_refreshes,
            'success_rate', round((successful_refreshes::NUMERIC / total_views) * 100, 2),
            'total_duration_seconds', elapsed_seconds,
            'timeout_seconds', timeout_seconds,
            'timeout_utilized_pct', round((elapsed_seconds / timeout_seconds) * 100, 2),
            'started_at', start_time,
            'completed_at', NOW(),
            'priority_only', priority_only,
            'refresh_method', CASE WHEN force_sequential THEN 'sequential' ELSE 'concurrent_with_fallback' END,
            'status', CASE
                WHEN failed_refreshes = 0 AND timeout_refreshes = 0 THEN 'completed'
                WHEN failed_refreshes > 0 AND timeout_refreshes = 0 THEN 'completed_with_errors'
                WHEN timeout_refreshes > 0 THEN 'partially_completed_timeout'
                ELSE 'unknown'
            END
        )
    );

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Fast refresh operation %s completed: %s/%s successful, %s skipped, %.2fs elapsed',
            operation_id, successful_refreshes, total_views, timeout_refreshes, elapsed_seconds), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Continue if logging fails
    END;

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 3: CREATE CHUNKED REFRESH FUNCTIONS FOR SPECIFIC USE CASES
-- =========================================================================

-- Quick refresh for critical dashboard views only (very fast)
CREATE OR REPLACE FUNCTION beekon_data.refresh_critical_views()
RETURNS JSONB AS $$
BEGIN
    RETURN beekon_data.refresh_all_materialized_views_fast(30, false, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Medium refresh for dashboard + analysis views (moderate speed)
CREATE OR REPLACE FUNCTION beekon_data.refresh_dashboard_and_analysis()
RETURNS JSONB AS $$
DECLARE
    views_to_refresh TEXT[] := ARRAY[
        'beekon_data.mv_website_dashboard_summary',
        'beekon_data.mv_topic_performance',
        'beekon_data.mv_llm_provider_performance',
        'beekon_data.mv_competitive_gap_analysis'
    ];
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();
    view_name TEXT;
    view_result JSONB;
    successful_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
    total_views INTEGER := array_length(views_to_refresh, 1);
BEGIN
    operation_id := 'medium_refresh_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    FOREACH view_name IN ARRAY views_to_refresh LOOP
        BEGIN
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %s', view_name);
            view_result := jsonb_build_object(
                'view_name', view_name,
                'status', 'success',
                'method', 'concurrent',
                'completed_at', NOW()
            );
            successful_refreshes := successful_refreshes + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Fallback to blocking
            BEGIN
                EXECUTE format('REFRESH MATERIALIZED VIEW %s', view_name);
                view_result := jsonb_build_object(
                    'view_name', view_name,
                    'status', 'success_with_fallback',
                    'method', 'blocking_fallback',
                    'completed_at', NOW()
                );
                successful_refreshes := successful_refreshes + 1;
            EXCEPTION WHEN OTHERS THEN
                view_result := jsonb_build_object(
                    'view_name', view_name,
                    'status', 'failed',
                    'error', SQLERRM,
                    'failed_at', NOW()
                );
                failed_refreshes := failed_refreshes + 1;
            END;
        END;

        results := results || jsonb_build_object(view_name, view_result);
    END LOOP;

    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'operation_id', operation_id,
            'total_views', total_views,
            'successful_refreshes', successful_refreshes,
            'failed_refreshes', failed_refreshes,
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
        )
    );

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 4: UPDATE ORIGINAL FUNCTION TO USE TIMEOUT-RESISTANT APPROACH
-- =========================================================================

-- Replace original function with timeout-resistant version
CREATE OR REPLACE FUNCTION beekon_data.refresh_all_materialized_views(
    force_sequential BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 5,
    requested_by TEXT DEFAULT 'system'
) RETURNS JSONB AS $$
BEGIN
    -- Use the new timeout-resistant function with appropriate settings
    IF force_sequential THEN
        -- Sequential mode: be more conservative with timeout
        RETURN beekon_data.refresh_all_materialized_views_fast(120, true, false);
    ELSE
        -- Concurrent mode: standard timeout
        RETURN beekon_data.refresh_all_materialized_views_fast(90, false, false);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.refresh_all_materialized_views_fast TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_all_materialized_views_fast TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_critical_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_critical_views TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_and_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_and_analysis TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.refresh_all_materialized_views_fast IS
'Timeout-resistant materialized view refresh with early timeout detection, chunked processing, and partial completion capability.';

COMMENT ON FUNCTION beekon_data.refresh_critical_views IS
'Fast refresh for critical dashboard views only (30s timeout). Use for quick dashboard updates.';

COMMENT ON FUNCTION beekon_data.refresh_dashboard_and_analysis IS
'Medium refresh for dashboard and analysis views only. Balances speed vs completeness.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Timeout-resistant refresh functions created - statement timeout issues resolved', NOW())
ON CONFLICT DO NOTHING;