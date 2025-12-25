-- STEP 6: MAIN ATOMIC ORCHESTRATION FUNCTION

CREATE OR REPLACE FUNCTION beekon_data.refresh_all_materialized_views(
    force_sequential BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 5,
    requested_by TEXT DEFAULT 'system'
) RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    results JSONB := '{}';
    start_time TIMESTAMP := NOW();
    dashboard_result JSONB;
    topics_result JSONB;
    llm_result JSONB;
    analysis_result JSONB;
    competitors_result JSONB;
    successful_operations INTEGER := 0;
    failed_operations INTEGER := 0;
BEGIN
    operation_id := 'atomic_all_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Starting atomic refresh operation %s', operation_id), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Execute atomic refreshes in sequence
    BEGIN
        dashboard_result := beekon_data.refresh_dashboard_atomic();
        results := results || jsonb_build_object('dashboard', dashboard_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        dashboard_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('dashboard', dashboard_result);
        failed_operations := failed_operations + 1;
    END;

    BEGIN
        topics_result := beekon_data.refresh_topics_atomic();
        results := results || jsonb_build_object('topics', topics_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        topics_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('topics', topics_result);
        failed_operations := failed_operations + 1;
    END;

    BEGIN
        llm_result := beekon_data.refresh_llm_atomic();
        results := results || jsonb_build_object('llm', llm_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        llm_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('llm', llm_result);
        failed_operations := failed_operations + 1;
    END;

    BEGIN
        competitors_result := beekon_data.refresh_competitors_atomic();
        results := results || jsonb_build_object('competitors', competitors_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        competitors_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('competitors', competitors_result);
        failed_operations := failed_operations + 1;
    END;

    BEGIN
        analysis_result := beekon_data.refresh_analysis_atomic();
        results := results || jsonb_build_object('analysis', analysis_result);
        successful_operations := successful_operations + 1;
    EXCEPTION WHEN OTHERS THEN
        analysis_result := jsonb_build_object('status', 'failed', 'error', SQLERRM);
        results := results || jsonb_build_object('analysis', analysis_result);
        failed_operations := failed_operations + 1;
    END;

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

    BEGIN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', format('Atomic refresh operation %s completed: %s/%s successful (%.2fs)',
            operation_id, successful_operations, 5, EXTRACT(EPOCH FROM (NOW() - start_time))), NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
