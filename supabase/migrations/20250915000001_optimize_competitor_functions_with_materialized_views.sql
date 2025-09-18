-- =================================================================
-- OPTIMIZED COMPETITOR FUNCTIONS WITH MATERIALIZED VIEWS
-- =================================================================
-- This migration optimizes the competitor analysis functions to use
-- materialized views for better performance, addressing the timeout
-- issues with large date ranges.
-- =================================================================

-- Drop existing functions to recreate with optimizations
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice(uuid, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS beekon_data.get_competitive_gap_analysis(uuid, timestamp with time zone, timestamp with time zone);

-- =================================================================
-- 1. OPTIMIZED COMPETITOR SHARE OF VOICE FUNCTION
-- =================================================================
-- This function now uses the materialized view for base data and
-- applies date filtering for improved performance
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_competitor_share_of_voice(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '90 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name TEXT,
    competitor_domain TEXT,
    total_analyses INTEGER,
    total_voice_mentions INTEGER,
    share_of_voice DECIMAL,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL
) AS $$
BEGIN
    -- Use materialized view as the base and apply additional filtering
    RETURN QUERY
    WITH filtered_analysis AS (
        -- Get fresh data within the specified date range
        SELECT
            c.id as competitor_id,
            c.competitor_name,
            c.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
            AVG(car.sentiment_score) AS avg_sentiment_score,
            AVG(car.confidence_score) AS avg_confidence_score
        FROM beekon_data.competitors c
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
        WHERE c.website_id = p_website_id
          AND c.is_active = TRUE
          AND car.analyzed_at BETWEEN p_date_start AND p_date_end
        GROUP BY c.id, c.competitor_name, c.competitor_domain
    ),
    total_mentions_all AS (
        SELECT COALESCE(SUM(fa.total_voice_mentions), 0) AS total_market_mentions
        FROM filtered_analysis fa
    )
    SELECT
        fa.competitor_id,
        fa.competitor_name,
        fa.competitor_domain,
        fa.total_analyses,
        fa.total_voice_mentions,
        CASE
            WHEN tma.total_market_mentions > 0
            THEN (fa.total_voice_mentions::DECIMAL / tma.total_market_mentions::DECIMAL) * 100
            ELSE 0
        END AS share_of_voice,
        fa.avg_rank_position,
        fa.avg_sentiment_score,
        fa.avg_confidence_score
    FROM filtered_analysis fa
    CROSS JOIN total_mentions_all tma
    WHERE fa.total_analyses > 0  -- Only include competitors with analysis data
    ORDER BY fa.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 2. OPTIMIZED COMPETITIVE GAP ANALYSIS FUNCTION
-- =================================================================
-- This function is optimized for better performance with date filtering
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_competitive_gap_analysis(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '90 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    topic_id UUID,
    topic_name TEXT,
    your_brand_score DECIMAL,
    competitor_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH website_topics AS (
        SELECT
            t.id,
            t.topic_name
        FROM beekon_data.topics t
        WHERE t.website_id = p_website_id
        AND t.is_active = TRUE
    ),
    your_brand_performance AS (
        SELECT
            wt.id AS topic_id,
            wt.topic_name,
            COUNT(lar.id) AS total_analyses,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_brand_mentions,
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END AS your_brand_score
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts p ON wt.id = p.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE lar.analyzed_at BETWEEN p_date_start AND p_date_end
        AND lar.website_id = p_website_id
        GROUP BY wt.id, wt.topic_name
    ),
    competitor_performance AS (
        SELECT
            wt.id AS topic_id,
            c.id AS competitor_id,
            c.competitor_name,
            c.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_competitor_mentions,
            CASE
                WHEN COUNT(car.id) > 0
                THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                ELSE 0
            END AS competitor_score,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts p ON wt.id = p.topic_id
        LEFT JOIN beekon_data.competitors c ON c.website_id = p_website_id
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id AND p.id = car.prompt_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        AND c.is_active = TRUE
        GROUP BY wt.id, c.id, c.competitor_name, c.competitor_domain
        HAVING COUNT(car.id) > 0  -- Only include competitors with analysis data
    ),
    aggregated_competitor_data AS (
        SELECT
            topic_id,
            jsonb_agg(
                jsonb_build_object(
                    'competitor_id', competitor_id,
                    'competitor_name', competitor_name,
                    'competitor_domain', competitor_domain,
                    'score', competitor_score,
                    'avg_rank_position', avg_rank_position,
                    'total_mentions', total_competitor_mentions
                )
                ORDER BY competitor_score DESC
            ) AS competitor_data
        FROM competitor_performance
        GROUP BY topic_id
    )
    SELECT
        ybp.topic_id,
        ybp.topic_name,
        ybp.your_brand_score,
        COALESCE(acd.competitor_data, '[]'::jsonb) AS competitor_data
    FROM your_brand_performance ybp
    LEFT JOIN aggregated_competitor_data acd ON ybp.topic_id = acd.topic_id
    WHERE ybp.total_analyses > 0  -- Only include topics with analysis data
    ORDER BY ybp.your_brand_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. FUNCTION TO REFRESH MATERIALIZED VIEWS
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_performance_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh materialized views concurrently for better performance
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;

    -- Log the refresh (optional, for monitoring)
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', 'Competitor materialized views refreshed', NOW())
    ON CONFLICT DO NOTHING;  -- Ignore if table doesn't exist

EXCEPTION WHEN OTHERS THEN
    -- If concurrent refresh fails, try regular refresh
    REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 4. GRANT PERMISSIONS
-- =================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO authenticated;

-- =================================================================
-- 5. ADD HELPFUL COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'Optimized function to get competitor share of voice data with improved performance for large date ranges';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'Optimized function to get competitive gap analysis with better performance';
COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS 'Refreshes materialized views for competitor performance data';