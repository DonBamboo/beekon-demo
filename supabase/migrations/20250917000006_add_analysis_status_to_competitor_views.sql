-- =================================================================
-- ADD ANALYSIS STATUS TO COMPETITOR MATERIALIZED VIEWS
-- =================================================================
-- This migration adds calculated analysis_status columns to materialized views
-- to fix the issue where all competitors show as "pending" in the UI
-- =================================================================

-- =================================================================
-- 1. UPDATE mv_competitor_performance TO INCLUDE ANALYSIS_STATUS
-- =================================================================

-- Drop and recreate the materialized view with analysis_status
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_performance;

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
    -- FIXED: Add proper analysis_status calculation
    CASE
        WHEN MAX(car.analyzed_at) > NOW() - INTERVAL '7 days' AND COUNT(CASE WHEN car.is_mentioned THEN 1 END) > 0 THEN 'active'
        WHEN MAX(car.analyzed_at) > NOW() - INTERVAL '30 days' AND COUNT(CASE WHEN car.is_mentioned THEN 1 END) > 0 THEN 'completed'
        WHEN COUNT(car.id) > 0 AND COUNT(CASE WHEN car.is_mentioned THEN 1 END) > 0 THEN 'completed'
        WHEN COUNT(car.id) > 0 THEN 'analyzing'
        ELSE 'pending'
    END AS analysis_status,
    -- Calculate 7-day mention trend
    CASE
        WHEN COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) > 0
        THEN ((COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::NUMERIC /
               COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::NUMERIC) - 1) * 100
        ELSE 0
    END AS mention_trend_7d,
    -- Recent performance metrics for trend analysis
    AVG(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN car.sentiment_score END) AS recent_sentiment_score,
    AVG(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN car.rank_position END) AS recent_avg_rank
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND (car.analyzed_at >= NOW() - INTERVAL '90 days' OR car.id IS NULL)
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_mv_competitor_performance_website_id ON beekon_data.mv_competitor_performance(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_competitor_performance_status ON beekon_data.mv_competitor_performance(analysis_status);
CREATE INDEX IF NOT EXISTS idx_mv_competitor_performance_last_analysis ON beekon_data.mv_competitor_performance(last_analysis_date);

-- =================================================================
-- 2. UPDATE mv_competitor_share_of_voice TO INCLUDE ANALYSIS_STATUS
-- =================================================================

-- Drop and recreate the share of voice view with analysis_status
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_share_of_voice;

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
    -- FIXED: Add analysis_status to share of voice view
    CASE
        WHEN MAX(car.analyzed_at) > NOW() - INTERVAL '7 days' AND COUNT(CASE WHEN car.is_mentioned THEN 1 END) > 0 THEN 'active'
        WHEN MAX(car.analyzed_at) > NOW() - INTERVAL '30 days' AND COUNT(CASE WHEN car.is_mentioned THEN 1 END) > 0 THEN 'completed'
        WHEN COUNT(car.id) > 0 AND COUNT(CASE WHEN car.is_mentioned THEN 1 END) > 0 THEN 'completed'
        WHEN COUNT(car.id) > 0 THEN 'analyzing'
        ELSE 'pending'
    END AS analysis_status
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND (car.analyzed_at >= NOW() - INTERVAL '30 days' OR car.id IS NULL)
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_mv_competitor_sov_website_id ON beekon_data.mv_competitor_share_of_voice(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_competitor_sov_status ON beekon_data.mv_competitor_share_of_voice(analysis_status);

-- =================================================================
-- 3. REFRESH MATERIALIZED VIEWS TO POPULATE NEW COLUMNS
-- =================================================================

REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_performance;
REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice;

-- =================================================================
-- 4. GRANT PERMISSIONS
-- =================================================================

GRANT SELECT ON beekon_data.mv_competitor_performance TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;

-- =================================================================
-- 5. ADD COMMENTS
-- =================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_performance IS 'UPDATED: Competitor performance metrics with calculated analysis_status column to fix pending status display issue';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'UPDATED: Share of voice data with analysis_status for proper competitor status display';

COMMENT ON COLUMN beekon_data.mv_competitor_performance.analysis_status IS 'Calculated status: pending (no data) → analyzing (has data, no mentions) → completed (has mentions) → active (recent mentions)';
COMMENT ON COLUMN beekon_data.mv_competitor_share_of_voice.analysis_status IS 'Calculated status: pending (no data) → analyzing (has data, no mentions) → completed (has mentions) → active (recent mentions)';