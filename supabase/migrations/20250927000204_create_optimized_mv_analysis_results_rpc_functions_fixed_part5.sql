-- GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_results_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_results_optimized TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_summary_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_summary_optimized TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_optimized TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_provider_performance_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_provider_performance_optimized TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_sessions_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_sessions_optimized TO service_role;

-- ADD COMMENTS
COMMENT ON FUNCTION beekon_data.get_analysis_results_optimized IS 'Lightning-fast analysis results query using mv_analysis_results materialized view. Supports pagination, filtering by topic, LLM provider, date range, and search queries.';
COMMENT ON FUNCTION beekon_data.get_analysis_summary_optimized IS 'Get comprehensive analysis summary statistics using pre-computed materialized view data. Returns overall performance metrics and top/bottom performing topics.';
COMMENT ON FUNCTION beekon_data.get_topic_performance_optimized IS 'Get topic-level performance metrics leveraging pre-computed aggregations from mv_analysis_results. Extremely fast as it uses window function results.';
COMMENT ON FUNCTION beekon_data.get_llm_provider_performance_optimized IS 'Get LLM provider performance comparison using materialized view data. Shows performance across different AI providers.';
COMMENT ON FUNCTION beekon_data.get_analysis_sessions_optimized IS 'Get analysis session summaries with result counts and performance metrics. Perfect for session management and overview dashboards.';

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Optimized mv_analysis_results RPC functions created - direct cURL access available', NOW())
ON CONFLICT DO NOTHING;
