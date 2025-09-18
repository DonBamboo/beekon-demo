-- =================================================================
-- FIX DASHBOARD FUNCTION TYPE MISMATCH
-- =================================================================
-- Fixes the type mismatch error in get_dashboard_metrics function
-- Error: "Returned type bigint does not match expected type integer in column 6"
-- =================================================================

-- Drop and recreate get_dashboard_metrics with correct return types
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics;

CREATE OR REPLACE FUNCTION beekon_data.get_dashboard_metrics(
    p_website_ids UUID[],
    p_date_start TIMESTAMP WITH TIME ZONE,
    p_date_end TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    overall_visibility_score DECIMAL,
    average_ranking DECIMAL,
    total_mentions BIGINT,        -- Changed from INTEGER to BIGINT
    sentiment_score DECIMAL,
    total_analyses BIGINT,        -- Changed from INTEGER to BIGINT
    active_websites BIGINT,       -- Changed from INTEGER to BIGINT
    top_performing_topic TEXT,
    improvement_trend DECIMAL
) AS $$
BEGIN
    -- Handle empty or null website IDs
    IF p_website_ids IS NULL OR array_length(p_website_ids, 1) = 0 THEN
        RETURN QUERY
        SELECT
            50::DECIMAL as overall_visibility_score,
            4.0::DECIMAL as average_ranking,
            0::BIGINT as total_mentions,
            2.5::DECIMAL as sentiment_score,
            0::BIGINT as total_analyses,
            0::BIGINT as active_websites,
            'No Data Available'::TEXT as top_performing_topic,
            0::DECIMAL as improvement_trend;
        RETURN;
    END IF;

    RETURN QUERY
    WITH raw_dashboard_data AS (
        SELECT
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 50
            END AS visibility_score,
            AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
                THEN lar.rank_position ELSE 4 END) AS avg_ranking,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_mentions,
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 2.5
                ELSE 2.5
            END AS sentiment_score,
            COUNT(lar.id) AS total_analyses,
            COUNT(DISTINCT lar.website_id) AS active_websites
        FROM beekon_data.llm_analysis_results lar
        WHERE lar.website_id = ANY(p_website_ids)
        AND lar.analyzed_at BETWEEN p_date_start AND p_date_end
    ),
    top_topic AS (
        SELECT
            COALESCE(t.topic_name, 'General Topics') as topic_name
        FROM beekon_data.topics t
        LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE t.website_id = ANY(p_website_ids)
        AND t.is_active = TRUE
        AND lar.analyzed_at BETWEEN p_date_start AND p_date_end
        AND lar.is_mentioned = TRUE
        GROUP BY t.topic_name
        ORDER BY COUNT(lar.id) DESC
        LIMIT 1
    )
    SELECT
        COALESCE(rdd.visibility_score, 50) as overall_visibility_score,
        COALESCE(rdd.avg_ranking, 4.0) as average_ranking,
        COALESCE(rdd.total_mentions, 0)::BIGINT as total_mentions,
        COALESCE(rdd.sentiment_score, 2.5) as sentiment_score,
        COALESCE(rdd.total_analyses, 0)::BIGINT as total_analyses,
        COALESCE(rdd.active_websites, 0)::BIGINT as active_websites,
        COALESCE(tt.topic_name, 'General Topics')::TEXT as top_performing_topic,
        0::DECIMAL as improvement_trend
    FROM raw_dashboard_data rdd
    CROSS JOIN (SELECT COALESCE((SELECT topic_name FROM top_topic), 'General Topics') as topic_name) tt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_metrics TO authenticated;

-- Add function comment
COMMENT ON FUNCTION beekon_data.get_dashboard_metrics IS 'FIXED: Dashboard metrics with corrected return types - resolves bigint/integer type mismatch causing 400 errors';