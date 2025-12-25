-- STEP 5: COMPETITORS AND CRITICAL REFRESH FUNCTIONS

DO $do$
BEGIN
    CREATE OR REPLACE FUNCTION beekon_data.refresh_competitors_atomic()
    RETURNS JSONB AS $fn$
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

        FOREACH view_name IN ARRAY views_to_refresh LOOP
            view_result := beekon_data.refresh_single_view(view_name, true);
            results := results || jsonb_build_object(view_name, view_result);

            IF (view_result->>'status') IN ('success', 'success_with_fallback') THEN
                successful_refreshes := successful_refreshes + 1;
            ELSE
                failed_refreshes := failed_refreshes + 1;
            END IF;
        END LOOP;

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
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION beekon_data.refresh_critical_only()
    RETURNS JSONB AS $fn$
    DECLARE
        operation_id TEXT;
        results JSONB := '{}';
        start_time TIMESTAMP := NOW();
        dashboard_result JSONB;
        topics_result JSONB;
    BEGIN
        operation_id := 'critical_only_' || to_char(NOW(), 'YYYYMMDDHH24MISS');

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
    $fn$ LANGUAGE plpgsql SECURITY DEFINER;
END;
$do$
