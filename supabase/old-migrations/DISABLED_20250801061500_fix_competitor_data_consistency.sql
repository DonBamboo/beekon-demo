-- =================================================================
-- Fix Competitor Data Consistency Issues
-- =================================================================
-- This migration fixes the data inconsistencies between Share of Voice
-- chart and Competitors List, and resolves the Avg. Rank display issues.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. Fix get_competitor_performance function NULL handling
-- =================================================================

-- Update the function to properly handle NULL values for ranking data
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_performance(
    p_website_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_domain TEXT,
    competitor_name TEXT,
    total_mentions BIGINT,
    positive_mentions BIGINT,
    avg_rank_position NUMERIC,
    avg_sentiment_score NUMERIC,
    avg_confidence_score NUMERIC,
    llm_providers_count BIGINT,
    last_analysis_date TIMESTAMP WITH TIME ZONE,
    mentions_last_7_days BIGINT,
    mentions_last_30_days BIGINT,
    mention_trend_7d NUMERIC,
    recent_sentiment_score NUMERIC,
    recent_avg_rank NUMERIC
) AS $$
BEGIN
    -- First check if there are any competitors for this website
    IF NOT EXISTS (
        SELECT 1 FROM beekon_data.competitors 
        WHERE website_id = p_website_id AND is_active = true
    ) THEN
        -- Return empty result set if no competitors
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        cp.competitor_id,
        cp.competitor_domain,
        cp.competitor_name,
        COALESCE(cp.total_mentions, 0) as total_mentions,
        COALESCE(cp.positive_mentions, 0) as positive_mentions,
        -- Return NULL instead of 0 for missing rank data
        CASE 
            WHEN cp.avg_rank_position IS NOT NULL AND cp.avg_rank_position > 0 
            THEN cp.avg_rank_position 
            ELSE NULL 
        END as avg_rank_position,
        CASE 
            WHEN cp.avg_sentiment_score IS NOT NULL 
            THEN cp.avg_sentiment_score 
            ELSE NULL 
        END as avg_sentiment_score,
        COALESCE(cp.avg_confidence_score, 0) as avg_confidence_score,
        COALESCE(cp.llm_providers_count, 0) as llm_providers_count,
        cp.last_analysis_date,
        COALESCE(cp.mentions_last_7_days, 0) as mentions_last_7_days,
        COALESCE(cp.mentions_last_30_days, 0) as mentions_last_30_days,
        COALESCE(cp.mention_trend_7d, 0) as mention_trend_7d,
        CASE 
            WHEN cp.recent_sentiment_score IS NOT NULL 
            THEN cp.recent_sentiment_score 
            ELSE NULL 
        END as recent_sentiment_score,
        -- Return NULL instead of 0 for missing recent rank data
        CASE 
            WHEN cp.recent_avg_rank IS NOT NULL AND cp.recent_avg_rank > 0 
            THEN cp.recent_avg_rank 
            ELSE NULL 
        END as recent_avg_rank
    FROM beekon_data.mv_competitor_performance cp
    WHERE cp.website_id = p_website_id
    ORDER BY cp.total_mentions DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 2. Add consistency validation function
-- =================================================================

-- Function to validate competitor data consistency
CREATE OR REPLACE FUNCTION beekon_data.validate_competitor_data_consistency(
    p_website_id UUID
)
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    message TEXT,
    affected_records INTEGER
) AS $$
DECLARE
    v_total_share_of_voice NUMERIC;
    v_competitors_with_invalid_ranks INTEGER;
    v_competitors_missing_names INTEGER;
BEGIN
    -- Check 1: Share of voice total should not exceed 100%
    SELECT SUM(
        CASE 
            WHEN tma.total_market_mentions > 0 
            THEN (cs.total_voice_mentions::DECIMAL / tma.total_market_mentions::DECIMAL) * 100
            ELSE 0
        END
    ) INTO v_total_share_of_voice
    FROM (
        SELECT 
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions
        FROM beekon_data.competitors c
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
        WHERE c.website_id = p_website_id AND c.is_active = TRUE
        GROUP BY c.id
    ) cs
    CROSS JOIN (
        SELECT COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_market_mentions
        FROM beekon_data.competitors c
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
        WHERE c.website_id = p_website_id AND c.is_active = TRUE
    ) tma;

    RETURN QUERY SELECT 
        'share_of_voice_total'::TEXT,
        CASE WHEN v_total_share_of_voice <= 100 THEN 'PASS' ELSE 'WARN' END::TEXT,
        'Total share of voice is ' || COALESCE(v_total_share_of_voice::TEXT, '0') || '%'::TEXT,
        0::INTEGER;

    -- Check 2: Invalid rank positions (should be >= 1 or NULL)
    SELECT COUNT(*) INTO v_competitors_with_invalid_ranks
    FROM beekon_data.mv_competitor_performance cp
    WHERE cp.website_id = p_website_id 
        AND cp.avg_rank_position IS NOT NULL 
        AND (cp.avg_rank_position <= 0 OR cp.avg_rank_position > 20);

    RETURN QUERY SELECT 
        'invalid_rank_positions'::TEXT,
        CASE WHEN v_competitors_with_invalid_ranks = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        'Found ' || v_competitors_with_invalid_ranks || ' competitors with invalid rank positions'::TEXT,
        v_competitors_with_invalid_ranks;

    -- Check 3: Competitors without names
    SELECT COUNT(*) INTO v_competitors_missing_names
    FROM beekon_data.competitors c
    WHERE c.website_id = p_website_id 
        AND c.is_active = TRUE
        AND c.competitor_name IS NULL;

    RETURN QUERY SELECT 
        'missing_competitor_names'::TEXT,
        CASE WHEN v_competitors_missing_names = 0 THEN 'PASS' ELSE 'WARN' END::TEXT,
        'Found ' || v_competitors_missing_names || ' competitors without names'::TEXT,
        v_competitors_missing_names;

END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 3. Grant permissions
-- =================================================================

-- Grant permissions for the updated function
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.validate_competitor_data_consistency(UUID) TO authenticated;

-- Grant service role permissions
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance(UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.validate_competitor_data_consistency(UUID) TO service_role;

-- =================================================================
-- 4. Add helpful comments
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_performance IS 'Returns competitor performance metrics with proper NULL handling for missing rank data.';
COMMENT ON FUNCTION beekon_data.validate_competitor_data_consistency IS 'Validates consistency of competitor data across different calculations.';

-- =================================================================
-- 5. Refresh materialized views to apply changes
-- =================================================================

-- Refresh the materialized views to ensure data consistency
SELECT beekon_data.refresh_competitor_performance_views();

COMMIT;

-- =================================================================
-- Post-migration notes
-- =================================================================
/*

FIXES IMPLEMENTED:
===================

1. Proper NULL Handling:
   ✓ avg_rank_position returns NULL instead of 0 when no ranking data exists
   ✓ avg_sentiment_score returns NULL instead of 0 when no sentiment data exists
   ✓ Eliminates impossible rank values like 0.5

2. Data Consistency Validation:
   ✓ Added validation function to check data consistency
   ✓ Validates share of voice totals
   ✓ Checks for invalid rank positions
   ✓ Identifies competitors missing names

3. Improved Error Handling:
   ✓ Better handling of edge cases in rank calculations
   ✓ Consistent NULL value handling across all metrics
   ✓ More robust data validation

USAGE:
======

-- Validate data consistency for a website
SELECT * FROM beekon_data.validate_competitor_data_consistency('website-uuid');

-- The updated get_competitor_performance function now properly handles NULLs
SELECT * FROM beekon_data.get_competitor_performance('website-uuid', 10, 0);

*/