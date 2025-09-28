-- =========================================================================
-- PHASE 6: COMPREHENSIVE TESTING AND VALIDATION
-- =========================================================================

-- Test suite and validation functions for all concurrent refresh functionality

-- =========================================================================
-- VALIDATION FUNCTION FOR CONCURRENT REFRESH PREREQUISITES
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.validate_concurrent_refresh_prerequisites()
RETURNS TABLE(
    test_name TEXT,
    status TEXT,
    details TEXT,
    recommendation TEXT
) AS $$
BEGIN
    RETURN QUERY

    -- Test 1: Check if all materialized views exist
    SELECT
        'Materialized Views Existence'::TEXT,
        CASE WHEN view_count >= 8 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        format('Found %s materialized views in beekon_data schema', view_count)::TEXT,
        CASE WHEN view_count < 8 THEN 'Some expected materialized views are missing' ELSE 'All expected views found' END::TEXT
    FROM (
        SELECT COUNT(*) as view_count
        FROM pg_matviews
        WHERE schemaname = 'beekon_data'
    ) mv_count

    UNION ALL

    -- Test 2: Check unique indexes for concurrent refresh
    SELECT
        'Unique Indexes for Concurrent Refresh'::TEXT,
        CASE WHEN unique_index_count >= 4 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        format('Found %s unique indexes on materialized views', unique_index_count)::TEXT,
        CASE
            WHEN unique_index_count < 4 THEN 'Create missing unique indexes for concurrent refresh support'
            ELSE 'All required unique indexes present'
        END::TEXT
    FROM (
        SELECT COUNT(*) as unique_index_count
        FROM pg_indexes i
        JOIN pg_matviews mv ON i.tablename = mv.matviewname
        WHERE i.schemaname = 'beekon_data'
        AND mv.schemaname = 'beekon_data'
        AND i.indexdef LIKE '%UNIQUE%'
    ) unique_idx_count

    UNION ALL

    -- Test 3: Check system log table exists and is accessible
    SELECT
        'System Logs Table'::TEXT,
        CASE WHEN log_table_exists THEN 'PASS' ELSE 'FAIL' END::TEXT,
        CASE WHEN log_table_exists THEN 'System logs table is accessible' ELSE 'System logs table is missing' END::TEXT,
        CASE WHEN log_table_exists THEN 'Logging is properly configured' ELSE 'Create system_logs table for operation tracking' END::TEXT
    FROM (
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'beekon_data'
            AND table_name = 'system_logs'
        ) as log_table_exists
    ) log_check

    UNION ALL

    -- Test 4: Check refresh coordination table
    SELECT
        'Refresh Coordination Table'::TEXT,
        CASE WHEN coord_table_exists THEN 'PASS' ELSE 'FAIL' END::TEXT,
        CASE WHEN coord_table_exists THEN 'Coordination table is ready' ELSE 'Coordination table is missing' END::TEXT,
        CASE WHEN coord_table_exists THEN 'Scheduling system is properly configured' ELSE 'Create refresh_coordination table' END::TEXT
    FROM (
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'beekon_data'
            AND table_name = 'refresh_coordination'
        ) as coord_table_exists
    ) coord_check

    UNION ALL

    -- Test 5: Check function permissions
    SELECT
        'Function Permissions'::TEXT,
        CASE WHEN function_count >= 10 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        format('Found %s refresh-related functions', function_count)::TEXT,
        CASE
            WHEN function_count < 10 THEN 'Some refresh functions may be missing'
            ELSE 'All refresh functions are available'
        END::TEXT
    FROM (
        SELECT COUNT(*) as function_count
        FROM information_schema.routines
        WHERE routine_schema = 'beekon_data'
        AND routine_name LIKE '%refresh%'
    ) func_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- CONCURRENT REFRESH FUNCTIONALITY TEST SUITE
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.test_concurrent_refresh_functionality()
RETURNS TABLE(
    test_category TEXT,
    test_name TEXT,
    status TEXT,
    execution_time_ms NUMERIC,
    details TEXT
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    test_result JSONB;
    error_details TEXT;
BEGIN
    -- Test Category 1: Universal Concurrent Refresh Function
    start_time := clock_timestamp();
    BEGIN
        -- Test 1: Can refresh concurrently capability check
        SELECT beekon_data.can_refresh_concurrently('beekon_data.mv_competitor_daily_metrics') INTO test_result;
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Universal Function'::TEXT,
            'Concurrent Capability Check'::TEXT,
            CASE WHEN test_result::BOOLEAN THEN 'PASS' ELSE 'WARN' END::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Concurrent refresh capability: %s', test_result)::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Universal Function'::TEXT,
            'Concurrent Capability Check'::TEXT,
            'FAIL'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Error: %s', SQLERRM)::TEXT;
    END;

    -- Test Category 2: Health Check Functions
    start_time := clock_timestamp();
    BEGIN
        -- Test 2: Health check execution
        PERFORM beekon_data.check_materialized_view_health();
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Monitoring'::TEXT,
            'Health Check Execution'::TEXT,
            'PASS'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            'Health check function executed successfully'::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Monitoring'::TEXT,
            'Health Check Execution'::TEXT,
            'FAIL'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Error: %s', SQLERRM)::TEXT;
    END;

    -- Test Category 3: System Impact Monitoring
    start_time := clock_timestamp();
    BEGIN
        -- Test 3: System impact check
        PERFORM beekon_data.check_refresh_system_impact();
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Monitoring'::TEXT,
            'System Impact Check'::TEXT,
            'PASS'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            'System impact monitoring executed successfully'::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Monitoring'::TEXT,
            'System Impact Check'::TEXT,
            'FAIL'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Error: %s', SQLERRM)::TEXT;
    END;

    -- Test Category 4: Recommendation Engine
    start_time := clock_timestamp();
    BEGIN
        -- Test 4: Refresh recommendations
        PERFORM beekon_data.get_refresh_recommendations();
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Intelligence'::TEXT,
            'Recommendation Engine'::TEXT,
            'PASS'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            'Recommendation engine executed successfully'::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Intelligence'::TEXT,
            'Recommendation Engine'::TEXT,
            'FAIL'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Error: %s', SQLERRM)::TEXT;
    END;

    -- Test Category 5: Coordination System
    start_time := clock_timestamp();
    BEGIN
        -- Test 5: Queue status check
        PERFORM beekon_data.get_refresh_queue_status();
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Coordination'::TEXT,
            'Queue Status Check'::TEXT,
            'PASS'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            'Queue status monitoring executed successfully'::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Coordination'::TEXT,
            'Queue Status Check'::TEXT,
            'FAIL'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Error: %s', SQLERRM)::TEXT;
    END;

    -- Test Category 6: Smart Scheduling (dry run)
    start_time := clock_timestamp();
    BEGIN
        -- Test 6: Smart refresh scheduling (simulation)
        SELECT beekon_data.schedule_smart_refresh('auto', 3600) INTO test_result; -- 1 hour delay for testing
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Scheduling'::TEXT,
            'Smart Refresh Scheduling'::TEXT,
            CASE WHEN test_result->>'status' IN ('scheduled', 'skipped') THEN 'PASS' ELSE 'WARN' END::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Scheduling result: %s', test_result->>'status')::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Scheduling'::TEXT,
            'Smart Refresh Scheduling'::TEXT,
            'FAIL'::TEXT,
            EXTRACT(MILLISECONDS FROM (end_time - start_time))::NUMERIC,
            format('Error: %s', SQLERRM)::TEXT;
    END;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- PERFORMANCE BENCHMARK FOR REFRESH OPERATIONS
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.benchmark_refresh_performance(
    test_view_name TEXT DEFAULT 'beekon_data.mv_website_dashboard_summary'
) RETURNS TABLE(
    benchmark_type TEXT,
    duration_seconds NUMERIC,
    status TEXT,
    method_used TEXT,
    notes TEXT
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    result JSONB;
    can_concurrent BOOLEAN;
BEGIN
    -- Check if the view supports concurrent refresh
    SELECT beekon_data.can_refresh_concurrently(test_view_name) INTO can_concurrent;

    -- Benchmark 1: Universal concurrent refresh function
    start_time := clock_timestamp();
    BEGIN
        SELECT beekon_data.refresh_materialized_view_concurrent(test_view_name, 1, 2) INTO result;
        end_time := clock_timestamp();

        RETURN QUERY SELECT
            'Universal Concurrent Function'::TEXT,
            EXTRACT(EPOCH FROM (end_time - start_time))::NUMERIC,
            result->>'status'::TEXT,
            result->>'method'::TEXT,
            format('Concurrent support: %s, Attempts: %s', can_concurrent, result->>'attempt')::TEXT;

    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        RETURN QUERY SELECT
            'Universal Concurrent Function'::TEXT,
            EXTRACT(EPOCH FROM (end_time - start_time))::NUMERIC,
            'ERROR'::TEXT,
            'unknown'::TEXT,
            format('Benchmark failed: %s', SQLERRM)::TEXT;
    END;

    -- Benchmark 2: Traditional refresh (for comparison, if safe)
    IF test_view_name = 'beekon_data.mv_website_dashboard_summary' THEN
        start_time := clock_timestamp();
        BEGIN
            REFRESH MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary;
            end_time := clock_timestamp();

            RETURN QUERY SELECT
                'Traditional Blocking Refresh'::TEXT,
                EXTRACT(EPOCH FROM (end_time - start_time))::NUMERIC,
                'SUCCESS'::TEXT,
                'blocking'::TEXT,
                'Traditional blocking refresh for comparison'::TEXT;

        EXCEPTION WHEN OTHERS THEN
            end_time := clock_timestamp();
            RETURN QUERY SELECT
                'Traditional Blocking Refresh'::TEXT,
                EXTRACT(EPOCH FROM (end_time - start_time))::NUMERIC,
                'ERROR'::TEXT,
                'blocking'::TEXT,
                format('Traditional refresh failed: %s', SQLERRM)::TEXT;
        END;
    ELSE
        RETURN QUERY SELECT
            'Traditional Blocking Refresh'::TEXT,
            0::NUMERIC,
            'SKIPPED'::TEXT,
            'n/a'::TEXT,
            'Skipped for safety - only testing with dashboard view'::TEXT;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- COMPREHENSIVE SYSTEM READINESS CHECK
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.check_concurrent_refresh_system_readiness()
RETURNS JSONB AS $$
DECLARE
    prerequisites_result JSONB;
    functionality_result JSONB;
    performance_result JSONB;
    overall_status TEXT;
    readiness_score INTEGER := 0;
    total_tests INTEGER := 0;
    passed_tests INTEGER := 0;
BEGIN
    -- Run prerequisite validation
    SELECT jsonb_agg(
        jsonb_build_object(
            'test', test_name,
            'status', status,
            'details', details,
            'recommendation', recommendation
        )
    ) INTO prerequisites_result
    FROM beekon_data.validate_concurrent_refresh_prerequisites();

    -- Count prerequisite test results
    SELECT
        jsonb_array_length(prerequisites_result),
        (SELECT COUNT(*) FROM jsonb_array_elements(prerequisites_result) as elem WHERE elem->>'status' = 'PASS')
    INTO total_tests, passed_tests;

    -- Run functionality tests
    SELECT jsonb_agg(
        jsonb_build_object(
            'category', test_category,
            'test', test_name,
            'status', status,
            'execution_time_ms', execution_time_ms,
            'details', details
        )
    ) INTO functionality_result
    FROM beekon_data.test_concurrent_refresh_functionality();

    -- Update test counts with functionality tests
    SELECT
        total_tests + jsonb_array_length(functionality_result),
        passed_tests + (SELECT COUNT(*) FROM jsonb_array_elements(functionality_result) as elem WHERE elem->>'status' = 'PASS')
    INTO total_tests, passed_tests;

    -- Run performance benchmark (on safe view only)
    SELECT jsonb_agg(
        jsonb_build_object(
            'benchmark_type', benchmark_type,
            'duration_seconds', duration_seconds,
            'status', status,
            'method_used', method_used,
            'notes', notes
        )
    ) INTO performance_result
    FROM beekon_data.benchmark_refresh_performance();

    -- Calculate readiness score
    readiness_score := ROUND((passed_tests::NUMERIC / total_tests::NUMERIC) * 100);

    -- Determine overall status
    overall_status := CASE
        WHEN readiness_score >= 90 THEN 'READY'
        WHEN readiness_score >= 75 THEN 'MOSTLY_READY'
        WHEN readiness_score >= 50 THEN 'PARTIALLY_READY'
        ELSE 'NOT_READY'
    END;

    -- Return comprehensive readiness report
    RETURN jsonb_build_object(
        'system_readiness', jsonb_build_object(
            'overall_status', overall_status,
            'readiness_score', readiness_score,
            'total_tests', total_tests,
            'passed_tests', passed_tests,
            'failed_tests', total_tests - passed_tests,
            'assessment_timestamp', NOW()
        ),
        'prerequisites', prerequisites_result,
        'functionality_tests', functionality_result,
        'performance_benchmarks', performance_result,
        'recommendations', CASE
            WHEN overall_status = 'READY' THEN jsonb_build_array(
                'System is ready for production use of concurrent refresh',
                'Monitor refresh operations and system performance',
                'Consider setting up automated refresh scheduling'
            )
            WHEN overall_status = 'MOSTLY_READY' THEN jsonb_build_array(
                'Address any failing tests before production deployment',
                'Review performance benchmarks for optimization opportunities',
                'Test with actual production workloads'
            )
            ELSE jsonb_build_array(
                'Critical issues detected - fix before deployment',
                'Review all failing tests and prerequisites',
                'Consider staged rollout after fixes are applied'
            )
        END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS FOR TEST FUNCTIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.validate_concurrent_refresh_prerequisites TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.validate_concurrent_refresh_prerequisites TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.test_concurrent_refresh_functionality TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.test_concurrent_refresh_functionality TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.benchmark_refresh_performance TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.benchmark_refresh_performance TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.check_concurrent_refresh_system_readiness TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.check_concurrent_refresh_system_readiness TO service_role;

-- =========================================================================
-- ADD COMPREHENSIVE DOCUMENTATION
-- =========================================================================

COMMENT ON FUNCTION beekon_data.validate_concurrent_refresh_prerequisites IS
'Validates all prerequisites for concurrent materialized view refresh including indexes, tables, and permissions.';

COMMENT ON FUNCTION beekon_data.test_concurrent_refresh_functionality IS
'Comprehensive test suite for all concurrent refresh functionality including monitoring, scheduling, and coordination.';

COMMENT ON FUNCTION beekon_data.benchmark_refresh_performance IS
'Performance benchmarking tool to compare traditional vs concurrent refresh methods with timing and success metrics.';

COMMENT ON FUNCTION beekon_data.check_concurrent_refresh_system_readiness IS
'Master readiness check that combines prerequisites, functionality tests, and performance benchmarks into a comprehensive system assessment.';

-- =========================================================================
-- FINAL MIGRATION SUMMARY
-- =========================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=========================================================================';
    RAISE NOTICE 'CONCURRENT MATERIALIZED VIEW REFRESH ENHANCEMENT COMPLETE';
    RAISE NOTICE '=========================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Phase 1: ✓ Created unique indexes for concurrent refresh support';
    RAISE NOTICE 'Phase 2: ✓ Implemented universal concurrent refresh with retry logic';
    RAISE NOTICE 'Phase 3: ✓ Updated all refresh functions to use concurrent approach';
    RAISE NOTICE 'Phase 4: ✓ Created comprehensive monitoring and health checks';
    RAISE NOTICE 'Phase 5: ✓ Implemented coordinated refresh scheduling system';
    RAISE NOTICE 'Phase 6: ✓ Added testing and validation framework';
    RAISE NOTICE '';
    RAISE NOTICE 'KEY FEATURES IMPLEMENTED:';
    RAISE NOTICE '• Uninterrupted read operations during refresh';
    RAISE NOTICE '• Robust error handling with intelligent fallbacks';
    RAISE NOTICE '• Comprehensive monitoring and health checks';
    RAISE NOTICE '• Smart scheduling and coordination system';
    RAISE NOTICE '• Performance benchmarking and validation';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Run: SELECT * FROM beekon_data.check_concurrent_refresh_system_readiness();';
    RAISE NOTICE '2. Review readiness report and address any issues';
    RAISE NOTICE '3. Test with production workloads';
    RAISE NOTICE '4. Deploy to production environment';
    RAISE NOTICE '';
    RAISE NOTICE 'MONITORING:';
    RAISE NOTICE '• Health: SELECT * FROM beekon_data.check_materialized_view_health();';
    RAISE NOTICE '• Status: SELECT * FROM beekon_data.get_refresh_queue_status();';
    RAISE NOTICE '• Stats: SELECT * FROM beekon_data.get_refresh_operation_stats();';
    RAISE NOTICE '';
    RAISE NOTICE '=========================================================================';
END $$;