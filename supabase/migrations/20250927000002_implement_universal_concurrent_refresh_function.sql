-- =========================================================================
-- PHASE 2: UNIVERSAL CONCURRENT REFRESH FUNCTION WITH ROBUST RETRY LOGIC
-- =========================================================================

-- Universal function for safely refreshing materialized views with concurrent support,
-- retry mechanisms, and intelligent fallback strategies

CREATE OR REPLACE FUNCTION beekon_data.refresh_materialized_view_concurrent(
    view_name TEXT,
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 5
) RETURNS JSONB AS $$
DECLARE
    retry_count INTEGER := 0;
    refresh_successful BOOLEAN := FALSE;
    start_time TIMESTAMP := NOW();
    error_details TEXT;
    result JSONB;
BEGIN
    -- Validate view exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews
        WHERE schemaname||'.'||matviewname = view_name
    ) THEN
        RAISE EXCEPTION 'Materialized view % does not exist', view_name;
    END IF;

    WHILE retry_count < max_retries AND NOT refresh_successful LOOP
        BEGIN
            -- Attempt concurrent refresh
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);
            refresh_successful := TRUE;

            -- Build success result
            result := jsonb_build_object(
                'view_name', view_name,
                'status', 'success',
                'method', 'concurrent',
                'attempt', retry_count + 1,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'completed_at', NOW()
            );

            -- Log success
            INSERT INTO beekon_data.system_logs (log_level, message, created_at)
            VALUES ('INFO', format('Successfully refreshed materialized view %s concurrently (attempt %s)', view_name, retry_count + 1), NOW())
            ON CONFLICT DO NOTHING;

        EXCEPTION
            WHEN OTHERS THEN
                retry_count := retry_count + 1;
                error_details := SQLERRM;

                -- Log the error with details
                INSERT INTO beekon_data.system_logs (log_level, message, created_at)
                VALUES ('WARN', format('Concurrent refresh failed for %s (attempt %s/%s): %s', view_name, retry_count, max_retries, error_details), NOW())
                ON CONFLICT DO NOTHING;

                IF retry_count < max_retries THEN
                    -- Wait before retry with exponential backoff
                    PERFORM pg_sleep(retry_delay_seconds * retry_count);
                ELSE
                    -- Final fallback to blocking refresh with warning
                    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
                    VALUES ('WARN', format('Falling back to blocking refresh for %s after %s failed concurrent attempts', view_name, max_retries), NOW())
                    ON CONFLICT DO NOTHING;

                    BEGIN
                        EXECUTE format('REFRESH MATERIALIZED VIEW %I', view_name);
                        refresh_successful := TRUE;

                        -- Build fallback success result
                        result := jsonb_build_object(
                            'view_name', view_name,
                            'status', 'success_with_fallback',
                            'method', 'blocking',
                            'concurrent_attempts', max_retries,
                            'fallback_reason', error_details,
                            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                            'completed_at', NOW()
                        );

                    EXCEPTION WHEN OTHERS THEN
                        -- Complete failure
                        result := jsonb_build_object(
                            'view_name', view_name,
                            'status', 'failed',
                            'method', 'both_concurrent_and_blocking_failed',
                            'concurrent_attempts', max_retries,
                            'blocking_error', SQLERRM,
                            'concurrent_error', error_details,
                            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                            'failed_at', NOW()
                        );

                        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
                        VALUES ('ERROR', format('Complete refresh failure for %s: concurrent failed (%s), blocking failed (%s)', view_name, error_details, SQLERRM), NOW())
                        ON CONFLICT DO NOTHING;

                        refresh_successful := FALSE;
                    END;
                END IF;
        END;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION beekon_data.refresh_materialized_view_concurrent TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_materialized_view_concurrent TO service_role;

-- Add helpful comment
COMMENT ON FUNCTION beekon_data.refresh_materialized_view_concurrent IS
'Universal function for refreshing materialized views with concurrent support, retry logic, and intelligent fallback to blocking refresh if needed. Returns detailed JSONB result with status and timing information.';

-- =========================================================================
-- HELPER FUNCTION: CHECK IF VIEW SUPPORTS CONCURRENT REFRESH
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.can_refresh_concurrently(view_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    has_unique_index BOOLEAN := FALSE;
BEGIN
    -- Check if the materialized view has a unique index
    SELECT EXISTS (
        SELECT 1
        FROM pg_indexes i
        JOIN pg_matviews mv ON i.tablename = mv.matviewname
        WHERE mv.schemaname||'.'||mv.matviewname = view_name
        AND i.schemaname = split_part(view_name, '.', 1)
        AND i.indexdef LIKE '%UNIQUE%'
    ) INTO has_unique_index;

    RETURN has_unique_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION beekon_data.can_refresh_concurrently TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.can_refresh_concurrently TO service_role;

COMMENT ON FUNCTION beekon_data.can_refresh_concurrently IS
'Checks if a materialized view has the required unique index for concurrent refresh operations.';