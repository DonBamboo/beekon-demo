-- =========================================================================
-- OPTIMIZED RPC FUNCTIONS FOR mv_analysis_results MATERIALIZED VIEW (FIXED)
-- =========================================================================

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS beekon_data.get_analysis_results_optimized;
DROP FUNCTION IF EXISTS beekon_data.get_analysis_summary_optimized;
DROP FUNCTION IF EXISTS beekon_data.get_topic_performance_optimized;
DROP FUNCTION IF EXISTS beekon_data.get_llm_provider_performance_optimized;
DROP FUNCTION IF EXISTS beekon_data.get_analysis_sessions_optimized;

-- FUNCTION 1: Get Analysis Results (Paginated)
CREATE OR REPLACE FUNCTION beekon_data.get_analysis_results_optimized(
    p_website_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_topic_name TEXT DEFAULT NULL,
    p_llm_provider TEXT DEFAULT NULL,
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL,
    p_search_query TEXT DEFAULT NULL,
    p_analysis_session_id UUID DEFAULT NULL
) RETURNS TABLE(
    prompt_id UUID,
    website_id UUID,
    prompt_text TEXT,
    topic_name TEXT,
    llm_provider TEXT,
    is_mentioned BOOLEAN,
    rank_position INTEGER,
    sentiment_score NUMERIC,
    confidence_score NUMERIC,
    response_text TEXT,
    summary_text TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    session_id UUID,
    analysis_name TEXT,
    session_status TEXT,
    topic_total_analyses BIGINT,
    topic_mentions BIGINT,
    topic_avg_confidence NUMERIC,
    topic_avg_sentiment NUMERIC,
    topic_avg_rank NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv.prompt_id,
        mv.website_id,
        mv.prompt_text,
        mv.topic_name,
        mv.llm_provider,
        mv.is_mentioned,
        mv.rank_position,
        mv.sentiment_score,
        mv.confidence_score,
        mv.response_text,
        mv.summary_text,
        mv.analyzed_at,
        mv.created_at,
        mv.session_id,
        mv.analysis_name,
        mv.session_status,
        mv.topic_total_analyses,
        mv.topic_mentions,
        mv.topic_avg_confidence,
        mv.topic_avg_sentiment,
        mv.topic_avg_rank
    FROM beekon_data.mv_analysis_results mv
    WHERE mv.website_id = p_website_id
      AND (p_topic_name IS NULL OR mv.topic_name = p_topic_name)
      AND (p_llm_provider IS NULL OR mv.llm_provider = p_llm_provider)
      AND (p_date_start IS NULL OR mv.analyzed_at >= p_date_start)
      AND (p_date_end IS NULL OR mv.analyzed_at <= p_date_end)
      AND (p_analysis_session_id IS NULL OR mv.session_id = p_analysis_session_id)
      AND (
        p_search_query IS NULL OR
        mv.prompt_text ILIKE '%' || p_search_query || '%' OR
        mv.topic_name ILIKE '%' || p_search_query || '%' OR
        mv.response_text ILIKE '%' || p_search_query || '%' OR
        mv.analysis_name ILIKE '%' || p_search_query || '%'
      )
    ORDER BY mv.analyzed_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
