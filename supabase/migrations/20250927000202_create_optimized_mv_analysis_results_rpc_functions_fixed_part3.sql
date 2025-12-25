-- FUNCTION 3: Get Topic Performance
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
