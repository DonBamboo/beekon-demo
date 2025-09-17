-- =================================================================
-- UPDATE COMPETITOR FUNCTIONS TO USE V2 MATERIALIZED VIEWS
-- =================================================================
-- This migration updates database functions to use the new v2 materialized views
-- that include analysis_status without breaking existing dependencies
-- =================================================================

-- =================================================================
-- 1. UPDATE get_competitor_share_of_voice TO USE V2 VIEW
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
    -- Use NEW v2 materialized view that includes analysis_status
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
        mv.analysis_status, -- NOW AVAILABLE: analysis_status from v2 view
        mv.last_analyzed_at
    FROM beekon_data.mv_competitor_share_of_voice_v2 mv
    WHERE mv.website_id = p_website_id
    -- Apply date filtering on the materialized view results
    AND (mv.last_analyzed_at IS NULL OR mv.last_analyzed_at BETWEEN p_date_start AND p_date_end)
    ORDER BY mv.share_of_voice DESC, mv.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 2. UPDATE get_competitor_performance TO USE V2 VIEW
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
    -- Use NEW v2 materialized view that includes analysis_status
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
        mv.analysis_status, -- NOW AVAILABLE: analysis_status from v2 view
        mv.mention_trend_7d,
        mv.mentions_last_7_days,
        mv.mentions_last_30_days,
        mv.recent_sentiment_score,
        mv.recent_avg_rank
    FROM beekon_data.mv_competitor_performance_v2 mv
    WHERE mv.website_id = p_website_id
    ORDER BY mv.positive_mentions DESC, mv.total_mentions DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. CREATE FALLBACK FUNCTION FOR TESTING
-- =================================================================

-- Create a test function to compare old vs new results
CREATE OR REPLACE FUNCTION beekon_data.test_competitor_status_comparison(
    p_website_id UUID
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name TEXT,
    old_data_exists BOOLEAN,
    new_status TEXT,
    total_mentions BIGINT,
    positive_mentions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv2.competitor_id,
        mv2.competitor_name,
        (mv1.competitor_id IS NOT NULL) AS old_data_exists,
        mv2.analysis_status AS new_status,
        mv2.total_voice_mentions AS total_mentions,
        mv2.total_voice_mentions AS positive_mentions
    FROM beekon_data.mv_competitor_share_of_voice_v2 mv2
    LEFT JOIN beekon_data.mv_competitor_share_of_voice mv1 ON mv2.competitor_id = mv1.competitor_id
    WHERE mv2.website_id = p_website_id
    ORDER BY mv2.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 4. GRANT PERMISSIONS
-- =================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.test_competitor_status_comparison TO authenticated;

-- =================================================================
-- 5. FUNCTION COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'UPDATED: Now uses v2 materialized view with analysis_status - safe approach without dependency conflicts';
COMMENT ON FUNCTION beekon_data.get_competitor_performance IS 'UPDATED: Now uses v2 materialized view with analysis_status for proper status display';
COMMENT ON FUNCTION beekon_data.test_competitor_status_comparison IS 'TEST: Compare old vs new competitor status calculation for verification';