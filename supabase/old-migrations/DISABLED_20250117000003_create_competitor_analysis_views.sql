-- Create materialized view for competitor share of voice
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_competitor_share_of_voice AS
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

-- Create unique index on materialized view for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_share_of_voice_unique 
    ON beekon_data.mv_competitor_share_of_voice (website_id, competitor_id);

-- Create materialized view for competitive gap analysis  
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_competitive_gap_analysis AS
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

-- Create unique index on competitive gap analysis materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitive_gap_analysis_unique 
    ON beekon_data.mv_competitive_gap_analysis (website_id, topic_id);

-- Create function to refresh competitor analysis views
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_analysis_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
    -- Note: Only refresh views that exist in this migration
    -- mv_competitor_performance and mv_competitor_daily_metrics are from different migrations
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO authenticated;

-- Add helpful comments
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'Materialized view for competitor share of voice metrics';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis IS 'Materialized view for competitive gap analysis';
COMMENT ON FUNCTION beekon_data.refresh_competitor_analysis_views IS 'Refreshes all competitor analysis materialized views';