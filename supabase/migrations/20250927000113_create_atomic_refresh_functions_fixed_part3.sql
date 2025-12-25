-- STEP 3: TOPICS ATOMIC REFRESH FUNCTION

CREATE OR REPLACE FUNCTION beekon_data.refresh_topics_atomic()
RETURNS JSONB AS $$
DECLARE
    operation_id TEXT;
    result JSONB;
    start_time TIMESTAMP := NOW();
BEGIN
    operation_id := 'topics_atomic_' || to_char(NOW(), 'YYYYMMDDHH24MISS');
    result := beekon_data.refresh_single_view('beekon_data.mv_topic_performance', true);
    result := result || jsonb_build_object(
        'operation_id', operation_id,
        'operation_type', 'topics_atomic',
        'total_operation_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
