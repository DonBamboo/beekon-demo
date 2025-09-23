-- =================================================================
-- SAFELY ADD ANALYSIS STATUS COLUMNS TO COMPETITOR MATERIALIZED VIEWS
-- =================================================================
-- This migration adds analysis_status columns without dropping existing views
-- to avoid dependency conflicts with competitor_mv_status and other objects
-- =================================================================

-- =================================================================
-- 1. ADD ANALYSIS_STATUS COLUMN TO EXISTING MATERIALIZED VIEWS
-- =================================================================

-- Add analysis_status column to mv_competitor_performance
ALTER MATERIALIZED VIEW beekon_data.mv_competitor_performance
ADD COLUMN IF NOT EXISTS analysis_status TEXT;

-- Add analysis_status column to mv_competitor_share_of_voice
ALTER MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice
ADD COLUMN IF NOT EXISTS analysis_status TEXT;

-- =================================================================
-- 2. CREATE FUNCTION TO CALCULATE ANALYSIS STATUS
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
-- 3. UPDATE EXISTING DATA WITH CALCULATED STATUS
-- =================================================================

-- Update mv_competitor_performance with calculated status
UPDATE beekon_data.mv_competitor_performance
SET analysis_status = beekon_data.calculate_competitor_analysis_status(
    last_analysis_date,
    total_mentions,
    positive_mentions
)
WHERE analysis_status IS NULL;

-- Update mv_competitor_share_of_voice with calculated status
UPDATE beekon_data.mv_competitor_share_of_voice
SET analysis_status = beekon_data.calculate_competitor_analysis_status(
    last_analyzed_at,
    total_analyses,
    total_voice_mentions
)
WHERE analysis_status IS NULL;

-- =================================================================
-- 4. RECREATE MATERIALIZED VIEWS WITH STATUS CALCULATION
-- =================================================================

-- Since we can't ALTER the view definition, we need to recreate the views
-- But first, let's create new versions with _v2 suffix to avoid dependencies

CREATE MATERIALIZED VIEW beekon_data.mv_competitor_performance_v2 AS
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
    -- ANALYSIS STATUS CALCULATION
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

-- Create updated share of voice view with status
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice_v2 AS
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
    -- ANALYSIS STATUS CALCULATION
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
-- 5. CREATE INDEXES FOR NEW MATERIALIZED VIEWS
-- =================================================================

CREATE INDEX IF NOT EXISTS idx_mv_competitor_performance_v2_website_id ON beekon_data.mv_competitor_performance_v2(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_competitor_performance_v2_status ON beekon_data.mv_competitor_performance_v2(analysis_status);
CREATE INDEX IF NOT EXISTS idx_mv_competitor_performance_v2_last_analysis ON beekon_data.mv_competitor_performance_v2(last_analysis_date);

CREATE INDEX IF NOT EXISTS idx_mv_competitor_sov_v2_website_id ON beekon_data.mv_competitor_share_of_voice_v2(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_competitor_sov_v2_status ON beekon_data.mv_competitor_share_of_voice_v2(analysis_status);

-- =================================================================
-- 6. GRANT PERMISSIONS
-- =================================================================

GRANT SELECT ON beekon_data.mv_competitor_performance_v2 TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.calculate_competitor_analysis_status TO authenticated;

-- =================================================================
-- 7. ADD COMMENTS
-- =================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_performance_v2 IS 'NEW: Competitor performance metrics with built-in analysis_status calculation - safe version without dependencies';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice_v2 IS 'NEW: Share of voice data with analysis_status calculation - safe version without dependencies';
COMMENT ON FUNCTION beekon_data.calculate_competitor_analysis_status IS 'Helper function to calculate competitor analysis status consistently across views';

-- =================================================================
-- 8. REFRESH THE NEW MATERIALIZED VIEWS
-- =================================================================

REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_performance_v2;
REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice_v2;