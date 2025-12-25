-- =========================================================================
-- ATOMIC REFRESH FUNCTIONS - NO MORE STATEMENT TIMEOUTS (FIXED)
-- =========================================================================

-- STEP 1: SINGLE VIEW ATOMIC REFRESH FUNCTION
CREATE OR REPLACE FUNCTION beekon_data.refresh_single_view(
    view_name TEXT,
    use_concurrent BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP := NOW();
    end_time TIMESTAMP;
    refresh_method TEXT;
BEGIN
    IF view_name NOT LIKE 'beekon_data.mv_%' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'error', 'Invalid view name. Must start with beekon_data.mv_',
            'view_name', view_name
        );
    END IF;

    BEGIN
        IF use_concurrent THEN
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %s', view_name);
            refresh_method := 'concurrent';
        ELSE
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
