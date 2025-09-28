-- =========================================================================
-- PHASE 3: UPDATE ALL EXISTING REFRESH FUNCTIONS TO USE CONCURRENT APPROACH
-- =========================================================================

-- Replace all existing refresh functions with enhanced versions that use
-- the new universal concurrent refresh function

-- =========================================================================
-- ENHANCED COMPETITOR ANALYSIS REFRESH FUNCTION
-- =========================================================================

-- Drop existing function if it exists with different return type
DROP FUNCTION IF EXISTS beekon_data.refresh_competitor_analysis_views();

CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_analysis_views()
RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    results JSONB := '{}';
    view_name TEXT;
    views_to_refresh TEXT[] := ARRAY[
        'beekon_data.mv_competitor_share_of_voice',
        'beekon_data.mv_competitive_gap_analysis',
        'beekon_data.mv_competitor_performance',
        'beekon_data.mv_competitor_daily_metrics'
    ];
    view_result JSONB;
    total_views INTEGER := array_length(views_to_refresh, 1);
    successful_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
BEGIN
    -- Log start
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', format('Starting competitor analysis views refresh for %s views', total_views), NOW())
    ON CONFLICT DO NOTHING;

    -- Refresh each view with the universal concurrent function
    FOREACH view_name IN ARRAY views_to_refresh LOOP
        BEGIN
            view_result := beekon_data.refresh_materialized_view_concurrent(view_name, 3, 5);
            results := results || jsonb_build_object(view_name, view_result);

            -- Count successes
            IF (view_result->>'status') IN ('success', 'success_with_fallback') THEN
                successful_refreshes := successful_refreshes + 1;
            ELSE
                failed_refreshes := failed_refreshes + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            failed_refreshes := failed_refreshes + 1;
            results := results || jsonb_build_object(
                view_name,
                jsonb_build_object(
                    'view_name', view_name,
                    'status', 'error',
                    'error', SQLERRM,
                    'failed_at', NOW()
                )
            );

            INSERT INTO beekon_data.system_logs (log_level, message, created_at)
            VALUES ('ERROR', format('Exception during refresh of %s: %s', view_name, SQLERRM), NOW())
            ON CONFLICT DO NOTHING;
        END;
    END LOOP;

    -- Add summary information
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'total_views', total_views,
            'successful_refreshes', successful_refreshes,
            'failed_refreshes', failed_refreshes,
            'success_rate', round((successful_refreshes::NUMERIC / total_views) * 100, 2),
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW()
        )
    );

    -- Log completion
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', format('Competitor analysis views refresh completed: %s/%s successful in %s seconds',
        successful_refreshes, total_views, EXTRACT(EPOCH FROM (NOW() - start_time))), NOW())
    ON CONFLICT DO NOTHING;

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- ENHANCED ANALYSIS PERFORMANCE REFRESH FUNCTION
-- =========================================================================

-- Drop existing function if it exists with different return type
DROP FUNCTION IF EXISTS beekon_data.refresh_analysis_performance_views();

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_performance_views()
RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    results JSONB := '{}';
    view_name TEXT;
    views_to_refresh TEXT[] := ARRAY[
        'beekon_data.mv_analysis_results',
        'beekon_data.mv_topic_performance',
        'beekon_data.mv_llm_provider_performance'
    ];
    view_result JSONB;
    total_views INTEGER := array_length(views_to_refresh, 1);
    successful_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
BEGIN
    -- Log start
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', format('Starting analysis performance views refresh for %s views', total_views), NOW())
    ON CONFLICT DO NOTHING;

    -- Refresh each view with the universal concurrent function
    FOREACH view_name IN ARRAY views_to_refresh LOOP
        BEGIN
            view_result := beekon_data.refresh_materialized_view_concurrent(view_name, 3, 5);
            results := results || jsonb_build_object(view_name, view_result);

            -- Count successes
            IF (view_result->>'status') IN ('success', 'success_with_fallback') THEN
                successful_refreshes := successful_refreshes + 1;
            ELSE
                failed_refreshes := failed_refreshes + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            failed_refreshes := failed_refreshes + 1;
            results := results || jsonb_build_object(
                view_name,
                jsonb_build_object(
                    'view_name', view_name,
                    'status', 'error',
                    'error', SQLERRM,
                    'failed_at', NOW()
                )
            );
        END;
    END LOOP;

    -- Add summary information
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'total_views', total_views,
            'successful_refreshes', successful_refreshes,
            'failed_refreshes', failed_refreshes,
            'success_rate', round((successful_refreshes::NUMERIC / total_views) * 100, 2),
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW()
        )
    );

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- ENHANCED DASHBOARD PERFORMANCE REFRESH FUNCTION
-- =========================================================================

-- Drop existing function if it exists with different return type
DROP FUNCTION IF EXISTS beekon_data.refresh_dashboard_performance_views();

CREATE OR REPLACE FUNCTION beekon_data.refresh_dashboard_performance_views()
RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    results JSONB := '{}';
    view_result JSONB;
    view_name TEXT := 'beekon_data.mv_website_dashboard_summary';
BEGIN
    -- Log start
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', 'Starting dashboard performance views refresh', NOW())
    ON CONFLICT DO NOTHING;

    -- Refresh the dashboard view
    view_result := beekon_data.refresh_materialized_view_concurrent(view_name, 3, 5);
    results := jsonb_build_object(view_name, view_result);

    -- Add summary information
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'total_views', 1,
            'status', view_result->>'status',
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW()
        )
    );

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- ENHANCED COMPETITOR PERFORMANCE REFRESH FUNCTION
-- =========================================================================

-- Drop existing function if it exists with different return type
DROP FUNCTION IF EXISTS beekon_data.refresh_competitor_performance_views();

CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_performance_views()
RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    results JSONB := '{}';
    view_result JSONB;
    view_name TEXT := 'beekon_data.mv_competitor_share_of_voice';
BEGIN
    -- Log start
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', 'Starting competitor performance views refresh', NOW())
    ON CONFLICT DO NOTHING;

    -- Refresh the competitor performance view
    view_result := beekon_data.refresh_materialized_view_concurrent(view_name, 3, 5);
    results := jsonb_build_object(view_name, view_result);

    -- Add summary information
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'total_views', 1,
            'status', view_result->>'status',
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW()
        )
    );

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- ENHANCED BASIC COMPETITOR VIEWS REFRESH FUNCTION
-- =========================================================================

-- Drop existing function if it exists with different return type
DROP FUNCTION IF EXISTS beekon_data.refresh_competitor_views();

CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_views()
RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    results JSONB := '{}';
    view_name TEXT;
    views_to_refresh TEXT[] := ARRAY[
        'beekon_data.mv_competitor_daily_metrics',
        'beekon_data.mv_competitive_gap_analysis',
        'beekon_data.mv_competitor_share_of_voice',
        'beekon_data.mv_competitor_performance'
    ];
    view_result JSONB;
    total_views INTEGER := array_length(views_to_refresh, 1);
    successful_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
BEGIN
    -- Refresh each view with the universal concurrent function
    FOREACH view_name IN ARRAY views_to_refresh LOOP
        BEGIN
            view_result := beekon_data.refresh_materialized_view_concurrent(view_name, 3, 5);
            results := results || jsonb_build_object(view_name, view_result);

            IF (view_result->>'status') IN ('success', 'success_with_fallback') THEN
                successful_refreshes := successful_refreshes + 1;
            ELSE
                failed_refreshes := failed_refreshes + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            failed_refreshes := failed_refreshes + 1;
        END;
    END LOOP;

    -- Add summary
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
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
-- GRANT PERMISSIONS FOR ALL ENHANCED FUNCTIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_performance_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_performance_views TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_performance_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_performance_views TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_views TO service_role;

-- =========================================================================
-- UPDATE FUNCTION COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.refresh_competitor_analysis_views IS
'Enhanced function to refresh all competitor analysis materialized views using concurrent refresh with retry logic and detailed status reporting.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_performance_views IS
'Enhanced function to refresh all analysis performance materialized views using concurrent refresh with retry logic and detailed status reporting.';

COMMENT ON FUNCTION beekon_data.refresh_dashboard_performance_views IS
'Enhanced function to refresh dashboard materialized views using concurrent refresh with retry logic and detailed status reporting.';

COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS
'Enhanced function to refresh competitor performance materialized views using concurrent refresh with retry logic and detailed status reporting.';

COMMENT ON FUNCTION beekon_data.refresh_competitor_views IS
'Enhanced function to refresh basic competitor materialized views using concurrent refresh with retry logic and detailed status reporting.';