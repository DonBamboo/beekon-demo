-- FUNCTION 2: Get Analysis Summary Stats
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
