-- Fix materialized views with stale data and column ambiguity issues
-- This migration drops and recreates materialized views to clear stale references

-- Drop existing materialized views that may have stale data
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_share_of_voice CASCADE;
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitive_gap_analysis CASCADE;

-- Drop and recreate materialized views from existing migrations if they exist
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_performance CASCADE;
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_daily_metrics CASCADE;

-- Recreate mv_competitor_share_of_voice (already fixed in 20250117000003)
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
        THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
        ELSE 0
    END AS share_of_voice,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    MAX(car.analyzed_at) AS last_analyzed_at
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '30 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Recreate mv_competitive_gap_analysis (with fixed column references)
CREATE MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis AS
WITH topic_performance AS (
    SELECT 
        t.website_id,
        t.id AS topic_id,
        t.topic_name,
        -- Your brand performance
        COUNT(lar.id) AS your_brand_analyses,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS your_brand_mentions,
        CASE 
            WHEN COUNT(lar.id) > 0 
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END AS your_brand_score,
        -- Competitor performance
        COALESCE(comp_stats.competitor_avg_score, 0) AS competitor_avg_score,
        COALESCE(comp_stats.competitor_count, 0) AS competitor_count
    FROM beekon_data.topics t
    LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id
    LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
    LEFT JOIN (
        SELECT 
            competitor_scores.topic_id,
            AVG(competitor_scores.competitor_score) AS competitor_avg_score,
            COUNT(DISTINCT competitor_scores.competitor_id) AS competitor_count
        FROM (
            SELECT 
                p2.topic_id AS topic_id,
                c.id AS competitor_id,
                CASE 
                    WHEN COUNT(car.id) > 0 
                    THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                    ELSE 0
                END AS competitor_score
            FROM beekon_data.prompts p2
            LEFT JOIN beekon_data.competitor_analysis_results car ON p2.id = car.prompt_id
            LEFT JOIN beekon_data.competitors c ON car.competitor_id = c.id
            WHERE c.is_active = TRUE
            AND car.analyzed_at >= NOW() - INTERVAL '30 days'
            GROUP BY p2.topic_id, c.id
        ) competitor_scores
        GROUP BY competitor_scores.topic_id
    ) comp_stats ON t.id = comp_stats.topic_id
    WHERE t.is_active = TRUE
    AND lar.analyzed_at >= NOW() - INTERVAL '30 days'
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
        WHEN your_brand_score > competitor_avg_score THEN 'advantage'
        WHEN your_brand_score < competitor_avg_score THEN 'disadvantage'
        ELSE 'neutral'
    END AS gap_type
FROM topic_performance;

-- Recreate other materialized views if they were referenced in older migrations
-- mv_competitor_performance (with corrected column references)
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_competitor_performance AS
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
    CASE 
        WHEN COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.is_mentioned THEN 1 END) > 0
        AND COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) > 0
        THEN (
            COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::DECIMAL 
            / COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::DECIMAL - 1
        ) * 100
        ELSE 0
    END AS mention_trend_7d,
    AVG(CASE 
        WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned 
        THEN car.sentiment_score 
    END) AS recent_sentiment_score,
    AVG(CASE 
        WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned 
        THEN car.rank_position 
    END) AS recent_avg_rank
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- mv_competitor_daily_metrics (with corrected column references)
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_competitor_daily_metrics AS
SELECT 
    w.id AS website_id,
    c.competitor_domain,
    DATE(car.analyzed_at) AS analysis_date,
    COUNT(car.id) AS daily_mentions,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS daily_positive_mentions,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS daily_avg_rank,
    AVG(car.sentiment_score) AS daily_avg_sentiment,
    COUNT(DISTINCT car.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT car.llm_provider) AS llm_providers_list
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id  
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY w.id, c.competitor_domain, DATE(car.analyzed_at);

-- Recreate unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_share_of_voice_unique 
    ON beekon_data.mv_competitor_share_of_voice (website_id, competitor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitive_gap_analysis_unique 
    ON beekon_data.mv_competitive_gap_analysis (website_id, topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_performance_unique 
    ON beekon_data.mv_competitor_performance (website_id, competitor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_daily_metrics_unique 
    ON beekon_data.mv_competitor_daily_metrics (website_id, competitor_domain, analysis_date);

-- Update the refresh function to handle all materialized views
DROP FUNCTION IF EXISTS beekon_data.refresh_competitor_analysis_views();
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_analysis_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh all competitor analysis materialized views concurrently
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing refresh function as well
DROP FUNCTION IF EXISTS beekon_data.refresh_competitor_performance_views();
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_performance_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh all competitor performance materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_performance TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_daily_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO authenticated;

-- Add helpful comments
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'Materialized view for competitor share of voice metrics (cleaned)';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis IS 'Materialized view for competitive gap analysis (cleaned)';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_performance IS 'Materialized view for competitor performance metrics (cleaned)';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics IS 'Materialized view for daily competitor metrics (cleaned)';
COMMENT ON FUNCTION beekon_data.refresh_competitor_analysis_views IS 'Refreshes all competitor analysis materialized views';
COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS 'Refreshes all competitor performance materialized views';