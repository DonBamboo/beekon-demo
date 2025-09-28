-- =========================================================================
-- PHASE 5: COORDINATED REFRESH SCHEDULING SYSTEM
-- =========================================================================

-- Implement intelligent refresh coordination, scheduling, and parallel execution
-- support for materialized views

-- =========================================================================
-- REFRESH COORDINATION TABLE
-- =========================================================================

-- Table to track and coordinate refresh operations
CREATE TABLE IF NOT EXISTS beekon_data.refresh_coordination (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id TEXT UNIQUE NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('single_view', 'category', 'full_system')),
    views_to_refresh TEXT[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    requested_by TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    configuration JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for the coordination table
CREATE INDEX IF NOT EXISTS idx_refresh_coordination_status ON beekon_data.refresh_coordination (status, priority, requested_at);
CREATE INDEX IF NOT EXISTS idx_refresh_coordination_operation_type ON beekon_data.refresh_coordination (operation_type, status);
CREATE INDEX IF NOT EXISTS idx_refresh_coordination_requested_at ON beekon_data.refresh_coordination (requested_at DESC);

-- =========================================================================
-- COORDINATED REFRESH MASTER FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_all_materialized_views(
    force_sequential BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 5,
    requested_by TEXT DEFAULT 'system'
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();
    coordination_record_id UUID;
    system_health JSONB;
    should_proceed BOOLEAN := TRUE;
    error_message TEXT;
BEGIN
    -- Generate unique operation ID
    operation_id := 'full_refresh_' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || left(gen_random_uuid()::TEXT, 8);

    -- Check system health before proceeding
    SELECT jsonb_agg(to_jsonb(t)) INTO system_health
    FROM beekon_data.check_refresh_system_impact() t
    WHERE threshold_status = 'HIGH';

    -- Decide if we should proceed based on system health
    IF jsonb_array_length(COALESCE(system_health, '[]'::JSONB)) > 0 THEN
        should_proceed := FALSE;
        error_message := 'System health check failed - high load detected';
    END IF;

    -- Create coordination record
    INSERT INTO beekon_data.refresh_coordination (
        operation_id, operation_type, views_to_refresh, priority, requested_by,
        status, configuration, started_at
    ) VALUES (
        operation_id,
        'full_system',
        ARRAY[
            'beekon_data.mv_competitor_share_of_voice',
            'beekon_data.mv_competitive_gap_analysis',
            'beekon_data.mv_competitor_performance',
            'beekon_data.mv_competitor_daily_metrics',
            'beekon_data.mv_analysis_results',
            'beekon_data.mv_topic_performance',
            'beekon_data.mv_llm_provider_performance',
            'beekon_data.mv_website_dashboard_summary'
        ],
        priority,
        requested_by,
        CASE WHEN should_proceed THEN 'in_progress' ELSE 'failed' END,
        jsonb_build_object(
            'force_sequential', force_sequential,
            'system_health_check', system_health
        ),
        CASE WHEN should_proceed THEN NOW() ELSE NULL END
    ) RETURNING id INTO coordination_record_id;

    IF NOT should_proceed THEN
        -- Update record with failure
        UPDATE beekon_data.refresh_coordination
        SET
            status = 'failed',
            error_message = error_message,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = coordination_record_id;

        RETURN jsonb_build_object(
            'operation_id', operation_id,
            'status', 'failed',
            'error', error_message,
            'system_health_issues', system_health
        );
    END IF;

    BEGIN
        IF force_sequential THEN
            -- Sequential refresh for maintenance windows
            results := results || jsonb_build_object('competitor_analysis',
                beekon_data.refresh_competitor_analysis_views());

            results := results || jsonb_build_object('analysis_performance',
                beekon_data.refresh_analysis_performance_views());

            results := results || jsonb_build_object('dashboard',
                beekon_data.refresh_dashboard_performance_views());
        ELSE
            -- Optimized refresh order based on dependencies and size
            -- 1. Start with smaller, independent views
            results := results || jsonb_build_object('dashboard',
                beekon_data.refresh_dashboard_performance_views());

            -- 2. Core analysis views
            results := results || jsonb_build_object('analysis_performance',
                beekon_data.refresh_analysis_performance_views());

            -- 3. Complex competitor views last (largest and most complex)
            results := results || jsonb_build_object('competitor_analysis',
                beekon_data.refresh_competitor_analysis_views());
        END IF;

        -- Calculate summary statistics
        results := results || jsonb_build_object(
            'summary', jsonb_build_object(
                'operation_id', operation_id,
                'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'started_at', start_time,
                'completed_at', NOW(),
                'refresh_method', CASE WHEN force_sequential THEN 'sequential' ELSE 'optimized' END,
                'system_health_at_start', system_health
            )
        );

        -- Update coordination record with success
        UPDATE beekon_data.refresh_coordination
        SET
            status = 'completed',
            completed_at = NOW(),
            results = results,
            updated_at = NOW()
        WHERE id = coordination_record_id;

        -- Log successful completion
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Full system refresh completed successfully: %s (%.2fs)',
            operation_id, EXTRACT(EPOCH FROM (NOW() - start_time))), NOW())
        ON CONFLICT DO NOTHING;

    EXCEPTION WHEN OTHERS THEN
        -- Handle any errors during refresh
        error_message := SQLERRM;

        -- Update coordination record with failure
        UPDATE beekon_data.refresh_coordination
        SET
            status = 'failed',
            error_message = error_message,
            completed_at = NOW(),
            results = results,
            updated_at = NOW()
        WHERE id = coordination_record_id;

        -- Log the error
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('ERROR', format('Full system refresh failed: %s - %s', operation_id, error_message), NOW())
        ON CONFLICT DO NOTHING;

        -- Return error details
        results := results || jsonb_build_object(
            'summary', jsonb_build_object(
                'operation_id', operation_id,
                'status', 'failed',
                'error', error_message,
                'partial_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'failed_at', NOW()
            )
        );
    END;

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- SMART REFRESH SCHEDULER
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.schedule_smart_refresh(
    refresh_category TEXT DEFAULT 'auto',
    delay_seconds INTEGER DEFAULT 0,
    requested_by TEXT DEFAULT 'scheduler'
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    views_to_refresh TEXT[];
    recommendations JSONB;
    should_refresh BOOLEAN := TRUE;
    refresh_priority INTEGER := 5;
    coordination_record_id UUID;
BEGIN
    -- Generate operation ID
    operation_id := refresh_category || '_refresh_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Get intelligent recommendations
    SELECT jsonb_agg(to_jsonb(t)) INTO recommendations
    FROM beekon_data.get_refresh_recommendations() t
    WHERE t.priority <= 2; -- Only high and medium priority recommendations

    -- Determine what to refresh based on category and recommendations
    CASE refresh_category
        WHEN 'auto' THEN
            -- Auto mode: refresh based on recommendations
            SELECT ARRAY_AGG(view_name) INTO views_to_refresh
            FROM beekon_data.get_refresh_recommendations()
            WHERE priority = 1 AND view_name != 'SYSTEM';

            refresh_priority := 3; -- Medium priority for auto refreshes

        WHEN 'competitor' THEN
            views_to_refresh := ARRAY[
                'beekon_data.mv_competitor_share_of_voice',
                'beekon_data.mv_competitive_gap_analysis',
                'beekon_data.mv_competitor_performance',
                'beekon_data.mv_competitor_daily_metrics'
            ];
            refresh_priority := 4;

        WHEN 'analysis' THEN
            views_to_refresh := ARRAY[
                'beekon_data.mv_analysis_results',
                'beekon_data.mv_topic_performance',
                'beekon_data.mv_llm_provider_performance'
            ];
            refresh_priority := 4;

        WHEN 'dashboard' THEN
            views_to_refresh := ARRAY['beekon_data.mv_website_dashboard_summary'];
            refresh_priority := 6; -- Lower priority for dashboard-only

        WHEN 'critical' THEN
            -- Critical: only refresh views that absolutely need it
            SELECT ARRAY_AGG(view_name) INTO views_to_refresh
            FROM beekon_data.get_refresh_recommendations()
            WHERE priority = 1 AND recommendation_type = 'EMPTY_VIEW';

            refresh_priority := 1; -- Highest priority

        ELSE
            -- Unknown category
            should_refresh := FALSE;
    END CASE;

    -- Check if we have anything to refresh
    IF should_refresh AND (views_to_refresh IS NULL OR array_length(views_to_refresh, 1) = 0) THEN
        should_refresh := FALSE;
    END IF;

    -- Create coordination record
    INSERT INTO beekon_data.refresh_coordination (
        operation_id, operation_type, views_to_refresh, priority, requested_by,
        status, configuration
    ) VALUES (
        operation_id,
        'category',
        COALESCE(views_to_refresh, ARRAY[]::TEXT[]),
        refresh_priority,
        requested_by,
        CASE WHEN should_refresh THEN 'pending' ELSE 'cancelled' END,
        jsonb_build_object(
            'refresh_category', refresh_category,
            'delay_seconds', delay_seconds,
            'recommendations', recommendations,
            'scheduled_for', NOW() + INTERVAL '1 second' * delay_seconds
        )
    ) RETURNING id INTO coordination_record_id;

    -- Return scheduling result
    RETURN jsonb_build_object(
        'operation_id', operation_id,
        'coordination_id', coordination_record_id,
        'status', CASE WHEN should_refresh THEN 'scheduled' ELSE 'skipped' END,
        'category', refresh_category,
        'views_to_refresh', COALESCE(views_to_refresh, ARRAY[]::TEXT[]),
        'priority', refresh_priority,
        'delay_seconds', delay_seconds,
        'recommendations', recommendations,
        'scheduled_for', NOW() + INTERVAL '1 second' * delay_seconds
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- REFRESH QUEUE PROCESSOR
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.process_refresh_queue(
    max_operations INTEGER DEFAULT 5
) RETURNS JSONB AS $$
DECLARE
    operation_record RECORD;
    processing_results JSONB := '[]';
    operations_processed INTEGER := 0;
    current_result JSONB;
BEGIN
    -- Process pending operations in priority order
    FOR operation_record IN
        SELECT *
        FROM beekon_data.refresh_coordination
        WHERE status = 'pending'
        AND (configuration->>'scheduled_for')::TIMESTAMP <= NOW()
        ORDER BY priority ASC, requested_at ASC
        LIMIT max_operations
    LOOP
        operations_processed := operations_processed + 1;

        -- Mark as in progress
        UPDATE beekon_data.refresh_coordination
        SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
        WHERE id = operation_record.id;

        -- Process based on operation type
        BEGIN
            CASE operation_record.operation_type
                WHEN 'single_view' THEN
                    -- Process single view refresh
                    IF array_length(operation_record.views_to_refresh, 1) = 1 THEN
                        current_result := beekon_data.refresh_materialized_view_concurrent(
                            operation_record.views_to_refresh[1]
                        );
                    END IF;

                WHEN 'category' THEN
                    -- Process category-based refresh
                    CASE (operation_record.configuration->>'refresh_category')
                        WHEN 'competitor' THEN
                            current_result := beekon_data.refresh_competitor_analysis_views();
                        WHEN 'analysis' THEN
                            current_result := beekon_data.refresh_analysis_performance_views();
                        WHEN 'dashboard' THEN
                            current_result := beekon_data.refresh_dashboard_performance_views();
                        ELSE
                            -- Generic category refresh
                            current_result := jsonb_build_object('status', 'unknown_category');
                    END CASE;

                WHEN 'full_system' THEN
                    -- Full system refresh
                    current_result := beekon_data.refresh_all_materialized_views(
                        COALESCE((operation_record.configuration->>'force_sequential')::BOOLEAN, FALSE),
                        operation_record.priority,
                        operation_record.requested_by
                    );

                ELSE
                    current_result := jsonb_build_object('status', 'unknown_operation_type');
            END CASE;

            -- Update with success
            UPDATE beekon_data.refresh_coordination
            SET
                status = 'completed',
                completed_at = NOW(),
                results = current_result,
                updated_at = NOW()
            WHERE id = operation_record.id;

        EXCEPTION WHEN OTHERS THEN
            -- Update with failure
            UPDATE beekon_data.refresh_coordination
            SET
                status = 'failed',
                error_message = SQLERRM,
                completed_at = NOW(),
                results = jsonb_build_object('error', SQLERRM),
                updated_at = NOW()
            WHERE id = operation_record.id;

            current_result := jsonb_build_object(
                'status', 'failed',
                'error', SQLERRM
            );
        END;

        -- Add to processing results
        processing_results := processing_results || jsonb_build_object(
            'operation_id', operation_record.operation_id,
            'result', current_result
        );
    END LOOP;

    RETURN jsonb_build_object(
        'operations_processed', operations_processed,
        'processing_timestamp', NOW(),
        'results', processing_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- REFRESH QUEUE STATUS AND MANAGEMENT
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_refresh_queue_status()
RETURNS TABLE(
    queue_summary JSONB,
    recent_operations JSONB,
    system_recommendations JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        -- Queue summary
        (SELECT jsonb_build_object(
            'pending_operations', COUNT(*) FILTER (WHERE status = 'pending'),
            'in_progress_operations', COUNT(*) FILTER (WHERE status = 'in_progress'),
            'completed_today', COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE),
            'failed_today', COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= CURRENT_DATE),
            'queue_health', CASE
                WHEN COUNT(*) FILTER (WHERE status = 'pending') > 10 THEN 'BACKLOGGED'
                WHEN COUNT(*) FILTER (WHERE status = 'in_progress') > 3 THEN 'BUSY'
                ELSE 'HEALTHY'
            END
        )
        FROM beekon_data.refresh_coordination
        WHERE created_at >= NOW() - INTERVAL '24 hours') as queue_summary,

        -- Recent operations
        (SELECT jsonb_agg(
            jsonb_build_object(
                'operation_id', operation_id,
                'operation_type', operation_type,
                'status', status,
                'priority', priority,
                'requested_at', requested_at,
                'duration_seconds', EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - COALESCE(started_at, requested_at)))
            ) ORDER BY requested_at DESC
        )
        FROM beekon_data.refresh_coordination
        WHERE created_at >= NOW() - INTERVAL '6 hours'
        LIMIT 20) as recent_operations,

        -- System recommendations
        (SELECT jsonb_agg(to_jsonb(t))
        FROM beekon_data.get_refresh_recommendations() t
        WHERE t.priority <= 2) as system_recommendations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS AND ADD COMMENTS
-- =========================================================================

-- Grant permissions for coordination functions
GRANT SELECT, INSERT, UPDATE ON beekon_data.refresh_coordination TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.refresh_coordination TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_all_materialized_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_all_materialized_views TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.schedule_smart_refresh TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.schedule_smart_refresh TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.process_refresh_queue TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.process_refresh_queue TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_refresh_queue_status TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_refresh_queue_status TO service_role;

-- Add helpful comments
COMMENT ON TABLE beekon_data.refresh_coordination IS
'Coordination table for tracking and managing materialized view refresh operations with priority and scheduling support.';

COMMENT ON FUNCTION beekon_data.refresh_all_materialized_views IS
'Coordinated refresh of all materialized views with intelligent ordering and health checks.';

COMMENT ON FUNCTION beekon_data.schedule_smart_refresh IS
'Intelligent refresh scheduler that determines what to refresh based on recommendations and system health.';

COMMENT ON FUNCTION beekon_data.process_refresh_queue IS
'Queue processor that executes pending refresh operations in priority order.';

COMMENT ON FUNCTION beekon_data.get_refresh_queue_status IS
'Returns comprehensive status of the refresh queue including recent operations and recommendations.';