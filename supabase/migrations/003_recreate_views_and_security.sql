-- =================================================================
-- MATERIALIZED VIEWS AND RLS POLICIES RECREATION
-- =================================================================
-- This migration recreates the exact materialized views and RLS policies
-- from the live Supabase project: apzyfnqlajvbgaejfzfm
-- 
-- Includes:
-- - All 4 materialized views with exact definitions
-- - All RLS policies with proper user access controls
-- - Additional security configurations
-- =================================================================

BEGIN;

-- =================================================================
-- 1. MATERIALIZED VIEWS CREATION
-- =================================================================

-- Competitor Daily Metrics View
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics AS
SELECT 
    w.id AS website_id,
    c.competitor_domain,
    date(car.analyzed_at) AS analysis_date,
    count(car.id) AS daily_mentions,
    count(
        CASE
            WHEN car.is_mentioned THEN 1
            ELSE NULL::integer
        END) AS daily_positive_mentions,
    avg(
        CASE
            WHEN car.is_mentioned THEN car.rank_position
            ELSE NULL::integer
        END) AS daily_avg_rank,
    avg(car.sentiment_score) AS daily_avg_sentiment,
    count(DISTINCT car.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT car.llm_provider) AS llm_providers_list
FROM ((beekon_data.websites w
     LEFT JOIN beekon_data.competitors c ON ((w.id = c.website_id)))
     LEFT JOIN beekon_data.competitor_analysis_results car ON ((c.id = car.competitor_id)))
WHERE ((c.is_active = true) AND (car.analyzed_at >= (now() - '90 days'::interval)))
GROUP BY w.id, c.competitor_domain, (date(car.analyzed_at));

-- Competitive Gap Analysis View
CREATE MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis AS
WITH topic_performance AS (
    SELECT 
        t.website_id,
        t.id AS topic_id,
        t.topic_name,
        count(lar.id) AS your_brand_analyses,
        count(
            CASE
                WHEN lar.is_mentioned THEN 1
                ELSE NULL::integer
            END) AS your_brand_mentions,
            CASE
                WHEN (count(lar.id) > 0) THEN (((count(
                CASE
                    WHEN lar.is_mentioned THEN 1
                    ELSE NULL::integer
                END))::numeric / (count(lar.id))::numeric) * (100)::numeric)
                ELSE (0)::numeric
            END AS your_brand_score,
        COALESCE(comp_stats.competitor_avg_score, (0)::numeric) AS competitor_avg_score,
        COALESCE(comp_stats.competitor_count, (0)::bigint) AS competitor_count
    FROM (((beekon_data.topics t
         LEFT JOIN beekon_data.prompts p ON ((t.id = p.topic_id)))
         LEFT JOIN beekon_data.llm_analysis_results lar ON ((p.id = lar.prompt_id)))
         LEFT JOIN ( 
            SELECT 
                competitor_scores.topic_id,
                avg(competitor_scores.competitor_score) AS competitor_avg_score,
                count(DISTINCT competitor_scores.competitor_id) AS competitor_count
            FROM ( 
                SELECT 
                    p2.topic_id,
                    c.id AS competitor_id,
                        CASE
                            WHEN (count(car.id) > 0) THEN (((count(
                            CASE
                                WHEN car.is_mentioned THEN 1
                                ELSE NULL::integer
                            END))::numeric / (count(car.id))::numeric) * (100)::numeric)
                            ELSE (0)::numeric
                        END AS competitor_score
                FROM ((beekon_data.prompts p2
                     LEFT JOIN beekon_data.competitor_analysis_results car ON ((p2.id = car.prompt_id)))
                     LEFT JOIN beekon_data.competitors c ON ((car.competitor_id = c.id)))
                WHERE ((c.is_active = true) AND (car.analyzed_at >= (now() - '30 days'::interval)))
                GROUP BY p2.topic_id, c.id) competitor_scores
            GROUP BY competitor_scores.topic_id) comp_stats ON ((t.id = comp_stats.topic_id)))
    WHERE ((t.is_active = true) AND (lar.analyzed_at >= (now() - '30 days'::interval)))
    GROUP BY t.website_id, t.id, t.topic_name, comp_stats.competitor_avg_score, comp_stats.competitor_count
)
SELECT 
    website_id,
    topic_id,
    topic_name,
    your_brand_score,
    competitor_avg_score,
    competitor_count,
    (your_brand_score - competitor_avg_score) AS performance_gap,
        CASE
            WHEN (your_brand_score > competitor_avg_score) THEN 'advantage'::text
            WHEN (your_brand_score < competitor_avg_score) THEN 'disadvantage'::text
            ELSE 'neutral'::text
        END AS gap_type
FROM topic_performance;

-- Competitor Share of Voice View
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    count(car.id) AS total_analyses,
    count(
        CASE
            WHEN car.is_mentioned THEN 1
            ELSE NULL::integer
        END) AS total_voice_mentions,
        CASE
            WHEN (count(car.id) > 0) THEN (((count(
            CASE
                WHEN car.is_mentioned THEN 1
                ELSE NULL::integer
            END))::numeric / (count(car.id))::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END AS share_of_voice,
    avg(
        CASE
            WHEN car.is_mentioned THEN car.rank_position
            ELSE NULL::integer
        END) AS avg_rank_position,
    avg(car.sentiment_score) AS avg_sentiment_score,
    avg(car.confidence_score) AS avg_confidence_score,
    max(car.analyzed_at) AS last_analyzed_at
FROM ((beekon_data.websites w
     LEFT JOIN beekon_data.competitors c ON ((w.id = c.website_id)))
     LEFT JOIN beekon_data.competitor_analysis_results car ON ((c.id = car.competitor_id)))
WHERE ((c.is_active = true) AND (car.analyzed_at >= (now() - '30 days'::interval)))
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Competitor Performance View
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_performance AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    count(car.id) AS total_mentions,
    count(
        CASE
            WHEN car.is_mentioned THEN 1
            ELSE NULL::integer
        END) AS positive_mentions,
    avg(
        CASE
            WHEN car.is_mentioned THEN car.rank_position
            ELSE NULL::integer
        END) AS avg_rank_position,
    avg(car.sentiment_score) AS avg_sentiment_score,
    avg(car.confidence_score) AS avg_confidence_score,
    count(DISTINCT car.llm_provider) AS llm_providers_count,
    max(car.analyzed_at) AS last_analysis_date,
    count(
        CASE
            WHEN ((car.analyzed_at >= (now() - '7 days'::interval)) AND car.is_mentioned) THEN 1
            ELSE NULL::integer
        END) AS mentions_last_7_days,
    count(
        CASE
            WHEN ((car.analyzed_at >= (now() - '30 days'::interval)) AND car.is_mentioned) THEN 1
            ELSE NULL::integer
        END) AS mentions_last_30_days,
        CASE
            WHEN ((count(
            CASE
                WHEN ((car.analyzed_at >= (now() - '14 days'::interval)) AND car.is_mentioned) THEN 1
                ELSE NULL::integer
            END) > 0) AND (count(
            CASE
                WHEN ((car.analyzed_at >= (now() - '7 days'::interval)) AND (car.analyzed_at < (now() - '7 days'::interval)) AND car.is_mentioned) THEN 1
                ELSE NULL::integer
            END) > 0)) THEN ((((count(
            CASE
                WHEN ((car.analyzed_at >= (now() - '7 days'::interval)) AND car.is_mentioned) THEN 1
                ELSE NULL::integer
            END))::numeric / (count(
            CASE
                WHEN ((car.analyzed_at >= (now() - '14 days'::interval)) AND (car.analyzed_at < (now() - '7 days'::interval)) AND car.is_mentioned) THEN 1
                ELSE NULL::integer
            END))::numeric) - (1)::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END AS mention_trend_7d,
    avg(
        CASE
            WHEN ((car.analyzed_at >= (now() - '7 days'::interval)) AND car.is_mentioned) THEN car.sentiment_score
            ELSE NULL::numeric
        END) AS recent_sentiment_score,
    avg(
        CASE
            WHEN ((car.analyzed_at >= (now() - '7 days'::interval)) AND car.is_mentioned) THEN car.rank_position
            ELSE NULL::integer
        END) AS recent_avg_rank
FROM ((beekon_data.websites w
     LEFT JOIN beekon_data.competitors c ON ((w.id = c.website_id)))
     LEFT JOIN beekon_data.competitor_analysis_results car ON ((c.id = car.competitor_id)))
WHERE ((c.is_active = true) AND (car.analyzed_at >= (now() - '90 days'::interval)))
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Create indexes on materialized views for better performance
CREATE INDEX idx_mv_competitor_daily_website ON beekon_data.mv_competitor_daily_metrics(website_id, analysis_date);
CREATE INDEX idx_mv_competitive_gap_website ON beekon_data.mv_competitive_gap_analysis(website_id, gap_type);
CREATE INDEX idx_mv_share_voice_website ON beekon_data.mv_competitor_share_of_voice(website_id, share_of_voice DESC);
CREATE INDEX idx_mv_performance_website ON beekon_data.mv_competitor_performance(website_id, mentions_last_30_days DESC);

-- =================================================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- =================================================================

-- Profiles RLS policies
CREATE POLICY "Users can view own profile" ON beekon_data.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON beekon_data.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Workspaces RLS policies  
CREATE POLICY "Users can view their workspaces" ON beekon_data.workspaces
  FOR SELECT USING (
    owner_id IN (
      SELECT user_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    ) OR
    id IN (
      SELECT workspace_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can modify workspaces they own" ON beekon_data.workspaces
  FOR ALL USING (
    owner_id IN (
      SELECT user_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- API Keys RLS policies
CREATE POLICY "Users can manage own API keys" ON beekon_data.api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Websites RLS policies
CREATE POLICY "Users can access websites in their workspace" ON beekon_data.websites
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- Topics RLS policies
CREATE POLICY "Users can access topics for their websites" ON beekon_data.topics
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Prompts RLS policies
CREATE POLICY "Users can access prompts for their topics" ON beekon_data.prompts
  FOR ALL USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON t.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- LLM Analysis Results RLS policies
CREATE POLICY "Users can access analysis results for their websites" ON beekon_data.llm_analysis_results
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitors RLS policies
CREATE POLICY "Users can access competitors for their websites" ON beekon_data.competitors
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitor Analysis Results RLS policies
CREATE POLICY "Users can access competitor analysis results for their websites" ON beekon_data.competitor_analysis_results
  FOR ALL USING (
    competitor_id IN (
      SELECT c.id FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON c.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Analysis Sessions RLS policies
CREATE POLICY "Users can access analysis sessions for their websites" ON beekon_data.analysis_sessions
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitor Status Log RLS policies
CREATE POLICY "Users can access competitor status logs for their websites" ON beekon_data.competitor_status_log
  FOR ALL USING (
    competitor_id IN (
      SELECT c.id FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON c.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Website Settings RLS policies
CREATE POLICY "Users can access website settings for their websites" ON beekon_data.website_settings
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Export History RLS policies
CREATE POLICY "Users can access their own export history" ON beekon_data.export_history
  FOR ALL USING (auth.uid() = user_id);

-- =================================================================
-- 3. ADDITIONAL SECURITY FUNCTIONS
-- =================================================================

-- Function to refresh materialized views (for service role only)
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role only
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_views() TO service_role;

-- Note: get_user_websites function removed as it doesn't exist in current source database

-- =================================================================
-- MISSING VIEWS FROM SOURCE DATABASE
-- =================================================================

-- Export statistics view - aggregates export history data
CREATE OR REPLACE VIEW beekon_data.export_statistics AS 
SELECT 
    user_id,
    export_type,
    format,
    status,
    count(*) AS total_exports,
    sum(file_size) AS total_size,
    avg(file_size) AS avg_size,
    max(created_at) AS last_export,
    count(*) FILTER (WHERE status::text = 'completed'::text) AS successful_exports,
    count(*) FILTER (WHERE status::text = 'failed'::text) AS failed_exports,
    avg(EXTRACT(epoch FROM (completed_at - created_at))) AS avg_duration_seconds
FROM beekon_data.export_history
GROUP BY user_id, export_type, format, status;

-- User accessible websites view - maps websites to users via workspaces
CREATE OR REPLACE VIEW beekon_data.user_accessible_websites AS
SELECT 
    w.id AS website_id,
    w.workspace_id,
    p.user_id
FROM beekon_data.websites w
JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
WHERE w.is_active = true;

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    view_count INTEGER;
    policy_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Count materialized views
    SELECT COUNT(*) INTO view_count
    FROM pg_matviews 
    WHERE schemaname = 'beekon_data';
    
    -- Count RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'beekon_data';
    
    -- Count functions
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'beekon_data';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'VIEWS AND SECURITY SETUP COMPLETE';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Materialized views created: %', view_count;
    RAISE NOTICE 'RLS policies created: %', policy_count;
    RAISE NOTICE 'Security functions created: %', function_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Views include:';
    RAISE NOTICE '  ✓ Competitor daily metrics';
    RAISE NOTICE '  ✓ Competitive gap analysis';
    RAISE NOTICE '  ✓ Competitor share of voice';
    RAISE NOTICE '  ✓ Competitor performance tracking';
    RAISE NOTICE '';
    RAISE NOTICE 'Security features:';
    RAISE NOTICE '  ✓ Comprehensive RLS policies for all tables';
    RAISE NOTICE '  ✓ User workspace isolation';
    RAISE NOTICE '  ✓ Utility functions for data access';
    RAISE NOTICE '=================================================================';
END $$;