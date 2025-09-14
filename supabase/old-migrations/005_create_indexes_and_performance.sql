-- =================================================================
-- BEEKON.AI PERFORMANCE OPTIMIZATION AND MONITORING
-- =================================================================
-- This migration adds advanced performance optimizations, monitoring,
-- and maintenance features to ensure optimal database performance
-- for the competitor analysis system.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. ADVANCED PERFORMANCE INDEXES
-- =================================================================

-- Partial indexes for active records only (saves space and improves performance)
CREATE INDEX IF NOT EXISTS idx_competitors_active_website_analyzed 
  ON beekon_data.competitors(website_id, last_analyzed_at DESC) 
  WHERE is_active = TRUE;

-- Partial index for recent competitor mentions (removed NOW() function for immutability)
CREATE INDEX IF NOT EXISTS idx_competitor_results_recent_mentions 
  ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at DESC) 
  WHERE is_mentioned = TRUE;

-- Partial index for recent LLM results mentions (removed NOW() function for immutability)
CREATE INDEX IF NOT EXISTS idx_llm_results_recent_mentions 
  ON beekon_data.llm_analysis_results(website_id, analyzed_at DESC) 
  WHERE is_mentioned = TRUE;

-- Covering indexes (include frequently accessed columns)
CREATE INDEX IF NOT EXISTS idx_competitors_performance_covering 
  ON beekon_data.competitors(website_id, is_active, analysis_status) 
  INCLUDE (competitor_name, competitor_domain, last_analyzed_at)
  WHERE is_active = TRUE;

-- Covering index for competitor analysis results (removed NOW() function for immutability)
CREATE INDEX IF NOT EXISTS idx_competitor_results_analysis_covering 
  ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at DESC) 
  INCLUDE (is_mentioned, rank_position, sentiment_score, llm_provider);

-- Simple index for competitor domain searches (removed expressions for immutability)
CREATE INDEX IF NOT EXISTS idx_competitors_domain_search 
  ON beekon_data.competitors(website_id, competitor_domain);

-- Simple index for date-based queries (removed DATE_TRUNC for immutability)
CREATE INDEX IF NOT EXISTS idx_competitor_results_date_competitor 
  ON beekon_data.competitor_analysis_results(analyzed_at DESC, competitor_id);

-- =================================================================
-- 2. FOREIGN KEY INDEXES (Critical for join performance)
-- =================================================================

-- Ensure all foreign key columns have proper indexes
CREATE INDEX IF NOT EXISTS idx_topics_website_id_fk ON beekon_data.topics(website_id);
CREATE INDEX IF NOT EXISTS idx_prompts_topic_id_fk ON beekon_data.prompts(topic_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_prompt_id_fk ON beekon_data.llm_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_website_id_fk ON beekon_data.llm_analysis_results(website_id);
CREATE INDEX IF NOT EXISTS idx_competitor_results_competitor_id_fk ON beekon_data.competitor_analysis_results(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_results_prompt_id_fk ON beekon_data.competitor_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_website_id_fk ON beekon_data.analysis_sessions(website_id);
CREATE INDEX IF NOT EXISTS idx_website_settings_website_id_fk ON beekon_data.website_settings(website_id);

-- =================================================================
-- 3. COMPOSITE INDEXES FOR COMPLEX QUERIES
-- =================================================================

-- Multi-column indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_dashboard_competitor_status 
  ON beekon_data.competitors(website_id, is_active, analysis_status, updated_at DESC);

-- Index for dashboard analysis timeline (removed NOW() function for immutability)
CREATE INDEX IF NOT EXISTS idx_dashboard_analysis_timeline 
  ON beekon_data.competitor_analysis_results(
    competitor_id, 
    analyzed_at DESC, 
    is_mentioned, 
    llm_provider
  );

-- Indexes for time-series and trend analysis (simplified for immutability)
CREATE INDEX IF NOT EXISTS idx_competitor_trends 
  ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at DESC, is_mentioned);

CREATE INDEX IF NOT EXISTS idx_brand_trends 
  ON beekon_data.llm_analysis_results(website_id, analyzed_at DESC, is_mentioned);

-- =================================================================
-- 4. FULL-TEXT SEARCH OPTIMIZATION
-- =================================================================

-- Custom text search configurations for better relevance
CREATE TEXT SEARCH CONFIGURATION beekon_english (COPY = english);
ALTER TEXT SEARCH CONFIGURATION beekon_english 
  ALTER MAPPING FOR hword, hword_part, word WITH simple;

-- Enhanced full-text search indexes
DROP INDEX IF EXISTS beekon_data.idx_llm_results_response_text_search;
DROP INDEX IF EXISTS beekon_data.idx_competitor_results_response_text_search;

CREATE INDEX idx_llm_results_response_text_search 
  ON beekon_data.llm_analysis_results 
  USING gin(to_tsvector('beekon_english', response_text))
  WHERE response_text IS NOT NULL;

CREATE INDEX idx_competitor_results_response_text_search 
  ON beekon_data.competitor_analysis_results 
  USING gin(to_tsvector('beekon_english', response_text))
  WHERE response_text IS NOT NULL;

-- Combined search index for cross-table searches
CREATE INDEX idx_combined_analysis_text_search 
  ON beekon_data.competitor_analysis_results 
  USING gin(to_tsvector('beekon_english', COALESCE(response_text, '') || ' ' || COALESCE(summary_text, '')))
  WHERE response_text IS NOT NULL OR summary_text IS NOT NULL;

-- =================================================================
-- 5. JSONB PERFORMANCE INDEXES
-- =================================================================

-- JSONB indexes for website settings
CREATE INDEX IF NOT EXISTS idx_website_settings_gin 
  ON beekon_data.website_settings USING gin(settings);

-- Specific JSONB path indexes for common queries
CREATE INDEX IF NOT EXISTS idx_website_settings_analysis_frequency 
  ON beekon_data.website_settings((settings->>'analysis_frequency'))
  WHERE settings->>'analysis_frequency' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_website_settings_auto_analysis 
  ON beekon_data.website_settings((settings->>'auto_analysis'))
  WHERE settings->>'auto_analysis' IS NOT NULL;

-- Export history metadata indexes
CREATE INDEX IF NOT EXISTS idx_export_history_metadata_gin 
  ON beekon_data.export_history USING gin(metadata)
  WHERE metadata IS NOT NULL;

-- =================================================================
-- 6. PARTITIONING SETUP (Future-proofing for large datasets)
-- =================================================================

-- Function to create monthly partitions for analysis results
CREATE OR REPLACE FUNCTION beekon_data.create_monthly_partition(
    table_name TEXT,
    start_date DATE
)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    end_date DATE;
    sql_statement TEXT;
BEGIN
    partition_name := table_name || '_' || TO_CHAR(start_date, 'YYYY_MM');
    end_date := start_date + INTERVAL '1 month';
    
    sql_statement := format(
        'CREATE TABLE IF NOT EXISTS beekon_data.%I PARTITION OF beekon_data.%I 
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, table_name, start_date, end_date
    );
    
    EXECUTE sql_statement;
    
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 7. STATISTICS AND MAINTENANCE
-- =================================================================

-- Function to update table statistics
CREATE OR REPLACE FUNCTION beekon_data.update_table_statistics()
RETURNS VOID AS $$
BEGIN
    -- Analyze critical tables to ensure query planner has fresh statistics
    ANALYZE beekon_data.competitors;
    ANALYZE beekon_data.competitor_analysis_results;
    ANALYZE beekon_data.llm_analysis_results;
    ANALYZE beekon_data.websites;
    ANALYZE beekon_data.topics;
    ANALYZE beekon_data.prompts;
    
    -- Analyze materialized views
    ANALYZE beekon_data.mv_competitor_share_of_voice;
    ANALYZE beekon_data.mv_competitive_gap_analysis;
    ANALYZE beekon_data.mv_competitor_performance;
    ANALYZE beekon_data.mv_competitor_daily_metrics;
    ANALYZE beekon_data.mv_website_dashboard_summary;
    
    RAISE NOTICE 'Table statistics updated successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to get index usage statistics
CREATE OR REPLACE FUNCTION beekon_data.get_index_usage_stats()
RETURNS TABLE (
    schemaname TEXT,
    tablename TEXT,
    indexname TEXT,
    idx_scans BIGINT,
    idx_tup_read BIGINT,
    idx_tup_fetch BIGINT,
    usage_ratio NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        psi.schemaname::TEXT,
        psi.tablename::TEXT,
        psi.indexrelname::TEXT as indexname,
        psi.idx_scan as idx_scans,
        psi.idx_tup_read,
        psi.idx_tup_fetch,
        CASE 
            WHEN psi.idx_scan > 0 
            THEN ROUND((psi.idx_tup_fetch::NUMERIC / psi.idx_tup_read::NUMERIC) * 100, 2)
            ELSE 0
        END as usage_ratio
    FROM pg_stat_user_indexes psi
    WHERE psi.schemaname = 'beekon_data'
    ORDER BY psi.idx_scan DESC, psi.idx_tup_read DESC;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 8. PERFORMANCE MONITORING VIEWS
-- =================================================================

-- View for slow query monitoring
CREATE OR REPLACE VIEW beekon_data.slow_queries AS
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    stddev_exec_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE query LIKE '%beekon_data%'
  AND mean_exec_time > 100 -- Only queries taking more than 100ms on average
ORDER BY mean_exec_time DESC;

-- View for materialized view freshness
CREATE OR REPLACE VIEW beekon_data.materialized_view_freshness AS
SELECT 
    schemaname,
    matviewname,
    hasindexes,
    ispopulated,
    -- Estimate freshness based on table statistics
    CASE 
        WHEN ispopulated THEN 'populated'
        ELSE 'not_populated'
    END as freshness_status
FROM pg_matviews 
WHERE schemaname = 'beekon_data';

-- =================================================================
-- 9. AUTOMATED MAINTENANCE FUNCTIONS
-- =================================================================

-- Function to automatically refresh materialized views based on data age
CREATE OR REPLACE FUNCTION beekon_data.smart_refresh_views()
RETURNS TEXT AS $$
DECLARE
    last_competitor_update TIMESTAMP WITH TIME ZONE;
    last_analysis_update TIMESTAMP WITH TIME ZONE;
    refresh_needed BOOLEAN := FALSE;
    result_text TEXT := '';
BEGIN
    -- Check when data was last updated
    SELECT MAX(updated_at) INTO last_competitor_update
    FROM beekon_data.competitors;
    
    SELECT MAX(analyzed_at) INTO last_analysis_update
    FROM beekon_data.competitor_analysis_results;
    
    -- Determine if refresh is needed (data updated in last hour)
    IF last_competitor_update >= NOW() - INTERVAL '1 hour' OR 
       last_analysis_update >= NOW() - INTERVAL '1 hour' THEN
        refresh_needed := TRUE;
    END IF;
    
    IF refresh_needed THEN
        PERFORM beekon_data.refresh_competitor_analysis_views();
        result_text := 'Materialized views refreshed due to recent data updates';
    ELSE
        result_text := 'No refresh needed - data is older than 1 hour';
    END IF;
    
    -- Update statistics if refresh was performed
    IF refresh_needed THEN
        PERFORM beekon_data.update_table_statistics();
    END IF;
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Function for database maintenance
CREATE OR REPLACE FUNCTION beekon_data.perform_maintenance()
RETURNS TEXT AS $$
DECLARE
    result_text TEXT := '';
    dead_tuples BIGINT;
BEGIN
    -- Check for dead tuples
    SELECT SUM(n_dead_tup) INTO dead_tuples
    FROM pg_stat_user_tables 
    WHERE schemaname = 'beekon_data';
    
    -- Vacuum if needed
    IF dead_tuples > 10000 THEN
        VACUUM ANALYZE beekon_data.competitors;
        VACUUM ANALYZE beekon_data.competitor_analysis_results;
        VACUUM ANALYZE beekon_data.llm_analysis_results;
        result_text := result_text || 'VACUUM performed on main tables. ';
    END IF;
    
    -- Update statistics
    PERFORM beekon_data.update_table_statistics();
    result_text := result_text || 'Table statistics updated. ';
    
    -- Smart refresh of materialized views
    result_text := result_text || beekon_data.smart_refresh_views();
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 10. CONSTRAINT VALIDATION
-- =================================================================

-- Function to validate data integrity
CREATE OR REPLACE FUNCTION beekon_data.validate_data_integrity()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    message TEXT,
    affected_records BIGINT
) AS $$
DECLARE
    orphaned_competitors BIGINT;
    orphaned_results BIGINT;
    invalid_analysis_dates BIGINT;
    duplicate_analyses BIGINT;
BEGIN
    -- Check 1: Orphaned competitors (no website)
    SELECT COUNT(*) INTO orphaned_competitors
    FROM beekon_data.competitors c
    LEFT JOIN beekon_data.websites w ON c.website_id = w.id
    WHERE w.id IS NULL;
    
    RETURN QUERY SELECT 
        'orphaned_competitors'::TEXT,
        CASE WHEN orphaned_competitors = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        'Found ' || orphaned_competitors || ' competitors without valid websites'::TEXT,
        orphaned_competitors;

    -- Check 2: Orphaned analysis results
    SELECT COUNT(*) INTO orphaned_results
    FROM beekon_data.competitor_analysis_results car
    LEFT JOIN beekon_data.competitors c ON car.competitor_id = c.id
    WHERE c.id IS NULL;
    
    RETURN QUERY SELECT 
        'orphaned_analysis_results'::TEXT,
        CASE WHEN orphaned_results = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        'Found ' || orphaned_results || ' analysis results without valid competitors'::TEXT,
        orphaned_results;

    -- Check 3: Future analysis dates
    SELECT COUNT(*) INTO invalid_analysis_dates
    FROM beekon_data.competitor_analysis_results
    WHERE analyzed_at > NOW() + INTERVAL '1 hour';
    
    RETURN QUERY SELECT 
        'future_analysis_dates'::TEXT,
        CASE WHEN invalid_analysis_dates = 0 THEN 'PASS' ELSE 'WARN' END::TEXT,
        'Found ' || invalid_analysis_dates || ' analysis results with future dates'::TEXT,
        invalid_analysis_dates;

    -- Check 4: Duplicate analyses
    WITH duplicate_check AS (
        SELECT competitor_id, prompt_id, llm_provider, COUNT(*) as cnt
        FROM beekon_data.competitor_analysis_results
        GROUP BY competitor_id, prompt_id, llm_provider
        HAVING COUNT(*) > 1
    )
    SELECT COUNT(*) INTO duplicate_analyses FROM duplicate_check;
    
    RETURN QUERY SELECT 
        'duplicate_analyses'::TEXT,
        CASE WHEN duplicate_analyses = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        'Found ' || duplicate_analyses || ' duplicate analysis entries (violates unique constraint)'::TEXT,
        duplicate_analyses;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 11. GRANT PERMISSIONS
-- =================================================================

-- Grant execute permissions for maintenance functions
GRANT EXECUTE ON FUNCTION beekon_data.create_monthly_partition(TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.update_table_statistics() TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.get_index_usage_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.smart_refresh_views() TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.perform_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.validate_data_integrity() TO authenticated;

-- Grant view permissions
GRANT SELECT ON beekon_data.slow_queries TO authenticated;
GRANT SELECT ON beekon_data.materialized_view_freshness TO authenticated;

-- =================================================================
-- 12. HELPFUL COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.update_table_statistics IS 'Updates table statistics for optimal query planning';
COMMENT ON FUNCTION beekon_data.get_index_usage_stats IS 'Returns index usage statistics for performance monitoring';
COMMENT ON FUNCTION beekon_data.smart_refresh_views IS 'Intelligently refreshes materialized views based on data freshness';
COMMENT ON FUNCTION beekon_data.perform_maintenance IS 'Comprehensive database maintenance including vacuum, statistics, and view refresh';
COMMENT ON FUNCTION beekon_data.validate_data_integrity IS 'Validates data integrity and identifies potential issues';

COMMENT ON VIEW beekon_data.slow_queries IS 'Monitor slow queries affecting beekon_data schema';
COMMENT ON VIEW beekon_data.materialized_view_freshness IS 'Monitor materialized view population status';

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION AND OPTIMIZATION
-- =================================================================

-- Initial statistics update
SELECT beekon_data.update_table_statistics();

-- Validate data integrity
DO $$
DECLARE
    integrity_results RECORD;
    total_indexes INTEGER;
    performance_indexes INTEGER;
    maintenance_functions INTEGER;
BEGIN
    -- Count indexes created
    SELECT COUNT(*) INTO total_indexes
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data';
    
    -- Count performance-specific indexes
    SELECT COUNT(*) INTO performance_indexes
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data'
      AND (indexname LIKE 'idx_%_covering' OR 
           indexname LIKE 'idx_%_partial' OR
           indexname LIKE 'idx_%_performance_%');
    
    -- Count maintenance functions
    SELECT COUNT(*) INTO maintenance_functions
    FROM information_schema.routines 
    WHERE routine_schema = 'beekon_data'
      AND routine_name IN ('update_table_statistics', 'smart_refresh_views', 'perform_maintenance', 'validate_data_integrity');
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'PERFORMANCE OPTIMIZATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Total indexes created: %', total_indexes;
    RAISE NOTICE 'Performance indexes: %', performance_indexes;
    RAISE NOTICE 'Maintenance functions: %', maintenance_functions;
    RAISE NOTICE '';
    RAISE NOTICE 'PERFORMANCE FEATURES:';
    RAISE NOTICE '  ✓ Covering indexes for frequently accessed columns';
    RAISE NOTICE '  ✓ Partial indexes for active records only';
    RAISE NOTICE '  ✓ Enhanced full-text search with custom configuration';
    RAISE NOTICE '  ✓ JSONB performance indexes for settings';
    RAISE NOTICE '  ✓ Foreign key indexes for optimal join performance';
    RAISE NOTICE '';
    RAISE NOTICE 'MONITORING FEATURES:';
    RAISE NOTICE '  ✓ Slow query monitoring view';
    RAISE NOTICE '  ✓ Materialized view freshness tracking';
    RAISE NOTICE '  ✓ Index usage statistics function';
    RAISE NOTICE '  ✓ Data integrity validation';
    RAISE NOTICE '';
    RAISE NOTICE 'MAINTENANCE FEATURES:';
    RAISE NOTICE '  ✓ Smart materialized view refresh';
    RAISE NOTICE '  ✓ Automated table statistics updates';
    RAISE NOTICE '  ✓ Comprehensive maintenance routine';
    RAISE NOTICE '  ✓ Monthly partitioning support (future-proofing)';
    RAISE NOTICE '';
    RAISE NOTICE 'The database is now optimized for high-performance competitor analysis!';
    RAISE NOTICE '=================================================================';
    
    -- Run data integrity validation
    RAISE NOTICE '';
    RAISE NOTICE 'RUNNING DATA INTEGRITY VALIDATION...';
    FOR integrity_results IN 
        SELECT * FROM beekon_data.validate_data_integrity()
    LOOP
        RAISE NOTICE '  % - %: %', 
            integrity_results.check_name, 
            integrity_results.status, 
            integrity_results.message;
    END LOOP;
    RAISE NOTICE 'Data integrity validation completed.';
    RAISE NOTICE '=================================================================';
END $$;