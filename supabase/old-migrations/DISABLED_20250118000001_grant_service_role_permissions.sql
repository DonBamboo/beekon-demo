-- Grant service role permissions for Edge Function access
-- This migration ensures the service role can execute the materialized view refresh functions

-- Grant execute permissions to service_role for refresh functions
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO service_role;

-- Grant select permissions to service_role for materialized views (if needed for debugging)
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO service_role;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO service_role;
GRANT SELECT ON beekon_data.mv_competitor_performance TO service_role;
GRANT SELECT ON beekon_data.mv_competitor_daily_metrics TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS 'Refreshes all competitor performance materialized views - accessible by service_role for Edge Functions';
COMMENT ON FUNCTION beekon_data.refresh_competitor_analysis_views IS 'Refreshes all competitor analysis materialized views - accessible by service_role for Edge Functions';