-- =================================================================
-- CREATE MISSING DATABASE FUNCTIONS
-- =================================================================
-- This migration creates database functions that services are calling
-- but don't exist yet, causing 400 Bad Request errors
-- =================================================================

-- =================================================================
-- 1. CREATE GET_COMPETITOR_PERFORMANCE FUNCTION
-- =================================================================
-- This function is called by competitorService.ts but doesn't exist

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
    mention_trend_7d DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH competitor_metrics AS (
        SELECT
            c.id as competitor_id,
            c.competitor_name,
            c.competitor_domain,
            COUNT(car.id) AS total_mentions,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS positive_mentions,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
            AVG(car.sentiment_score) AS avg_sentiment_score,
            AVG(car.confidence_score) AS avg_confidence_score,
            COUNT(DISTINCT car.llm_provider) AS llm_providers_count,
            MAX(car.analyzed_at) AS last_analysis_date,
            CASE
                WHEN MAX(car.analyzed_at) > NOW() - INTERVAL '7 days' THEN 'active'
                WHEN MAX(car.analyzed_at) > NOW() - INTERVAL '30 days' THEN 'recent'
                ELSE 'completed'
            END AS analysis_status
        FROM beekon_data.competitors c
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
        WHERE c.website_id = p_website_id
        AND c.is_active = TRUE
        AND (car.id IS NULL OR car.analyzed_at >= NOW() - INTERVAL '90 days')
        GROUP BY c.id, c.competitor_name, c.competitor_domain
    ),
    trend_metrics AS (
        SELECT
            cm.competitor_id,
            -- Calculate 7-day trend (simplified)
            CASE
                WHEN cm.last_analysis_date > NOW() - INTERVAL '7 days'
                THEN COALESCE(
                    (cm.positive_mentions::DECIMAL -
                     COALESCE(
                        (SELECT COUNT(CASE WHEN car_old.is_mentioned THEN 1 END)
                         FROM beekon_data.competitor_analysis_results car_old
                         WHERE car_old.competitor_id = cm.competitor_id
                         AND car_old.analyzed_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
                        ), 0
                     )
                    ) / NULLIF(cm.positive_mentions, 0) * 100, 0
                )
                ELSE 0
            END AS mention_trend_7d
        FROM competitor_metrics cm
    )
    SELECT
        cm.competitor_id,
        cm.competitor_name,
        cm.competitor_domain,
        cm.total_mentions,
        cm.positive_mentions,
        cm.avg_rank_position,
        cm.avg_sentiment_score,
        cm.avg_confidence_score,
        cm.llm_providers_count,
        cm.last_analysis_date,
        cm.analysis_status,
        COALESCE(tm.mention_trend_7d, 0) as mention_trend_7d
    FROM competitor_metrics cm
    LEFT JOIN trend_metrics tm ON cm.competitor_id = tm.competitor_id
    WHERE cm.total_mentions > 0 OR cm.competitor_id IS NOT NULL
    ORDER BY cm.positive_mentions DESC, cm.total_mentions DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 2. CREATE ADDITIONAL MISSING FUNCTIONS
-- =================================================================

-- Create get_topic_performance_dashboard if it's missing (called by dashboard service)
CREATE OR REPLACE FUNCTION beekon_data.get_topic_performance_dashboard(
    p_website_ids UUID[],
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    topic TEXT,
    visibility DECIMAL,
    mentions BIGINT,
    average_rank DECIMAL,
    sentiment DECIMAL,
    trend DECIMAL
) AS $$
BEGIN
    IF p_website_ids IS NULL OR array_length(p_website_ids, 1) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH topic_metrics AS (
        SELECT
            t.topic_name,
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END as visibility_score,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) as brand_mentions,
            AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
                THEN lar.rank_position ELSE 4 END) as avg_rank,
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 2.5
                ELSE 2.5
            END as sentiment_score
        FROM beekon_data.topics t
        LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE t.website_id = ANY(p_website_ids)
        AND t.is_active = TRUE
        AND (lar.id IS NULL OR lar.analyzed_at >= NOW() - INTERVAL '30 days')
        GROUP BY t.id, t.topic_name
        ORDER BY visibility_score DESC
        LIMIT p_limit
    )
    SELECT
        tm.topic_name::TEXT as topic,
        tm.visibility_score as visibility,
        tm.brand_mentions::BIGINT as mentions,
        tm.avg_rank as average_rank,
        tm.sentiment_score as sentiment,
        0::DECIMAL as trend
    FROM topic_metrics tm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create get_website_performance_dashboard if it's missing
CREATE OR REPLACE FUNCTION beekon_data.get_website_performance_dashboard(
    p_website_ids UUID[]
)
RETURNS TABLE (
    website_id UUID,
    domain TEXT,
    display_name TEXT,
    visibility DECIMAL,
    mentions BIGINT,
    sentiment DECIMAL,
    last_analyzed TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    IF p_website_ids IS NULL OR array_length(p_website_ids, 1) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        w.id as website_id,
        w.domain as domain,
        COALESCE(w.display_name, w.domain) as display_name,
        CASE
            WHEN COUNT(lar.id) > 0
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END as visibility,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 END) as mentions,
        CASE
            WHEN AVG(lar.sentiment_score) IS NOT NULL
            THEN (AVG(lar.sentiment_score) + 1) * 2.5
            ELSE 2.5
        END as sentiment,
        MAX(lar.analyzed_at) as last_analyzed
    FROM beekon_data.websites w
    LEFT JOIN beekon_data.llm_analysis_results lar ON w.id = lar.website_id
        AND lar.analyzed_at >= NOW() - INTERVAL '30 days'
    WHERE w.id = ANY(p_website_ids)
    AND w.is_active = TRUE
    GROUP BY w.id, w.domain, w.display_name
    ORDER BY visibility DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create get_llm_performance_dashboard if it's missing
CREATE OR REPLACE FUNCTION beekon_data.get_llm_performance_dashboard(
    p_website_ids UUID[]
)
RETURNS TABLE (
    provider TEXT,
    mention_rate DECIMAL,
    average_rank DECIMAL,
    sentiment DECIMAL,
    total_analyses BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH llm_stats AS (
        SELECT
            COALESCE(lar.llm_provider, 'Unknown') as provider_name,
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END as mention_rate,
            AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
                THEN lar.rank_position ELSE 4 END) as avg_rank,
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 2.5
                ELSE 2.5
            END as avg_sentiment,
            COUNT(lar.id) as total_count
        FROM beekon_data.llm_analysis_results lar
        WHERE (p_website_ids IS NULL OR lar.website_id = ANY(p_website_ids))
        AND lar.analyzed_at >= NOW() - INTERVAL '30 days'
        GROUP BY lar.llm_provider
        HAVING COUNT(lar.id) > 0
    )
    SELECT
        ls.provider_name::TEXT as provider,
        ls.mention_rate as mention_rate,
        ls.avg_rank as average_rank,
        ls.avg_sentiment as sentiment,
        ls.total_count::BIGINT as total_analyses
    FROM llm_stats ls
    ORDER BY ls.mention_rate DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. GRANT PERMISSIONS
-- =================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_website_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_performance_dashboard TO authenticated;

-- =================================================================
-- 4. FUNCTION COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_performance IS 'NEW: Competitor performance metrics called by competitorService - resolves missing function errors';
COMMENT ON FUNCTION beekon_data.get_topic_performance_dashboard IS 'FIXED: Topic performance with proper error handling and fallback data';
COMMENT ON FUNCTION beekon_data.get_website_performance_dashboard IS 'FIXED: Website performance comparison with comprehensive data aggregation';
COMMENT ON FUNCTION beekon_data.get_llm_performance_dashboard IS 'FIXED: LLM provider performance analysis with robust data handling';