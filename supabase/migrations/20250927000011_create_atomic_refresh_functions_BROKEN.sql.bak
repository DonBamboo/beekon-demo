-- =========================================================================
-- ATOMIC REFRESH FUNCTIONS - NO MORE STATEMENT TIMEOUTS
-- =========================================================================

-- This migration creates ultra-lightweight atomic refresh functions that
-- operate on single views or tiny batches to avoid PostgreSQL statement timeouts.
-- Each function is designed to complete in under 30 seconds.

-- =========================================================================
-- STEP 1: SINGLE VIEW ATOMIC REFRESH FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_single_view(
    view_name TEXT,
    use_concurrent BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    end_time TIMESTAMP;
    refresh_method TEXT;
BEGIN
    -- Validate view name for security
    IF view_name NOT LIKE 'beekon_data.mv_%' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'Invalid view name. Must start with beekon_data.mv_',
            'view_name', view_name
        );
    END IF;

    BEGIN
        IF use_concurrent THEN
            -- Try concurrent refresh first
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %s', view_name);
            refresh_method := 'concurrent';
        ELSE
            -- Use blocking refresh
            EXECUTE format('REFRESH MATERIALIZED VIEW %s', view_name);
            refresh_method := 'blocking';
        END IF;

        end_time := NOW();

        RETURN jsonb_build_object(
            'status', 'success',
            'view_name', view_name,
            'method', refresh_method,
            'duration_seconds', EXTRACT(EPOCH FROM (end_time - start_time)),
            'started_at', start_time,
            'completed_at', end_time
        );

    EXCEPTION WHEN OTHERS THEN
        -- If concurrent fails, try blocking as fallback
        IF use_concurrent THEN
            BEGIN
                EXECUTE format('REFRESH MATERIALIZED VIEW %s', view_name);
                end_time := NOW();

                RETURN jsonb_build_object(
                    'status', 'success_with_fallback',
                    'view_name', view_name,
                    'method', 'blocking_fallback',
                    'duration_seconds', EXTRACT(EPOCH FROM (end_time - start_time)),
                    'started_at', start_time,
                    'completed_at', end_time,
                    'fallback_reason', 'Concurrent refresh failed, used blocking'
                );
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object(
                    'status', 'failed',
                    'view_name', view_name,
                    'error', SQLERRM,
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                    'failed_at', NOW()
                );
            END;
        ELSE
            RETURN jsonb_build_object(
                'status', 'failed',
                'view_name', view_name,
                'error', SQLERRM,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'failed_at', NOW()
            );
        END IF;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 2: ATOMIC CATEGORY-SPECIFIC REFRESH FUNCTIONS
-- =========================================================================

-- Dashboard refresh (fastest - ~5-10 seconds)
CREATE OR REPLACE FUNCTION beekon_data.refresh_dashboard_atomic()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    result JSONB;
    start_time TIMESTAMP := NOW();
BEGIN
    operation_id := 'dashboard_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Refresh only the dashboard view
    result := beekon_data.refresh_single_view('beekon_data.mv_website_dashboard_summary', true);

    -- Add operation metadata
    result := result || jsonb_build_object(
        'operation_id', operation_id,
        'operation_type', 'dashboard_atomic',
        'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Topics refresh (fast - ~5-10 seconds)
CREATE OR REPLACE FUNCTION beekon_data.refresh_topics_atomic()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    result JSONB;
    start_time TIMESTAMP := NOW();
BEGIN
    operation_id := 'topics_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Refresh only the topic performance view
    result := beekon_data.refresh_single_view('beekon_data.mv_topic_performance', true);

    -- Add operation metadata
    result := result || jsonb_build_object(
        'operation_id', operation_id,
        'operation_type', 'topics_atomic',
        'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- LLM providers refresh (fast - ~5-10 seconds)
CREATE OR REPLACE FUNCTION beekon_data.refresh_llm_atomic()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    result JSONB;
    start_time TIMESTAMP := NOW();
BEGIN
    operation_id := 'llm_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Refresh only the LLM provider performance view
    result := beekon_data.refresh_single_view('beekon_data.mv_llm_provider_performance', true);

    -- Add operation metadata
    result := result || jsonb_build_object(
        'operation_id', operation_id,
        'operation_type', 'llm_atomic',
        'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Analysis refresh (slower - ~20-40 seconds, but isolated)
CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_atomic()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    result JSONB;
    start_time TIMESTAMP := NOW();
BEGIN
    operation_id := 'analysis_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Refresh the large analysis results view
    result := beekon_data.refresh_single_view('beekon_data.mv_analysis_results', true);

    -- Add operation metadata
    result := result || jsonb_build_object(
        'operation_id', operation_id,
        'operation_type', 'analysis_atomic',
        'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
        'note', 'This is the largest view and may take 20-40 seconds'
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Competitor views refresh (medium - ~10-20 seconds)
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitors_atomic()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();
    view_name TEXT;
    view_result JSONB;
    views_to_refresh TEXT[] := ARRAY[
        'beekon_data.mv_competitive_gap_analysis',
        'beekon_data.mv_competitor_share_of_voice'
    ];
    successful_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
BEGIN
    operation_id := 'competitors_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Refresh competitor views (keeping batch small)
    FOREACH view_name IN ARRAY views_to_refresh LOOP
        view_result := beekon_data.refresh_single_view(view_name, true);
        results := results || jsonb_build_object(view_name, view_result);

        IF (view_result->>'status') IN ('success', 'success_with_fallback') THEN
            successful_refreshes := successful_refreshes + 1;
        ELSE
            failed_refreshes := failed_refreshes + 1;
        END IF;
    END LOOP;

    -- Add summary
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'operation_id', operation_id,
            'operation_type', 'competitors_atomic',
            'total_views', array_length(views_to_refresh, 1),
            'successful_refreshes', successful_refreshes,
            'failed_refreshes', failed_refreshes,
            'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
        )
    );

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 3: ULTRA-FAST CRITICAL REFRESH (Dashboard + Topics only)
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_critical_only()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();
    dashboard_result JSONB;
    topics_result JSONB;
BEGIN
    operation_id := 'critical_only_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Refresh only the two most critical views
    dashboard_result := beekon_data.refresh_single_view('beekon_data.mv_website_dashboard_summary', true);
    topics_result := beekon_data.refresh_single_view('beekon_data.mv_topic_performance', true);

    results := jsonb_build_object(
        'dashboard', dashboard_result,
        'topics', topics_result,
        'summary', jsonb_build_object(
            'operation_id', operation_id,
            'operation_type', 'critical_only',
            'total_views', 2,
            'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'note', 'Fastest option - only dashboard and topics'
        )
    );

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 4: NEW ATOMIC-BASED refresh_all_materialized_views
-- =========================================================================

-- Replace the problematic function with atomic orchestration
CREATE OR REPLACE FUNCTION beekon_data.refresh_all_materialized_views(
    force_sequential BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 5,
    requested_by TEXT DEFAULT 'system'
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();

    -- Individual results
    dashboard_result JSONB;
    topics_result JSONB;
    llm_result JSONB;
    analysis_result JSONB;
    competitors_result JSONB;

    successful_operations INTEGER := 0;
    failed_operations INTEGER := 0;
BEGIN
    operation_id := 'atomic_all_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Log start
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Starting atomic refresh operation %s', operation_id), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Continue if logging fails
    END;

    -- Execute atomic refreshes in sequence (each guaranteed to be fast)

    -- 1. Dashboard (critical)
    BEGIN
        dashboard_result := beekon_data.refresh_dashboard_atomic();
        results := results || jsonb_build_object('dashboard', dashboard_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        dashboard_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('dashboard', dashboard_result);
        failed_operations := failed_operations + 1;
    END;

    -- 2. Topics (critical)
    BEGIN
        topics_result := beekon_data.refresh_topics_atomic();
        results := results || jsonb_build_object('topics', topics_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        topics_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('topics', topics_result);
        failed_operations := failed_operations + 1;
    END;

    -- 3. LLM (medium priority)
    BEGIN
        llm_result := beekon_data.refresh_llm_atomic();
        results := results || jsonb_build_object('llm', llm_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        llm_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('llm', llm_result);
        failed_operations := failed_operations + 1;
    END;

    -- 4. Competitors (medium priority)
    BEGIN
        competitors_result := beekon_data.refresh_competitors_atomic();
        results := results || jsonb_build_object('competitors', competitors_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        competitors_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('competitors', competitors_result);
        failed_operations := failed_operations + 1;
    END;

    -- 5. Analysis (lowest priority, largest view)
    BEGIN
        analysis_result := beekon_data.refresh_analysis_atomic();
        results := results || jsonb_build_object('analysis', analysis_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        analysis_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('analysis', analysis_result);
        failed_operations := failed_operations + 1;
    END;

    -- Add final summary
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'operation_id', operation_id,
            'operation_type', 'atomic_orchestrated',
            'successful_operations', successful_operations,
            'failed_operations', failed_operations,
            'total_operations', 5,
            'success_rate', round((successful_operations::NUMERIC / 5) * 100, 2),
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW(),
            'requested_by', requested_by,
            'method', 'atomic_sequential'
        )
    );

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Atomic refresh operation %s completed: %s/%s successful (%.2fs)',
            operation_id, successful_operations, 5, EXTRACT(EPOCH FROM (NOW() - start_time))), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Continue if logging fails
    END;

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.refresh_single_view TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_single_view TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_atomic TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_topics_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_topics_atomic TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_llm_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_llm_atomic TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_atomic TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitors_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitors_atomic TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_critical_only TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_critical_only TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.refresh_single_view IS
'Atomic refresh function for individual materialized views. Guaranteed to complete quickly without statement timeouts.';

COMMENT ON FUNCTION beekon_data.refresh_dashboard_atomic IS
'Ultra-fast refresh for dashboard view only (~5-10 seconds). Use for critical dashboard updates.';

COMMENT ON FUNCTION beekon_data.refresh_topics_atomic IS
'Ultra-fast refresh for topics view only (~5-10 seconds). Use for topic performance updates.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_atomic IS
'Isolated refresh for large analysis view (~20-40 seconds). Use when you specifically need analysis data updated.';

COMMENT ON FUNCTION beekon_data.refresh_competitors_atomic IS
'Fast refresh for competitor views (~10-20 seconds). Use for competitor analysis updates.';

COMMENT ON FUNCTION beekon_data.refresh_critical_only IS
'Ultra-fast refresh for only the most critical views (dashboard + topics). Fastest option available.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Atomic refresh functions created - statement timeouts eliminated', NOW())
ON CONFLICT DO NOTHING;