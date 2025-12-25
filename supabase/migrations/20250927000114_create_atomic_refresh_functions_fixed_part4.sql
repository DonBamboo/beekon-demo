-- STEP 4: LLM AND ANALYSIS ATOMIC REFRESH FUNCTIONS

DO $do$
BEGIN
    CREATE OR REPLACE FUNCTION beekon_data.refresh_llm_atomic()
    RETURNS JSONB AS $fn$
    DECLARE
        operation_id TEXT;
        result JSONB;
        start_time TIMESTAMP := NOW();
    BEGIN
        operation_id := 'llm_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');
        result := beekon_data.refresh_single_view('beekon_data.mv_llm_provider_performance', true);
        result := result || jsonb_build_object(
            'operation_id', operation_id,
            'operation_type', 'llm_atomic',
            'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
        );
        RETURN result;
    END;
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_atomic()
    RETURNS JSONB AS $fn$
    DECLARE
        operation_id TEXT;
        result JSONB;
        start_time TIMESTAMP := NOW();
    BEGIN
        operation_id := 'analysis_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');
        result := beekon_data.refresh_single_view('beekon_data.mv_analysis_results', true);
        result := result || jsonb_build_object(
            'operation_id', operation_id,
            'operation_type', 'analysis_atomic',
            'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'note', 'This is the largest view and may take 20-40 seconds'
        );
        RETURN result;
    END;
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;
END;
$do$;
