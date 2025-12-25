-- =========================================================================
-- OPTIMIZED RPC FUNCTIONS FOR mv_analysis_results MATERIALIZED VIEW
-- =========================================================================

-- This migration creates RPC functions that directly query the mv_analysis_results
-- materialized view for maximum performance and direct cURL access.

-- =========================================================================
-- FUNCTION 1: Get Analysis Results (Paginated)
-- =========================================================================

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

-- =========================================================================
-- FUNCTION 2: Get Analysis Summary Stats
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_analysis_summary_optimized(
    p_website_id UUID,
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL
) RETURNS TABLE(
    total_analyses BIGINT,
    total_mentions BIGINT,
    mention_rate NUMERIC,
    avg_confidence NUMERIC,
    avg_sentiment NUMERIC,
    avg_rank NUMERIC,
    total_topics BIGINT,
    total_llm_providers BIGINT,
    top_performing_topic TEXT,
    lowest_performing_topic TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            COUNT(*) as total_count,
            COUNT(*) FILTER (WHERE mv.is_mentioned = true) as mention_count,
            AVG(mv.confidence_score) as avg_conf,
            AVG(mv.sentiment_score) as avg_sent,
            AVG(mv.rank_position) FILTER (WHERE mv.rank_position IS NOT NULL) as avg_rnk,
            COUNT(DISTINCT mv.topic_name) as topic_count,
            COUNT(DISTINCT mv.llm_provider) as provider_count
        FROM beekon_data.mv_analysis_results mv
        WHERE mv.website_id = p_website_id
          AND (p_date_start IS NULL OR mv.analyzed_at >= p_date_start)
          AND (p_date_end IS NULL OR mv.analyzed_at <= p_date_end)
    ),
    topic_performance AS (
        SELECT
            mv.topic_name,
            AVG(mv.confidence_score) as topic_avg_confidence,
            ROW_NUMBER() OVER (ORDER BY AVG(mv.confidence_score) DESC) as rank_desc,
            ROW_NUMBER() OVER (ORDER BY AVG(mv.confidence_score) ASC) as rank_asc
        FROM beekon_data.mv_analysis_results mv
        WHERE mv.website_id = p_website_id
          AND (p_date_start IS NULL OR mv.analyzed_at >= p_date_start)
          AND (p_date_end IS NULL OR mv.analyzed_at <= p_date_end)
        GROUP BY mv.topic_name
    )
    SELECT
        s.total_count,
        s.mention_count,
        CASE WHEN s.total_count > 0 THEN ROUND((s.mention_count::NUMERIC / s.total_count::NUMERIC) * 100, 2) ELSE 0 END,
        ROUND(s.avg_conf * 100, 2),
        ROUND(s.avg_sent * 100, 2),
        ROUND(s.avg_rnk, 2),
        s.topic_count,
        s.provider_count,
        (SELECT topic_name FROM topic_performance WHERE rank_desc = 1 LIMIT 1),
        (SELECT topic_name FROM topic_performance WHERE rank_asc = 1 LIMIT 1)
    FROM stats s;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- FUNCTION 3: Get Topic Performance (Leverages pre-computed aggregations)
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_topic_performance_optimized(
    p_website_id UUID,
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL
) RETURNS TABLE(
    topic_name TEXT,
    total_analyses BIGINT,
    mentions BIGINT,
    mention_rate NUMERIC,
    avg_confidence NUMERIC,
    avg_sentiment NUMERIC,
    avg_rank NUMERIC,
    latest_analysis TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv.topic_name,
        mv.topic_total_analyses,
        mv.topic_mentions,
        CASE
            WHEN mv.topic_total_analyses > 0
            THEN ROUND((mv.topic_mentions::NUMERIC / mv.topic_total_analyses::NUMERIC) * 100, 2)
            ELSE 0
        END as mention_rate_calc,
        ROUND(mv.topic_avg_confidence * 100, 2),
        ROUND(mv.topic_avg_sentiment * 100, 2),
        ROUND(mv.topic_avg_rank, 2),
        MAX(mv.analyzed_at) as latest_analysis_date
    FROM beekon_data.mv_analysis_results mv
    WHERE mv.website_id = p_website_id
      AND (p_date_start IS NULL OR mv.analyzed_at >= p_date_start)
      AND (p_date_end IS NULL OR mv.analyzed_at <= p_date_end)
    GROUP BY
        mv.topic_name,
        mv.topic_total_analyses,
        mv.topic_mentions,
        mv.topic_avg_confidence,
        mv.topic_avg_sentiment,
        mv.topic_avg_rank
    ORDER BY mv.topic_avg_confidence DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- FUNCTION 4: Get LLM Provider Performance
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_llm_provider_performance_optimized(
    p_website_id UUID,
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL
) RETURNS TABLE(
    llm_provider TEXT,
    total_analyses BIGINT,
    mentions BIGINT,
    mention_rate NUMERIC,
    avg_confidence NUMERIC,
    avg_sentiment NUMERIC,
    avg_rank NUMERIC,
    latest_analysis TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv.llm_provider,
        COUNT(*) as provider_total_analyses,
        COUNT(*) FILTER (WHERE mv.is_mentioned = true) as provider_mentions,
        CASE
            WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE mv.is_mentioned = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
            ELSE 0
        END as provider_mention_rate,
        ROUND(AVG(mv.confidence_score) * 100, 2),
        ROUND(AVG(mv.sentiment_score) * 100, 2),
        ROUND(AVG(mv.rank_position) FILTER (WHERE mv.rank_position IS NOT NULL), 2),
        MAX(mv.analyzed_at) as provider_latest_analysis
    FROM beekon_data.mv_analysis_results mv
    WHERE mv.website_id = p_website_id
      AND (p_date_start IS NULL OR mv.analyzed_at >= p_date_start)
      AND (p_date_end IS NULL OR mv.analyzed_at <= p_date_end)
    GROUP BY mv.llm_provider
    ORDER BY AVG(mv.confidence_score) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- FUNCTION 5: Get Analysis Sessions with Results Count
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_analysis_sessions_optimized(
    p_website_id UUID,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    session_id UUID,
    analysis_name TEXT,
    session_status TEXT,
    results_count BIGINT,
    avg_confidence NUMERIC,
    mention_rate NUMERIC,
    latest_analysis TIMESTAMP WITH TIME ZONE,
    topics_covered TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mv.session_id,
        mv.analysis_name,
        mv.session_status,
        COUNT(*) as session_results_count,
        ROUND(AVG(mv.confidence_score) * 100, 2) as session_avg_confidence,
        CASE
            WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE mv.is_mentioned = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
            ELSE 0
        END as session_mention_rate,
        MAX(mv.analyzed_at) as session_latest_analysis,
        ARRAY_AGG(DISTINCT mv.topic_name) as session_topics_covered
    FROM beekon_data.mv_analysis_results mv
    WHERE mv.website_id = p_website_id
      AND mv.session_id IS NOT NULL
    GROUP BY mv.session_id, mv.analysis_name, mv.session_status
    ORDER BY MAX(mv.analyzed_at) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- GRANT PERMISSIONS
-- =========================================================================

-- Grant execute permissions to authenticated users and service role
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_results_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_results_optimized TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_summary_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_summary_optimized TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_optimized TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_llm_provider_performance_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_provider_performance_optimized TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_sessions_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_sessions_optimized TO service_role;

-- =========================================================================
-- ADD HELPFUL COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.get_analysis_results_optimized IS
'Lightning-fast analysis results query using mv_analysis_results materialized view. Supports pagination, filtering by topic, LLM provider, date range, and search queries.';

COMMENT ON FUNCTION beekon_data.get_analysis_summary_optimized IS
'Get comprehensive analysis summary statistics using pre-computed materialized view data. Returns overall performance metrics and top/bottom performing topics.';

COMMENT ON FUNCTION beekon_data.get_topic_performance_optimized IS
'Get topic-level performance metrics leveraging pre-computed aggregations from mv_analysis_results. Extremely fast as it uses window function results.';

COMMENT ON FUNCTION beekon_data.get_llm_provider_performance_optimized IS
'Get LLM provider performance comparison using materialized view data. Shows performance across different AI providers.';

COMMENT ON FUNCTION beekon_data.get_analysis_sessions_optimized IS
'Get analysis session summaries with result counts and performance metrics. Perfect for session management and overview dashboards.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, created_at)
VALUES ('INFO', 'Optimized mv_analysis_results RPC functions created - direct cURL access available', NOW())
ON CONFLICT DO NOTHING;