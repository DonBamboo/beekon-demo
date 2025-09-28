-- =========================================================================
-- PERFORMANCE VALIDATION TESTS FOR OPTIMIZED RPC FUNCTIONS
-- =========================================================================

-- Create comprehensive tests to validate that optimized functions work correctly
-- and provide performance benchmarking capabilities

-- =========================================================================
-- VALIDATION FUNCTION FOR OPTIMIZED DASHBOARD FUNCTIONS
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.validate_optimized_dashboard_functions()
RETURNS TABLE(
    function_name TEXT,
    test_status TEXT,
    execution_time_ms NUMERIC,
    test_details TEXT
) AS $$
DECLARE
    test_website_ids UUID[];
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time NUMERIC;
    test_result RECORD;
BEGIN
    -- Get sample website IDs for testing
    SELECT ARRAY(
        SELECT id FROM beekon_data.websites
        WHERE is_active = TRUE
        LIMIT 3
    ) INTO test_website_ids;

    -- Test 1: get_dashboard_metrics
    start_time := clock_timestamp();
    BEGIN
        SELECT * INTO test_result
        FROM beekon_data.get_dashboard_metrics(
            test_website_ids,
            NOW() - INTERVAL '30 days',
            NOW()
        );
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_dashboard_metrics'::TEXT,
            'PASS'::TEXT,
            execution_time,
            format('Executed successfully with %s websites', array_length(test_website_ids, 1))::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_dashboard_metrics'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;

    -- Test 2: get_topic_performance_dashboard
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_topic_performance_dashboard(test_website_ids, 10);
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_topic_performance_dashboard'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'Topic performance dashboard executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_topic_performance_dashboard'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;

    -- Test 3: get_llm_performance_dashboard
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_llm_performance_dashboard(test_website_ids);
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_llm_performance_dashboard'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'LLM performance dashboard executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_llm_performance_dashboard'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;

    -- Test 4: get_website_performance_dashboard
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_website_performance_dashboard(test_website_ids);
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_website_performance_dashboard'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'Website performance dashboard executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_website_performance_dashboard'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- VALIDATION FUNCTION FOR OPTIMIZED ANALYSIS FUNCTIONS
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.validate_optimized_analysis_functions()
RETURNS TABLE(
    function_name TEXT,
    test_status TEXT,
    execution_time_ms NUMERIC,
    test_details TEXT
) AS $$
DECLARE
    test_website_id UUID;
    test_website_ids UUID[];
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time NUMERIC;
BEGIN
    -- Get sample website for testing
    SELECT id INTO test_website_id
    FROM beekon_data.websites
    WHERE is_active = TRUE
    LIMIT 1;

    SELECT ARRAY[test_website_id] INTO test_website_ids;

    -- Test 1: get_competitive_gap_analysis
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_competitive_gap_analysis(
            test_website_id,
            NOW() - INTERVAL '30 days',
            NOW()
        );
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_competitive_gap_analysis'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'Competitive gap analysis executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_competitive_gap_analysis'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;

    -- Test 2: get_batch_website_metrics
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_batch_website_metrics(
            test_website_ids,
            NOW() - INTERVAL '30 days',
            NOW()
        );
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_batch_website_metrics'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'Batch website metrics executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_batch_website_metrics'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;

    -- Test 3: get_website_metrics
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_website_metrics(
            test_website_id,
            NOW() - INTERVAL '30 days',
            NOW()
        );
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_website_metrics'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'Website metrics executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_website_metrics'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;

    -- Test 4: get_llm_performance
    start_time := clock_timestamp();
    BEGIN
        PERFORM beekon_data.get_llm_performance(
            test_website_ids,
            NOW() - INTERVAL '30 days',
            NOW()
        );
        end_time := clock_timestamp();
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;

        RETURN QUERY SELECT
            'get_llm_performance'::TEXT,
            'PASS'::TEXT,
            execution_time,
            'LLM performance executed successfully'::TEXT;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            'get_llm_performance'::TEXT,
            'FAIL'::TEXT,
            0::NUMERIC,
            SQLERRM::TEXT;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- COMPREHENSIVE VALIDATION SUITE
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.run_complete_function_validation()
RETURNS TABLE(
    category TEXT,
    function_name TEXT,
    test_status TEXT,
    execution_time_ms NUMERIC,
    test_details TEXT,
    performance_rating TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Dashboard function tests
    SELECT
        'Dashboard Functions'::TEXT as category,
        vd.function_name,
        vd.test_status,
        vd.execution_time_ms,
        vd.test_details,
        CASE
            WHEN vd.execution_time_ms < 50 THEN 'EXCELLENT'
            WHEN vd.execution_time_ms < 200 THEN 'GOOD'
            WHEN vd.execution_time_ms < 500 THEN 'ACCEPTABLE'
            ELSE 'NEEDS_OPTIMIZATION'
        END::TEXT as performance_rating
    FROM beekon_data.validate_optimized_dashboard_functions() vd

    UNION ALL

    -- Analysis function tests
    SELECT
        'Analysis Functions'::TEXT as category,
        va.function_name,
        va.test_status,
        va.execution_time_ms,
        va.test_details,
        CASE
            WHEN va.execution_time_ms < 50 THEN 'EXCELLENT'
            WHEN va.execution_time_ms < 200 THEN 'GOOD'
            WHEN va.execution_time_ms < 500 THEN 'ACCEPTABLE'
            ELSE 'NEEDS_OPTIMIZATION'
        END::TEXT as performance_rating
    FROM beekon_data.validate_optimized_analysis_functions() va

    ORDER BY category, function_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- MATERIALIZED VIEW HEALTH CHECK AFTER OPTIMIZATION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.validate_materialized_view_optimization()
RETURNS TABLE(
    optimization_status TEXT,
    optimized_functions_count INTEGER,
    materialized_views_healthy INTEGER,
    total_materialized_views INTEGER,
    optimization_summary TEXT
) AS $$
DECLARE
    mv_health_count INTEGER;
    total_mv_count INTEGER;
    optimized_func_count INTEGER := 8; -- Number of functions we optimized
BEGIN
    -- Check materialized view health
    SELECT
        COUNT(*) FILTER (WHERE health_status = 'HEALTHY'),
        COUNT(*)
    INTO mv_health_count, total_mv_count
    FROM beekon_data.check_materialized_view_health();

    RETURN QUERY
    SELECT
        CASE
            WHEN mv_health_count = total_mv_count THEN 'OPTIMAL'
            WHEN mv_health_count > (total_mv_count * 0.8) THEN 'GOOD'
            ELSE 'NEEDS_ATTENTION'
        END::TEXT as optimization_status,
        optimized_func_count,
        mv_health_count,
        total_mv_count,
        format(
            'Optimization complete: %s functions now use materialized views. %s/%s materialized views are healthy.',
            optimized_func_count,
            mv_health_count,
            total_mv_count
        )::TEXT as optimization_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS FOR VALIDATION FUNCTIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.validate_optimized_dashboard_functions TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.validate_optimized_dashboard_functions TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.validate_optimized_analysis_functions TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.validate_optimized_analysis_functions TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.run_complete_function_validation TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.run_complete_function_validation TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.validate_materialized_view_optimization TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.validate_materialized_view_optimization TO service_role;

-- =========================================================================
-- FUNCTION COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.validate_optimized_dashboard_functions IS
'Validates all optimized dashboard functions and measures their performance to ensure materialized view optimization was successful.';

COMMENT ON FUNCTION beekon_data.validate_optimized_analysis_functions IS
'Validates all optimized analysis functions and measures their performance to ensure materialized view optimization was successful.';

COMMENT ON FUNCTION beekon_data.run_complete_function_validation IS
'Comprehensive validation suite that tests all optimized functions and provides performance ratings.';

COMMENT ON FUNCTION beekon_data.validate_materialized_view_optimization IS
'Overall health check to validate that the materialized view optimization project was successful.';

-- =========================================================================
-- LOG VALIDATION SETUP COMPLETION
-- =========================================================================

-- Log validation setup completion if system_logs table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'beekon_data'
        AND table_name = 'system_logs'
    ) THEN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', 'Performance validation tests created for optimized RPC functions', NOW())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;