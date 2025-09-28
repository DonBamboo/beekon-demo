-- =========================================================================
-- FIX COMPETITOR TIME SERIES FUNCTION TO INCLUDE SHARE OF VOICE CALCULATION
-- =========================================================================

-- This migration fixes the get_competitor_time_series function to properly
-- calculate and return share of voice percentages, which is required by
-- the ShareOfVoiceChart component

-- =========================================================================
-- 1. DROP EXISTING FUNCTION TO AVOID CONFLICTS
-- =========================================================================

DROP FUNCTION IF EXISTS beekon_data.get_competitor_time_series(UUID, TEXT, INTEGER);

-- =========================================================================
-- 2. CREATE ENHANCED FUNCTION WITH SHARE OF VOICE CALCULATION
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
    share_of_voice NUMERIC,  -- New: Share of voice percentage
    total_daily_mentions BIGINT  -- New: Total mentions for the day (for reference)
) AS $$
BEGIN
    RETURN QUERY
    WITH daily_totals AS (
        -- Calculate total mentions per day across all competitors
        SELECT
            cdm.analysis_date,
            SUM(cdm.daily_mentions) as day_total_mentions
        FROM beekon_data.mv_competitor_daily_metrics cdm
        WHERE cdm.website_id = p_website_id
            AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
        GROUP BY cdm.analysis_date
    ),
    competitor_data AS (
        -- Get competitor data with share of voice calculation
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
            -- Calculate share of voice as percentage
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
-- 3. GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_time_series TO service_role;

-- =========================================================================
-- 4. ADD FUNCTION COMMENT
-- =========================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_time_series IS
'Enhanced competitor time series function with share of voice calculation. Returns daily competitor metrics including proper share of voice percentages that sum to 100% per day.';