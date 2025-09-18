-- =================================================================
-- DATABASE FUNCTION TESTING QUERIES
-- =================================================================
-- Use these queries in Supabase SQL Editor to test functions directly
-- Replace the website IDs with actual IDs from your database
-- =================================================================

-- =================================================================
-- 1. TEST DATABASE FUNCTIONS EXIST
-- =================================================================

-- Check which functions exist in your database
SELECT
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'beekon_data'
AND routine_name IN (
    'get_dashboard_metrics',
    'get_dashboard_time_series',
    'get_competitor_share_of_voice',
    'get_competitive_gap_analysis',
    'get_competitor_performance',
    'get_topic_performance_dashboard',
    'get_website_performance_dashboard',
    'get_llm_performance_dashboard'
)
ORDER BY routine_name;

-- =================================================================
-- 2. TEST DASHBOARD FUNCTIONS
-- =================================================================

-- Test get_dashboard_metrics with your actual website ID
SELECT * FROM beekon_data.get_dashboard_metrics(
    ARRAY['1fda486d-6e9e-408d-9f89-1ce66bd729d9']::UUID[],
    NOW() - INTERVAL '30 days',
    NOW()
);

-- Test get_dashboard_time_series
SELECT * FROM beekon_data.get_dashboard_time_series(
    ARRAY['1fda486d-6e9e-408d-9f89-1ce66bd729d9']::UUID[],
    7
);

-- =================================================================
-- 3. TEST COMPETITOR FUNCTIONS
-- =================================================================

-- Test get_competitor_share_of_voice
SELECT * FROM beekon_data.get_competitor_share_of_voice(
    '1fda486d-6e9e-408d-9f89-1ce66bd729d9'::UUID,
    NOW() - INTERVAL '90 days',
    NOW()
);

-- Test get_competitive_gap_analysis
SELECT * FROM beekon_data.get_competitive_gap_analysis(
    '1fda486d-6e9e-408d-9f89-1ce66bd729d9'::UUID,
    NOW() - INTERVAL '90 days',
    NOW()
);

-- =================================================================
-- 4. TEST MISSING FUNCTIONS (THESE WILL FAIL IF FUNCTION DOESN'T EXIST)
-- =================================================================

-- Test get_competitor_performance (called by competitorService but may not exist)
SELECT * FROM beekon_data.get_competitor_performance(
    '1fda486d-6e9e-408d-9f89-1ce66bd729d9'::UUID,
    50,
    0
);

-- =================================================================
-- 5. CHECK WEBSITE DATA EXISTS
-- =================================================================

-- Verify the website ID exists and has data
SELECT
    id,
    domain,
    display_name,
    is_active,
    created_at
FROM beekon_data.websites
WHERE id = '1fda486d-6e9e-408d-9f89-1ce66bd729d9';

-- Check if website has analysis data
SELECT
    COUNT(*) as total_analyses,
    COUNT(CASE WHEN is_mentioned THEN 1 END) as mentions,
    MAX(analyzed_at) as latest_analysis
FROM beekon_data.llm_analysis_results
WHERE website_id = '1fda486d-6e9e-408d-9f89-1ce66bd729d9';

-- Check if website has competitors
SELECT
    COUNT(*) as competitor_count,
    array_agg(competitor_domain) as competitor_domains
FROM beekon_data.competitors
WHERE website_id = '1fda486d-6e9e-408d-9f89-1ce66bd729d9'
AND is_active = true;

-- =================================================================
-- 6. CHECK MATERIALIZED VIEWS
-- =================================================================

-- Check if materialized views exist and have data
SELECT
    schemaname,
    matviewname,
    hasindexes,
    ispopulated
FROM pg_matviews
WHERE schemaname = 'beekon_data'
AND matviewname LIKE '%competitor%' OR matviewname LIKE '%dashboard%';

-- Test materialized view data
SELECT COUNT(*) as mv_competitor_share_records
FROM beekon_data.mv_competitor_share_of_voice
WHERE website_id = '1fda486d-6e9e-408d-9f89-1ce66bd729d9';

-- =================================================================
-- INSTRUCTIONS
-- =================================================================

/*
1. Run query #1 first to see which functions exist
2. Run queries #2-3 with your actual website IDs
3. Check the results and error messages
4. Query #4 will likely fail - that's expected for missing functions
5. Queries #5-6 help verify you have data to work with

Expected Results:
- Functions should exist and return data structures
- If you get "function does not exist" errors, we need to create those functions
- If you get "column reference is ambiguous" errors, the migration didn't fully fix the issues
- If you get empty results but no errors, there might not be data for that website

Replace '1fda486d-6e9e-408d-9f89-1ce66bd729d9' with actual website IDs from your database.
*/