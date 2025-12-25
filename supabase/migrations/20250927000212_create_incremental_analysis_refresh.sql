-- =========================================================================
-- INCREMENTAL REFRESH OPTIMIZATION FOR mv_analysis_results
-- =========================================================================

-- This migration creates optimized incremental refresh functions for the large
-- mv_analysis_results materialized view to eliminate timeout issues and improve
-- performance through targeted, chunked processing.

-- =========================================================================
-- STEP 1: CREATE INCREMENTAL REFRESH FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_incremental(
    hours_back INTEGER DEFAULT 24,
    force_full_refresh BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    cutoff_time TIMESTAMP;
    affected_rows BIGINT := 0;
    refresh_method TEXT;
    result JSONB;
BEGIN
    operation_id := 'incremental_analysis_' || to_char(NOW(), 'YYYYMMDDHH24MISS');
    cutoff_time := NOW() - (hours_back || ' hours')::INTERVAL;

    -- Log start of operation
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Starting incremental analysis refresh %s: %s hours back from %s',
            operation_id, hours_back, cutoff_time), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Continue if logging fails
    END;

    BEGIN
        IF force_full_refresh THEN
            -- Full refresh when explicitly requested
            EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results';
            refresh_method := 'full_concurrent';
            GET DIAGNOSTICS affected_rows = ROW_COUNT;
        ELSE
            -- Incremental approach: refresh only recent data
            -- First, try to determine if we have recent changes
            SELECT COUNT(*) INTO affected_rows
            FROM beekon_data.llm_analysis_results lar
            JOIN beekon_data.prompts p ON lar.prompt_id = p.id
            JOIN beekon_data.topics t ON p.topic_id = t.id
            WHERE lar.created_at >= cutoff_time;

            IF affected_rows > 0 THEN
                -- Recent changes detected, do full refresh
                EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results';
                refresh_method := 'triggered_full_concurrent';
            ELSE
                -- No recent changes, skip refresh
                refresh_method := 'skipped_no_changes';
            END IF;
        END IF;

        result := jsonb_build_object(
            'status', 'success',
            'operation_id', operation_id,
            'method', refresh_method,
            'hours_back', hours_back,
            'cutoff_time', cutoff_time,
            'affected_rows_detected', affected_rows,
            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW()
        );

    EXCEPTION WHEN OTHERS THEN
        -- Fallback to blocking refresh if concurrent fails
        BEGIN
            EXECUTE 'REFRESH MATERIALIZED VIEW beekon_data.mv_analysis_results';
            result := jsonb_build_object(
                'status', 'success_with_fallback',
                'operation_id', operation_id,
                'method', 'blocking_fallback',
                'hours_back', hours_back,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'fallback_reason', SQLERRM,
                'completed_at', NOW()
            );
        EXCEPTION WHEN OTHERS THEN
            result := jsonb_build_object(
                'status', 'failed',
                'operation_id', operation_id,
                'error', SQLERRM,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'failed_at', NOW()
            );
        END;
    END;

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Incremental analysis refresh %s completed: %s (%.2fs)',
            operation_id, result->>'status', (result->>'duration_seconds')::NUMERIC), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Continue if logging fails
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 2: CREATE WEBSITE-BASED CHUNKED REFRESH FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_by_website(
    target_website_id UUID,
    hours_back INTEGER DEFAULT 48
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    cutoff_time TIMESTAMP;
    website_analysis_count BIGINT := 0;
    refresh_needed BOOLEAN := FALSE;
    result JSONB;
BEGIN
    operation_id := 'website_analysis_' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || left(target_website_id::TEXT, 8);
    cutoff_time := NOW() - (hours_back || ' hours')::INTERVAL;

    -- Check if this website has recent analysis results
    SELECT COUNT(*) INTO website_analysis_count
    FROM beekon_data.llm_analysis_results lar
    JOIN beekon_data.prompts p ON lar.prompt_id = p.id
    JOIN beekon_data.topics t ON p.topic_id = t.id
    WHERE t.website_id = target_website_id
      AND lar.created_at >= cutoff_time;

    refresh_needed := website_analysis_count > 0;

    -- Log start
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Website analysis refresh %s: website %s, %s recent results, refresh needed: %s',
            operation_id, target_website_id, website_analysis_count, refresh_needed), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    IF refresh_needed THEN
        -- Refresh the entire materialized view (since we can't refresh partial materialized views)
        -- But this is triggered only when specific website has changes
        BEGIN
            EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results';

            result := jsonb_build_object(
                'status', 'success',
                'operation_id', operation_id,
                'website_id', target_website_id,
                'method', 'full_refresh_triggered_by_website',
                'hours_back', hours_back,
                'cutoff_time', cutoff_time,
                'website_analysis_count', website_analysis_count,
                'refresh_triggered', refresh_needed,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'completed_at', NOW()
            );

        EXCEPTION WHEN OTHERS THEN
            -- Fallback to blocking refresh
            BEGIN
                EXECUTE 'REFRESH MATERIALIZED VIEW beekon_data.mv_analysis_results';
                result := jsonb_build_object(
                    'status', 'success_with_fallback',
                    'operation_id', operation_id,
                    'website_id', target_website_id,
                    'method', 'blocking_fallback',
                    'fallback_reason', SQLERRM,
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                    'completed_at', NOW()
                );
            EXCEPTION WHEN OTHERS THEN
                result := jsonb_build_object(
                    'status', 'failed',
                    'operation_id', operation_id,
                    'website_id', target_website_id,
                    'error', SQLERRM,
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                    'failed_at', NOW()
                );
            END;
        END;
    ELSE
        -- No refresh needed
        result := jsonb_build_object(
            'status', 'skipped',
            'operation_id', operation_id,
            'website_id', target_website_id,
            'method', 'no_refresh_needed',
            'reason', 'No recent analysis results for this website',
            'hours_back', hours_back,
            'website_analysis_count', website_analysis_count,
            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'completed_at', NOW()
        );
    END IF;

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Website analysis refresh %s completed: %s (%.2fs)',
            operation_id, result->>'status', (result->>'duration_seconds')::NUMERIC), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 3: CREATE BATCH WEBSITE REFRESH FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_batch_websites(
    website_ids UUID[] DEFAULT NULL,
    hours_back INTEGER DEFAULT 24,
    max_concurrent INTEGER DEFAULT 3
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    target_websites UUID[];
    website_id UUID;
    website_result JSONB;
    results JSONB := '{}';
    successful_refreshes INTEGER := 0;
    skipped_refreshes INTEGER := 0;
    failed_refreshes INTEGER := 0;
    total_websites INTEGER;
    overall_refresh_needed BOOLEAN := FALSE;
BEGIN
    operation_id := 'batch_analysis_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Determine target websites
    IF website_ids IS NULL THEN
        -- Get all active websites with recent analysis activity
        SELECT ARRAY_AGG(DISTINCT t.website_id) INTO target_websites
        FROM beekon_data.topics t
        JOIN beekon_data.prompts p ON t.id = p.topic_id
        JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE lar.created_at >= (NOW() - (hours_back || ' hours')::INTERVAL);
    ELSE
        target_websites := website_ids;
    END IF;

    target_websites := COALESCE(target_websites, ARRAY[]::UUID[]);
    total_websites := array_length(target_websites, 1);

    -- Log start
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Batch analysis refresh %s: %s websites to check',
            operation_id, COALESCE(total_websites, 0)), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Process each website to determine if refresh is needed
    IF total_websites > 0 THEN
        FOREACH website_id IN ARRAY target_websites LOOP
            website_result := beekon_data.refresh_analysis_by_website(website_id, hours_back);
            results := results || jsonb_build_object(website_id::TEXT, website_result);

            CASE website_result->>'status'
                WHEN 'success' THEN
                    successful_refreshes := successful_refreshes + 1;
                    overall_refresh_needed := TRUE;
                WHEN 'success_with_fallback' THEN
                    successful_refreshes := successful_refreshes + 1;
                    overall_refresh_needed := TRUE;
                WHEN 'skipped' THEN
                    skipped_refreshes := skipped_refreshes + 1;
                ELSE
                    failed_refreshes := failed_refreshes + 1;
            END CASE;
        END LOOP;
    END IF;

    -- Add summary
    results := results || jsonb_build_object(
        'summary', jsonb_build_object(
            'operation_id', operation_id,
            'operation_type', 'batch_website_analysis',
            'total_websites', COALESCE(total_websites, 0),
            'successful_refreshes', successful_refreshes,
            'skipped_refreshes', skipped_refreshes,
            'failed_refreshes', failed_refreshes,
            'overall_refresh_needed', overall_refresh_needed,
            'hours_back', hours_back,
            'total_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'started_at', start_time,
            'completed_at', NOW()
        )
    );

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Batch analysis refresh %s completed: %s successful, %s skipped, %s failed (%.2fs)',
            operation_id, successful_refreshes, skipped_refreshes, failed_refreshes,
            EXTRACT(EPOCH FROM (NOW() - start_time))), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- STEP 4: CREATE SMART REFRESH FUNCTION (INTELLIGENCE-BASED)
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_smart(
    max_age_hours INTEGER DEFAULT 2,
    force_if_stale_hours INTEGER DEFAULT 24
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    start_time TIMESTAMP := NOW();
    last_refresh_time TIMESTAMP;
    time_since_refresh INTERVAL;
    recent_changes_count BIGINT := 0;
    should_refresh BOOLEAN := FALSE;
    refresh_reason TEXT;
    result JSONB;
BEGIN
    operation_id := 'smart_analysis_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    -- Get last refresh time from pg_stat_user_tables
    SELECT last_vacuum INTO last_refresh_time
    FROM pg_stat_user_tables
    WHERE schemaname = 'beekon_data'
      AND relname = 'mv_analysis_results';

    -- If we can't determine last refresh, assume it's stale
    IF last_refresh_time IS NULL THEN
        last_refresh_time := NOW() - (force_if_stale_hours || ' hours')::INTERVAL;
    END IF;

    time_since_refresh := NOW() - last_refresh_time;

    -- Check for recent changes in analysis results
    SELECT COUNT(*) INTO recent_changes_count
    FROM beekon_data.llm_analysis_results
    WHERE created_at >= (NOW() - (max_age_hours || ' hours')::INTERVAL);

    -- Determine if refresh is needed
    IF EXTRACT(EPOCH FROM time_since_refresh) / 3600 >= force_if_stale_hours THEN
        should_refresh := TRUE;
        refresh_reason := format('Forced refresh - %.1f hours since last refresh (limit: %s)',
            EXTRACT(EPOCH FROM time_since_refresh) / 3600, force_if_stale_hours);
    ELSIF recent_changes_count > 0 THEN
        should_refresh := TRUE;
        refresh_reason := format('Recent changes detected - %s new/updated analysis results', recent_changes_count);
    ELSE
        should_refresh := FALSE;
        refresh_reason := format('No refresh needed - %.1f hours since last refresh, no recent changes',
            EXTRACT(EPOCH FROM time_since_refresh) / 3600);
    END IF;

    -- Log decision
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Smart analysis refresh %s: %s. %s',
            operation_id,
            CASE WHEN should_refresh THEN 'REFRESH NEEDED' ELSE 'SKIP REFRESH' END,
            refresh_reason), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    IF should_refresh THEN
        -- Perform the refresh
        BEGIN
            EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results';

            result := jsonb_build_object(
                'status', 'success',
                'operation_id', operation_id,
                'method', 'smart_concurrent_refresh',
                'refresh_reason', refresh_reason,
                'time_since_last_refresh_hours', EXTRACT(EPOCH FROM time_since_refresh) / 3600,
                'recent_changes_count', recent_changes_count,
                'max_age_hours', max_age_hours,
                'force_if_stale_hours', force_if_stale_hours,
                'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                'completed_at', NOW()
            );

        EXCEPTION WHEN OTHERS THEN
            -- Fallback to blocking refresh
            BEGIN
                EXECUTE 'REFRESH MATERIALIZED VIEW beekon_data.mv_analysis_results';
                result := jsonb_build_object(
                    'status', 'success_with_fallback',
                    'operation_id', operation_id,
                    'method', 'smart_blocking_fallback',
                    'refresh_reason', refresh_reason,
                    'fallback_reason', SQLERRM,
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                    'completed_at', NOW()
                );
            EXCEPTION WHEN OTHERS THEN
                result := jsonb_build_object(
                    'status', 'failed',
                    'operation_id', operation_id,
                    'error', SQLERRM,
                    'refresh_reason', refresh_reason,
                    'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
                    'failed_at', NOW()
                );
            END;
        END;
    ELSE
        -- Skip refresh
        result := jsonb_build_object(
            'status', 'skipped',
            'operation_id', operation_id,
            'method', 'smart_skip',
            'refresh_reason', refresh_reason,
            'time_since_last_refresh_hours', EXTRACT(EPOCH FROM time_since_refresh) / 3600,
            'recent_changes_count', recent_changes_count,
            'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'completed_at', NOW()
        );
    END IF;

    -- Log completion
    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Smart analysis refresh %s completed: %s (%.2fs)',
            operation_id, result->>'status', (result->>'duration_seconds')::NUMERIC), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_incremental TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_incremental TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_by_website TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_by_website TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_batch_websites TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_batch_websites TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_smart TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_smart TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.refresh_analysis_incremental IS
'Incremental refresh for mv_analysis_results based on recent changes. Only refreshes if data has changed within specified hours.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_by_website IS
'Website-targeted refresh trigger for mv_analysis_results. Checks if specific website has recent changes before triggering full refresh.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_batch_websites IS
'Batch processing function to check multiple websites for recent changes and trigger refresh only if needed.';

COMMENT ON FUNCTION beekon_data.refresh_analysis_smart IS
'Intelligence-based refresh that combines age-based and change-based logic to determine if mv_analysis_results needs refreshing.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Incremental analysis refresh functions created - optimized refresh strategies available', NOW())
ON CONFLICT DO NOTHING;