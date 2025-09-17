-- =================================================================
-- DROP CASCADE AND RECREATE MATERIALIZED VIEWS WITH ANALYSIS STATUS
-- =================================================================
-- This migration drops existing materialized views with CASCADE to remove
-- dependencies, then recreates them with analysis_status built-in
-- =================================================================

-- =================================================================
-- 1. CREATE HELPER FUNCTION FOR STATUS CALCULATION
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.calculate_competitor_analysis_status(
    p_last_analysis_date TIMESTAMP WITH TIME ZONE,
    p_total_analyses BIGINT,
    p_positive_mentions BIGINT
)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN p_last_analysis_date > NOW() - INTERVAL '7 days' AND p_positive_mentions > 0 THEN 'active'
        WHEN p_last_analysis_date > NOW() - INTERVAL '30 days' AND p_positive_mentions > 0 THEN 'completed'
        WHEN p_total_analyses > 0 AND p_positive_mentions > 0 THEN 'completed'
        WHEN p_total_analyses > 0 THEN 'analyzing'
        ELSE 'pending'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- =================================================================
-- 2. DROP EXISTING MATERIALIZED VIEWS WITH CASCADE
-- =================================================================

-- Drop mv_competitor_performance and all dependent objects
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_performance CASCADE;

-- Drop mv_competitor_share_of_voice and all dependent objects
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_share_of_voice CASCADE;

-- =================================================================
-- 3. RECREATE mv_competitor_performance WITH ANALYSIS_STATUS
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_competitor_performance AS
SELECT
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    COUNT(car.id) AS total_mentions,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS positive_mentions,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    COUNT(DISTINCT car.llm_provider) AS llm_providers_count,
    MAX(car.analyzed_at) AS last_analysis_date,
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) AS mentions_last_7_days,
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '30 days' AND car.is_mentioned THEN 1 END) AS mentions_last_30_days,
    -- Calculate mention trend
    CASE
        WHEN COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) > 0
        THEN ((COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::NUMERIC /
               COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::NUMERIC) - 1) * 100
        ELSE 0
    END AS mention_trend_7d,
    -- Recent performance metrics
    AVG(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN car.sentiment_score END) AS recent_sentiment_score,
    AVG(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN car.rank_position END) AS recent_avg_rank,
    -- ANALYSIS STATUS CALCULATION - NEW COLUMN
    beekon_data.calculate_competitor_analysis_status(
        MAX(car.analyzed_at),
        COUNT(car.id),
        COUNT(CASE WHEN car.is_mentioned THEN 1 END)
    ) AS analysis_status
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND (car.analyzed_at >= NOW() - INTERVAL '90 days' OR car.id IS NULL)
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- =================================================================
-- 4. RECREATE mv_competitor_share_of_voice WITH ANALYSIS_STATUS
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice AS
SELECT
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    COUNT(car.id) AS total_analyses,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
    CASE
        WHEN COUNT(car.id) > 0
        THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::NUMERIC / COUNT(car.id)::NUMERIC) * 100
        ELSE 0
    END AS share_of_voice,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    MAX(car.analyzed_at) AS last_analyzed_at,
    -- ANALYSIS STATUS CALCULATION - NEW COLUMN
    beekon_data.calculate_competitor_analysis_status(
        MAX(car.analyzed_at),
        COUNT(car.id),
        COUNT(CASE WHEN car.is_mentioned THEN 1 END)
    ) AS analysis_status
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND (car.analyzed_at >= NOW() - INTERVAL '30 days' OR car.id IS NULL)
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- =================================================================
-- 5. RECREATE mv_website_dashboard_summary (DEPENDS ON SHARE OF VOICE)
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary AS
SELECT
    w.id AS website_id,
    w.domain,
    w.display_name,
    count(lar.id) AS total_brand_analyses,
    count(
        CASE
            WHEN lar.is_mentioned THEN 1
            ELSE NULL::integer
        END) AS total_brand_mentions,
        CASE
            WHEN (count(lar.id) > 0) THEN (((count(
            CASE
                WHEN lar.is_mentioned THEN 1
                ELSE NULL::integer
            END))::numeric / (count(lar.id))::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END AS brand_mention_rate,
    avg(lar.sentiment_score) AS avg_brand_sentiment,
    avg(lar.confidence_score) AS avg_brand_confidence,
    max(lar.analyzed_at) AS last_brand_analysis,
    COALESCE(comp_metrics.total_competitor_mentions, (0)::numeric) AS total_competitor_mentions,
    COALESCE(comp_metrics.competitor_count, (0)::bigint) AS competitor_count,
    COALESCE(comp_metrics.competitor_analysis_health_score, (75)::bigint) AS competitor_analysis_health_score
   FROM ((((beekon_data.websites w
     LEFT JOIN beekon_data.topics t ON (((w.id = t.website_id) AND (t.is_active = true))))
     LEFT JOIN beekon_data.prompts p ON (((t.id = p.topic_id) AND (p.is_active = true))))
     LEFT JOIN beekon_data.llm_analysis_results lar ON (((p.id = lar.prompt_id) AND (lar.analyzed_at >= (now() - '90 days'::interval)))))
     LEFT JOIN ( SELECT mv.website_id,
            sum(mv.total_voice_mentions) AS total_competitor_mentions,
            count(DISTINCT mv.competitor_id) AS competitor_count,
                CASE
                    WHEN (sum(mv.total_voice_mentions) > (0)::numeric) THEN LEAST((100)::bigint, (50 + (count(DISTINCT mv.competitor_id) * 5)))
                    ELSE (75)::bigint
                END AS competitor_analysis_health_score
           FROM beekon_data.mv_competitor_share_of_voice mv
          GROUP BY mv.website_id) comp_metrics ON ((w.id = comp_metrics.website_id)))
  WHERE (w.is_active = true)
  GROUP BY w.id, w.domain, w.display_name, comp_metrics.total_competitor_mentions, comp_metrics.competitor_count, comp_metrics.competitor_analysis_health_score;

-- =================================================================
-- 6. RECREATE DEPENDENT VIEWS THAT WERE DROPPED
-- =================================================================

-- Recreate competitor_mv_status view (metadata monitoring)
CREATE OR REPLACE VIEW beekon_data.competitor_mv_status AS
SELECT 'mv_competitor_share_of_voice'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_competitor_share_of_voice) AS row_count,
    ( SELECT max(mv_competitor_share_of_voice.last_analyzed_at) AS max
           FROM beekon_data.mv_competitor_share_of_voice) AS latest_data
UNION ALL
 SELECT 'mv_competitor_performance'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_competitor_performance) AS row_count,
    ( SELECT max(mv_competitor_performance.last_analysis_date) AS max
           FROM beekon_data.mv_competitor_performance) AS latest_data
UNION ALL
 SELECT 'mv_competitor_daily_metrics'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_competitor_daily_metrics) AS row_count,
    ( SELECT max(mv_competitor_daily_metrics.analysis_date) AS max
           FROM beekon_data.mv_competitor_daily_metrics) AS latest_data;

-- Recreate materialized_view_health view (health monitoring)
CREATE OR REPLACE VIEW beekon_data.materialized_view_health AS
SELECT 'mv_competitor_share_of_voice'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_competitor_share_of_voice) AS row_count,
    ( SELECT max(mv_competitor_share_of_voice.last_analyzed_at) AS max
           FROM beekon_data.mv_competitor_share_of_voice) AS latest_data,
        CASE
            WHEN (( SELECT max(mv_competitor_share_of_voice.last_analyzed_at) AS max
               FROM beekon_data.mv_competitor_share_of_voice) >= (now() - '2 days'::interval)) THEN 'FRESH'::text
            ELSE 'STALE'::text
        END AS data_freshness
UNION ALL
 SELECT 'mv_website_dashboard_summary'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_website_dashboard_summary) AS row_count,
    ( SELECT max(mv_website_dashboard_summary.last_brand_analysis) AS max
           FROM beekon_data.mv_website_dashboard_summary) AS latest_data,
        CASE
            WHEN (( SELECT max(mv_website_dashboard_summary.last_brand_analysis) AS max
               FROM beekon_data.mv_website_dashboard_summary) >= (now() - '2 days'::interval)) THEN 'FRESH'::text
            ELSE 'STALE'::text
        END AS data_freshness
UNION ALL
 SELECT 'mv_competitive_gap_analysis'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_competitive_gap_analysis) AS row_count,
    NULL::timestamp with time zone AS latest_data,
    'N/A'::text AS data_freshness
UNION ALL
 SELECT 'mv_competitor_daily_metrics'::text AS view_name,
    ( SELECT count(*) AS count
           FROM beekon_data.mv_competitor_daily_metrics) AS row_count,
    ( SELECT (max(mv_competitor_daily_metrics.analysis_date))::timestamp with time zone AS max
           FROM beekon_data.mv_competitor_daily_metrics) AS latest_data,
        CASE
            WHEN (( SELECT max(mv_competitor_daily_metrics.analysis_date) AS max
               FROM beekon_data.mv_competitor_daily_metrics) >= (CURRENT_DATE - 2)) THEN 'FRESH'::text
            ELSE 'STALE'::text
        END AS data_freshness;

-- =================================================================
-- 7. CREATE INDEXES FOR MATERIALIZED VIEWS
-- =================================================================

-- Indexes for mv_competitor_performance
CREATE INDEX idx_mv_competitor_performance_website_id ON beekon_data.mv_competitor_performance(website_id);
CREATE INDEX idx_mv_competitor_performance_status ON beekon_data.mv_competitor_performance(analysis_status);
CREATE INDEX idx_mv_competitor_performance_last_analysis ON beekon_data.mv_competitor_performance(last_analysis_date);
CREATE INDEX idx_mv_competitor_performance_positive_mentions ON beekon_data.mv_competitor_performance(positive_mentions);

-- Indexes for mv_competitor_share_of_voice
CREATE INDEX idx_mv_competitor_sov_website_id ON beekon_data.mv_competitor_share_of_voice(website_id);
CREATE INDEX idx_mv_competitor_sov_status ON beekon_data.mv_competitor_share_of_voice(analysis_status);
CREATE INDEX idx_mv_competitor_sov_share ON beekon_data.mv_competitor_share_of_voice(share_of_voice);
CREATE INDEX idx_mv_competitor_sov_last_analyzed ON beekon_data.mv_competitor_share_of_voice(last_analyzed_at);

-- Indexes for mv_website_dashboard_summary
CREATE INDEX idx_mv_website_dashboard_website_id ON beekon_data.mv_website_dashboard_summary(website_id);
CREATE INDEX idx_mv_website_dashboard_last_brand_analysis ON beekon_data.mv_website_dashboard_summary(last_brand_analysis);

-- =================================================================
-- 8. DROP AND RECREATE FUNCTIONS WITH NEW RETURN TYPES
-- =================================================================

-- Drop existing functions first (required to change return type)
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS beekon_data.get_competitor_performance(UUID, INTEGER, INTEGER);

-- Recreate get_competitor_share_of_voice with analysis_status in return type
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_share_of_voice(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name TEXT,
    competitor_domain TEXT,
    total_analyses BIGINT,
    total_voice_mentions BIGINT,
    share_of_voice DECIMAL,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL,
    analysis_status TEXT,
    last_analyzed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv.competitor_id,
        mv.competitor_name,
        mv.competitor_domain,
        mv.total_analyses,
        mv.total_voice_mentions,
        mv.share_of_voice,
        mv.avg_rank_position,
        mv.avg_sentiment_score,
        mv.avg_confidence_score,
        mv.analysis_status, -- NOW AVAILABLE from recreated view
        mv.last_analyzed_at
    FROM beekon_data.mv_competitor_share_of_voice mv
    WHERE mv.website_id = p_website_id
    -- Apply date filtering on the materialized view results
    AND (mv.last_analyzed_at IS NULL OR mv.last_analyzed_at BETWEEN p_date_start AND p_date_end)
    ORDER BY mv.share_of_voice DESC, mv.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate get_competitor_performance with analysis_status in return type
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_performance(
    p_website_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name TEXT,
    competitor_domain TEXT,
    total_mentions BIGINT,
    positive_mentions BIGINT,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL,
    llm_providers_count BIGINT,
    last_analysis_date TIMESTAMP WITH TIME ZONE,
    analysis_status TEXT,
    mention_trend_7d DECIMAL,
    mentions_last_7_days BIGINT,
    mentions_last_30_days BIGINT,
    recent_sentiment_score DECIMAL,
    recent_avg_rank DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv.competitor_id,
        mv.competitor_name,
        mv.competitor_domain,
        mv.total_mentions,
        mv.positive_mentions,
        mv.avg_rank_position,
        mv.avg_sentiment_score,
        mv.avg_confidence_score,
        mv.llm_providers_count,
        mv.last_analysis_date,
        mv.analysis_status, -- NOW AVAILABLE from recreated view
        mv.mention_trend_7d,
        mv.mentions_last_7_days,
        mv.mentions_last_30_days,
        mv.recent_sentiment_score,
        mv.recent_avg_rank
    FROM beekon_data.mv_competitor_performance mv
    WHERE mv.website_id = p_website_id
    ORDER BY mv.positive_mentions DESC, mv.total_mentions DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 9. GRANT PERMISSIONS
-- =================================================================

GRANT SELECT ON beekon_data.mv_competitor_performance TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;
GRANT SELECT ON beekon_data.mv_website_dashboard_summary TO authenticated;
GRANT SELECT ON beekon_data.competitor_mv_status TO authenticated;
GRANT SELECT ON beekon_data.materialized_view_health TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.calculate_competitor_analysis_status TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance TO authenticated;

-- =================================================================
-- 10. ADD COMMENTS
-- =================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_performance IS 'UPDATED: Competitor performance metrics with built-in analysis_status calculation';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'UPDATED: Share of voice data with built-in analysis_status calculation';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary IS 'RECREATED: Website dashboard summary with competitor metrics - depends on share of voice view';
COMMENT ON FUNCTION beekon_data.calculate_competitor_analysis_status IS 'Helper function to calculate competitor analysis status consistently';
COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'UPDATED: Now returns analysis_status field from recreated materialized view';
COMMENT ON FUNCTION beekon_data.get_competitor_performance IS 'UPDATED: Now returns analysis_status field from recreated materialized view';

-- =================================================================
-- 11. REFRESH THE MATERIALIZED VIEWS
-- =================================================================

REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_performance;
REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice;
REFRESH MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary;

-- =================================================================
-- MIGRATION COMPLETE
-- =================================================================
-- Expected results:
-- 1. Materialized views now include analysis_status column
-- 2. Functions automatically return analysis_status (no app changes needed)
-- 3. Competitors with analysis data will show "completed" instead of "pending"
-- 4. Dependent views recreated and functional
-- 5. All existing functionality preserved
-- =================================================================