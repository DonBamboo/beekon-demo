-- =========================================================================
-- FIX SHARE OF VOICE CALCULATION BUG IN MATERIALIZED VIEW
-- =========================================================================

-- The issue: daily_mentions was counting ALL analysis records instead of actual mentions
-- This caused artificial "equal splits" when competitors had same analysis record counts
-- but different actual mention counts (e.g., Nike 399 mentions vs New Balance 160 mentions)

-- =========================================================================
-- 1. DROP EXISTING MATERIALIZED VIEW AND DEPENDENT FUNCTIONS
-- =========================================================================

DROP FUNCTION IF EXISTS beekon_data.get_competitor_time_series(UUID, TEXT, INTEGER);
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_daily_metrics CASCADE;

-- =========================================================================
-- 2. CREATE CORRECTED MATERIALIZED VIEW WITH PROPER MENTION COUNTING
-- =========================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics AS
-- Competitor data with CORRECTED mention counting
SELECT
    w.id AS website_id,
    c.competitor_domain,
    c.id AS competitor_id,
    COALESCE(c.competitor_name, c.competitor_domain) AS competitor_name,
    date(car.analyzed_at) AS analysis_date,
    -- FIX: Use actual mentions instead of total analysis records
    count(CASE WHEN car.is_mentioned THEN 1 END) AS daily_mentions,
    count(CASE WHEN car.is_mentioned THEN 1 END) AS daily_positive_mentions,
    avg(CASE WHEN car.is_mentioned THEN car.rank_position END) AS daily_avg_rank,
    avg(car.sentiment_score) AS daily_avg_sentiment,
    count(DISTINCT car.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT car.llm_provider) AS llm_providers_list,
    false AS is_your_brand
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = true
    AND car.analyzed_at >= (now() - '90 days'::interval)
GROUP BY w.id, c.competitor_domain, c.id, c.competitor_name, date(car.analyzed_at)

UNION ALL

-- "Your Brand" data with CORRECTED mention counting
SELECT
    w.id AS website_id,
    w.domain AS competitor_domain,
    '00000000-0000-0000-0000-000000000000'::uuid AS competitor_id,
    'Your Brand' AS competitor_name,
    date(lar.analyzed_at) AS analysis_date,
    -- FIX: Use actual mentions instead of total analysis records
    count(CASE WHEN lar.is_mentioned THEN 1 END) AS daily_mentions,
    count(CASE WHEN lar.is_mentioned THEN 1 END) AS daily_positive_mentions,
    avg(CASE WHEN lar.is_mentioned THEN lar.rank_position END) AS daily_avg_rank,
    avg(lar.sentiment_score) AS daily_avg_sentiment,
    count(DISTINCT lar.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT lar.llm_provider) AS llm_providers_list,
    true AS is_your_brand
FROM beekon_data.websites w
JOIN beekon_data.prompts p ON p.topic_id IN (
    SELECT t.id FROM beekon_data.topics t WHERE t.website_id = w.id AND t.is_active = true
)
JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
WHERE w.is_active = true
    AND lar.analyzed_at >= (now() - '90 days'::interval)
    AND p.is_active = true
GROUP BY w.id, w.domain, date(lar.analyzed_at);

-- =========================================================================
-- 3. CREATE PERFORMANCE INDEXES
-- =========================================================================

CREATE INDEX idx_mv_competitor_daily_metrics_website_date
ON beekon_data.mv_competitor_daily_metrics(website_id, analysis_date);

CREATE INDEX idx_mv_competitor_daily_metrics_competitor
ON beekon_data.mv_competitor_daily_metrics(competitor_id, is_your_brand);

-- =========================================================================
-- 4. RECREATE FIXED FUNCTION WITH PROPER SHARE OF VOICE CALCULATION
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_competitor_time_series(
    p_website_id UUID,
    p_competitor_domain TEXT DEFAULT NULL,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    analysis_date DATE,
    competitor_id UUID,
    competitor_domain TEXT,
    competitor_name TEXT,
    daily_mentions BIGINT,
    daily_positive_mentions BIGINT,
    daily_avg_rank NUMERIC,
    daily_avg_sentiment NUMERIC,
    daily_llm_providers BIGINT,
    is_your_brand BOOLEAN,
    share_of_voice NUMERIC,
    total_daily_mentions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH daily_totals AS (
        -- Calculate total ACTUAL mentions per day across all competitors
        SELECT
            cdm.analysis_date,
            SUM(cdm.daily_mentions)::BIGINT as day_total_mentions
        FROM beekon_data.mv_competitor_daily_metrics cdm
        WHERE cdm.website_id = p_website_id
            AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
        GROUP BY cdm.analysis_date
    ),
    competitor_data AS (
        -- Get competitor data with ACCURATE share of voice calculation
        SELECT
            cdm.analysis_date,
            cdm.competitor_id,
            cdm.competitor_domain,
            cdm.competitor_name,
            cdm.daily_mentions,
            cdm.daily_positive_mentions,
            cdm.daily_avg_rank,
            cdm.daily_avg_sentiment,
            cdm.daily_llm_providers,
            cdm.is_your_brand,
            dt.day_total_mentions,
            -- Calculate ACCURATE share of voice based on actual mentions
            CASE
                WHEN dt.day_total_mentions > 0
                THEN ROUND((cdm.daily_mentions::NUMERIC / dt.day_total_mentions::NUMERIC) * 100, 2)
                ELSE 0::NUMERIC
            END as share_of_voice
        FROM beekon_data.mv_competitor_daily_metrics cdm
        JOIN daily_totals dt ON cdm.analysis_date = dt.analysis_date
        WHERE cdm.website_id = p_website_id
            AND (p_competitor_domain IS NULL OR cdm.competitor_domain = p_competitor_domain)
            AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
    )
    SELECT
        cd.analysis_date,
        cd.competitor_id,
        cd.competitor_domain,
        cd.competitor_name,
        cd.daily_mentions,
        cd.daily_positive_mentions,
        cd.daily_avg_rank,
        cd.daily_avg_sentiment,
        cd.daily_llm_providers,
        cd.is_your_brand,
        cd.share_of_voice,
        cd.day_total_mentions
    FROM competitor_data cd
    ORDER BY cd.analysis_date DESC, cd.competitor_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 5. GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_time_series TO service_role;

-- =========================================================================
-- 6. ADD COMMENTS
-- =========================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics IS
'FIXED: Daily metrics now correctly count actual mentions (is_mentioned=true) instead of total analysis records. This provides accurate share of voice calculations based on real competitor performance.';

COMMENT ON FUNCTION beekon_data.get_competitor_time_series IS
'FIXED: Returns accurate share of voice based on actual mentions. Now correctly shows different percentages for competitors with different mention counts instead of artificial equal splits.';