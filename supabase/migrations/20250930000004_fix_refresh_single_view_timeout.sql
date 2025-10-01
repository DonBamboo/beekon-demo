-- =========================================================================
-- FIX TIMEOUT ISSUE IN refresh_single_view FUNCTION
-- =========================================================================
--
-- This migration fixes the statement timeout issue that affects ALL materialized
-- view refresh functions by adding a timeout override to refresh_single_view().
--
-- Problem: refresh_single_view() is called by refresh_analysis_atomic() and other
-- functions, but it doesn't override the 2-minute statement timeout, causing
-- large views like mv_analysis_results (79 MB, 10K+ rows) to timeout.
--
-- Solution: Add SET LOCAL statement_timeout at the start of the function to
-- allow up to 10 minutes for large view refreshes.
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_single_view(
    view_name text,
    use_concurrent boolean DEFAULT true
) RETURNS jsonb AS $$
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

    -- CRITICAL FIX: Override statement timeout to prevent timeouts on large views
    -- This allows up to 10 minutes for complex materialized view refreshes
    SET LOCAL statement_timeout = '10min';

    BEGIN
        IF use_concurrent THEN
            -- Try concurrent refresh first (non-blocking, allows reads)
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
                    'error_detail', SQLSTATE,
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                    'failed_at', NOW()
                );
            END;
        ELSE
            RETURN jsonb_build_object(
                'status', 'failed',
                'view_name', view_name,
                'error', SQLERRM,
                'error_detail', SQLSTATE,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'failed_at', NOW()
            );
        END IF;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- ADD HELPFUL COMMENT
-- =========================================================================

COMMENT ON FUNCTION beekon_data.refresh_single_view IS
'Refreshes a single materialized view with timeout override (10 minutes).
Supports both CONCURRENT (non-blocking) and blocking refresh modes.
Includes automatic fallback from concurrent to blocking if needed.
FIXED: Now includes statement_timeout override to prevent timeouts on large views.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, source, created_at)
VALUES (
    'INFO',
    'Fixed refresh_single_view function with 10-minute timeout override',
    'migration_20250930000004',
    NOW()
)
ON CONFLICT DO NOTHING;
