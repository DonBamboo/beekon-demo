-- =================================================================
-- UPDATE COMPETITOR FUNCTIONS TO RETURN ANALYSIS_STATUS
-- =================================================================
-- This migration updates database functions to return the analysis_status
-- from materialized views to fix competitor status display
-- =================================================================

-- =================================================================
-- 1. UPDATE get_competitor_share_of_voice TO INCLUDE ANALYSIS_STATUS
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_competitor_share_of_voice(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE,
    p_date_end TIMESTAMP WITH TIME ZONE
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
    -- Use materialized view for base data with date filtering
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
        mv.analysis_status, -- NEW: Include analysis_status from materialized view
        mv.last_analyzed_at
    FROM beekon_data.mv_competitor_share_of_voice mv
    WHERE mv.website_id = p_website_id
    -- Apply date filtering on the materialized view results
    AND (mv.last_analyzed_at IS NULL OR mv.last_analyzed_at BETWEEN p_date_start AND p_date_end)
    ORDER BY mv.share_of_voice DESC, mv.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 2. UPDATE get_competitor_performance TO INCLUDE ANALYSIS_STATUS
-- =================================================================

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
    -- Use the updated materialized view with analysis_status
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
        mv.analysis_status, -- NEW: Include analysis_status from materialized view
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
-- 3. GRANT PERMISSIONS
-- =================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance TO authenticated;

-- =================================================================
-- 4. FUNCTION COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'UPDATED: Now returns analysis_status from materialized view to fix competitor status display';
COMMENT ON FUNCTION beekon_data.get_competitor_performance IS 'UPDATED: Now returns analysis_status from materialized view for proper status tracking';