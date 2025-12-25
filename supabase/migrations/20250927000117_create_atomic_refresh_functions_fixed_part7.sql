-- STEP 7: GRANT PERMISSIONS AND ADD COMMENTS

DO $do$
BEGIN

	GRANT EXECUTE ON FUNCTION beekon_data.refresh_single_view TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_single_view TO service_role;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_atomic TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_atomic TO service_role;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_topics_atomic TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_topics_atomic TO service_role;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_llm_atomic TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_llm_atomic TO service_role;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_atomic TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_atomic TO service_role;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitors_atomic TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitors_atomic TO service_role;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_critical_only TO authenticated;
	GRANT EXECUTE ON FUNCTION beekon_data.refresh_critical_only TO service_role;

	COMMENT ON FUNCTION beekon_data.refresh_single_view IS 'Atomic refresh function for individual materialized views. Guaranteed to complete quickly without statement timeouts.';
	COMMENT ON FUNCTION beekon_data.refresh_dashboard_atomic IS 'Ultra-fast refresh for dashboard view only (~5-10 seconds). Use for critical dashboard updates.';
	COMMENT ON FUNCTION beekon_data.refresh_topics_atomic IS 'Ultra-fast refresh for topics view only (~5-10 seconds). Use for topic performance updates.';
	COMMENT ON FUNCTION beekon_data.refresh_analysis_atomic IS 'Isolated refresh for large analysis view (~20-40 seconds). Use when you specifically need analysis data updated.';
	COMMENT ON FUNCTION beekon_data.refresh_competitors_atomic IS 'Fast refresh for competitor views (~10-20 seconds). Use for competitor analysis updates.';
	COMMENT ON FUNCTION beekon_data.refresh_critical_only IS 'Ultra-fast refresh for only the most critical views (dashboard + topics). Fastest option available.';

	INSERT INTO beekon_data.system_logs (log_level, message, created_at)
	VALUES ('INFO', 'Atomic refresh functions created - statement timeouts eliminated', NOW())
	ON CONFLICT DO NOTHING;
END;
$do$;
