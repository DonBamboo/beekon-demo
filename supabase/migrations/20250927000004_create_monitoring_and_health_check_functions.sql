-- =========================================================================
-- PHASE 4: MONITORING AND HEALTH CHECK FUNCTIONS
-- =========================================================================

-- Comprehensive monitoring and health check functions for materialized views
-- and refresh operations

-- =========================================================================
-- MATERIALIZED VIEW HEALTH CHECK FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.check_materialized_view_health()
RETURNS TABLE(
    view_name TEXT,
    schema_name TEXT,
    has_unique_index BOOLEAN,
    supports_concurrent_refresh BOOLEAN,
    last_refresh TIMESTAMP,
    row_count BIGINT,
    size_mb NUMERIC,
    index_count INTEGER,
    health_status TEXT,
    recommendations TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH view_info AS (
        SELECT
            mv.schemaname||'.'||mv.matviewname as full_name,
            mv.schemaname,
            mv.matviewname,
            mv.hasindexes,
            c.oid,
            c.reltuples,
            pg_total_relation_size(c.oid) as size_bytes
        FROM pg_matviews mv
        JOIN pg_class c ON c.relname = mv.matviewname
        WHERE mv.schemaname = 'beekon_data'
    ),
    unique_indexes AS (
        SELECT
            i.schemaname||'.'||i.tablename as full_name,
            COUNT(*) as unique_index_count
        FROM pg_indexes i
        WHERE i.schemaname = 'beekon_data'
        AND i.indexdef LIKE '%UNIQUE%'
        GROUP BY i.schemaname||'.'||i.tablename
    ),
    all_indexes AS (
        SELECT
            i.schemaname||'.'||i.tablename as full_name,
            COUNT(*) as total_index_count
        FROM pg_indexes i
        WHERE i.schemaname = 'beekon_data'
        GROUP BY i.schemaname||'.'||i.tablename
    ),
    view_stats AS (
        SELECT
            vi.full_name,
            vi.schemaname,
            vi.matviewname,
            vi.hasindexes,
            vi.reltuples,
            vi.size_bytes,
            COALESCE(ui.unique_index_count, 0) > 0 as has_unique_idx,
            COALESCE(ai.total_index_count, 0) as idx_count,
            -- Try to get last refresh time from pg_stat_user_tables
            COALESCE(st.last_analyze, st.last_autoanalyze) as last_refresh_estimate
        FROM view_info vi
        LEFT JOIN unique_indexes ui ON vi.full_name = ui.full_name
        LEFT JOIN all_indexes ai ON vi.full_name = ai.full_name
        LEFT JOIN pg_stat_user_tables st ON st.relname = vi.matviewname
    )
    SELECT
        vs.full_name::TEXT,
        vs.schemaname::TEXT,
        vs.has_unique_idx::BOOLEAN,
        (vs.hasindexes AND vs.has_unique_idx)::BOOLEAN,
        vs.last_refresh_estimate::TIMESTAMP,
        vs.reltuples::BIGINT,
        ROUND((vs.size_bytes / 1024.0 / 1024.0)::NUMERIC, 2),
        vs.idx_count::INTEGER,
        -- Health status determination
        CASE
            WHEN vs.has_unique_idx AND vs.hasindexes THEN 'HEALTHY'
            WHEN vs.hasindexes AND NOT vs.has_unique_idx THEN 'CONCURRENT_REFRESH_UNAVAILABLE'
            WHEN NOT vs.hasindexes THEN 'NO_INDEXES'
            ELSE 'UNKNOWN'
        END::TEXT,
        -- Recommendations array
        CASE
            WHEN NOT vs.has_unique_idx THEN ARRAY['Create unique index for concurrent refresh support']
            WHEN NOT vs.hasindexes THEN ARRAY['Add indexes for better performance', 'Create unique index for concurrent refresh']
            WHEN vs.reltuples = 0 THEN ARRAY['View appears empty - check data sources']
            ELSE ARRAY['View is healthy']::TEXT[]
        END
    FROM view_stats vs
    ORDER BY vs.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- REFRESH OPERATION MONITORING FUNCTION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_refresh_operation_stats(
    hours_back INTEGER DEFAULT 24
)
RETURNS TABLE(
    time_period TEXT,
    total_operations INTEGER,
    successful_operations INTEGER,
    failed_operations INTEGER,
    success_rate NUMERIC,
    avg_duration_seconds NUMERIC,
    operations_by_method JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH log_data AS (
        SELECT
            sl.created_at,
            sl.message,
            sl.log_level,
            CASE
                WHEN sl.message LIKE '%Successfully refreshed materialized view%' THEN 'SUCCESS'
                WHEN sl.message LIKE '%Concurrent refresh failed%' THEN 'CONCURRENT_FAILED'
                WHEN sl.message LIKE '%Falling back to blocking refresh%' THEN 'FALLBACK'
                WHEN sl.message LIKE '%Complete refresh failure%' THEN 'FAILED'
                ELSE 'OTHER'
            END as operation_type,
            CASE
                WHEN sl.message LIKE '%concurrently%' THEN 'CONCURRENT'
                WHEN sl.message LIKE '%blocking%' THEN 'BLOCKING'
                ELSE 'UNKNOWN'
            END as refresh_method
        FROM beekon_data.system_logs sl
        WHERE sl.created_at >= NOW() - INTERVAL '1 hour' * hours_back
        AND sl.message LIKE '%materialized view%'
        AND sl.message LIKE '%refresh%'
    ),
    aggregated_stats AS (
        SELECT
            COUNT(*) as total_ops,
            COUNT(*) FILTER (WHERE operation_type = 'SUCCESS') as success_ops,
            COUNT(*) FILTER (WHERE operation_type IN ('FAILED', 'CONCURRENT_FAILED')) as failed_ops,
            jsonb_object_agg(refresh_method, method_count) as methods
        FROM (
            SELECT
                refresh_method,
                COUNT(*) as method_count
            FROM log_data
            WHERE operation_type IN ('SUCCESS', 'FAILED', 'CONCURRENT_FAILED', 'FALLBACK')
            GROUP BY refresh_method
        ) method_stats
    )
    SELECT
        format('Last %s hours', hours_back)::TEXT,
        COALESCE(total_ops, 0)::INTEGER,
        COALESCE(success_ops, 0)::INTEGER,
        COALESCE(failed_ops, 0)::INTEGER,
        CASE
            WHEN COALESCE(total_ops, 0) = 0 THEN 0::NUMERIC
            ELSE ROUND((success_ops::NUMERIC / total_ops::NUMERIC) * 100, 2)
        END,
        0::NUMERIC, -- avg_duration placeholder - would need more detailed logging
        COALESCE(methods, '{}'::JSONB)
    FROM aggregated_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- SYSTEM PERFORMANCE IMPACT MONITORING
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.check_refresh_system_impact()
RETURNS TABLE(
    metric_name TEXT,
    current_value TEXT,
    threshold_status TEXT,
    recommendation TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'Active Connections'::text AS metric_name,
        pg_stat_activity.count::text AS current_value,
        CASE
            WHEN pg_stat_activity.count > 80 THEN 'HIGH'
            WHEN pg_stat_activity.count > 50 THEN 'MEDIUM'
            ELSE 'NORMAL'
        END::text AS threshold_status,
        CASE
            WHEN pg_stat_activity.count > 80 THEN 'Consider delaying refresh operations'
            WHEN pg_stat_activity.count > 50 THEN 'Monitor refresh impact on performance'
            ELSE 'Safe to perform refresh operations'
        END::text AS recommendation
    FROM (
        SELECT COUNT(*)::bigint AS count
        FROM pg_stat_activity
        WHERE state = 'active'
    ) pg_stat_activity

    UNION ALL

    SELECT
        'Lock Waits'::text,
        lock_waits.count::text,
        CASE
            WHEN lock_waits.count > 10 THEN 'HIGH'
            WHEN lock_waits.count > 5 THEN 'MEDIUM'
            ELSE 'NORMAL'
        END::text,
        CASE
            WHEN lock_waits.count > 10 THEN 'High lock contention - avoid blocking refreshes'
            WHEN lock_waits.count > 5 THEN 'Some lock contention - prefer concurrent refreshes'
            ELSE 'Low lock contention'
        END::text
    FROM (
        SELECT COUNT(*)::bigint AS count
        FROM pg_locks
        WHERE NOT granted
    ) lock_waits

    UNION ALL

    SELECT
        'Database Size'::text,
        pg_size_pretty(pg_database_size(current_database()))::text,
        'INFO'::text,
        'Database size monitoring for capacity planning'::text

    UNION ALL

    SELECT
        'Materialized View Total Size'::text,
        pg_size_pretty(COALESCE(mv_size.total_size, 0))::text,
        CASE
            WHEN COALESCE(mv_size.total_size, 0) > 10 * 1024 * 1024 * 1024 THEN 'LARGE'
            WHEN COALESCE(mv_size.total_size, 0) > 1 * 1024 * 1024 * 1024 THEN 'MEDIUM'
            ELSE 'SMALL'
        END::text,
        CASE
            WHEN COALESCE(mv_size.total_size, 0) > 10 * 1024 * 1024 * 1024 THEN 'Large materialized views - expect longer refresh times'
            WHEN COALESCE(mv_size.total_size, 0) > 1 * 1024 * 1024 * 1024 THEN 'Medium sized materialized views'
            ELSE 'Small materialized views - fast refreshes expected'
        END::text
    FROM (
        SELECT SUM(pg_total_relation_size(c.oid))::bigint AS total_size
        FROM pg_class c
        JOIN pg_matviews mv ON c.relname = mv.matviewname
        WHERE mv.schemaname = 'beekon_data'
    ) mv_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- REFRESH RECOMMENDATION ENGINE
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_refresh_recommendations()
RETURNS TABLE(
    view_name TEXT,
    priority INTEGER,
    recommendation_type TEXT,
    action_required TEXT,
    estimated_benefit TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH view_health AS (
        SELECT * FROM beekon_data.check_materialized_view_health()
    ),
    system_impact AS (
        SELECT * FROM beekon_data.check_refresh_system_impact()
    ),
    recommendations AS (
        -- High priority: Views without concurrent refresh support
        SELECT
            vh.view_name,
            1 as priority,
            'MISSING_CONCURRENT_SUPPORT' as rec_type,
            'Create unique index: CREATE UNIQUE INDEX CONCURRENTLY idx_' ||
            replace(replace(vh.view_name, 'beekon_data.mv_', ''), '.', '_') ||
            '_unique ON ' || vh.view_name || ' (appropriate_columns)' as action,
            'Enable concurrent refresh for uninterrupted read operations' as benefit
        FROM view_health vh
        WHERE NOT vh.supports_concurrent_refresh

        UNION ALL

        -- Medium priority: Large views that would benefit from concurrent refresh
        SELECT
            vh.view_name,
            2 as priority,
            'OPTIMIZE_LARGE_VIEW' as rec_type,
            'Consider partitioning or incremental refresh strategies' as action,
            'Reduce refresh time and system impact' as benefit
        FROM view_health vh
        WHERE vh.size_mb > 100 AND vh.supports_concurrent_refresh

        UNION ALL

        -- Low priority: Empty views
        SELECT
            vh.view_name,
            3 as priority,
            'EMPTY_VIEW' as rec_type,
            'Investigate data sources and refresh the view' as action,
            'Ensure view contains expected data' as benefit
        FROM view_health vh
        WHERE COALESCE(vh.row_count, 0) = 0

        UNION ALL

        -- System-level recommendations
        SELECT
            'SYSTEM' as view_name,
            CASE
                WHEN si.threshold_status = 'HIGH' THEN 1
                WHEN si.threshold_status = 'MEDIUM' THEN 2
                ELSE 3
            END as priority,
            'SYSTEM_' || si.metric_name as rec_type,
            si.recommendation as action,
            'Maintain system performance during refresh operations' as benefit
        FROM system_impact si
        WHERE si.threshold_status IN ('HIGH', 'MEDIUM')
    )
    SELECT
        r.view_name::TEXT,
        r.priority::INTEGER,
        r.rec_type::TEXT,
        r.action::TEXT,
        r.benefit::TEXT
    FROM recommendations r
    ORDER BY r.priority, r.view_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS FOR MONITORING FUNCTIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.check_materialized_view_health TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.check_materialized_view_health TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_refresh_operation_stats TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_refresh_operation_stats TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.check_refresh_system_impact TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.check_refresh_system_impact TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_refresh_recommendations TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_refresh_recommendations TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.check_materialized_view_health IS
'Comprehensive health check for all materialized views including concurrent refresh support, size, and performance metrics.';

COMMENT ON FUNCTION beekon_data.get_refresh_operation_stats IS
'Returns statistics about refresh operations over a specified time period including success rates and method usage.';

COMMENT ON FUNCTION beekon_data.check_refresh_system_impact IS
'Monitors system-level metrics that could impact materialized view refresh performance and provides recommendations.';

COMMENT ON FUNCTION beekon_data.get_refresh_recommendations IS
'Intelligent recommendation engine that analyzes view health and system status to suggest optimization actions.';