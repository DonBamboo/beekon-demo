-- FUNCTION 4: Get LLM Provider Performance
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

-- FUNCTION 5: Get Analysis Sessions
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
