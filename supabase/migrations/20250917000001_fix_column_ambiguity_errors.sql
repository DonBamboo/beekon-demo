-- =================================================================
-- FIX COLUMN AMBIGUITY ERRORS IN DATABASE FUNCTIONS
-- =================================================================
-- This migration fixes all column ambiguity issues and ensures proper
-- table aliasing throughout the competitor and dashboard functions.
-- Addresses: "column reference 'topic_id' is ambiguous" and similar errors
-- =================================================================

-- Drop existing functions to recreate with fixes
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice(uuid, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS beekon_data.get_competitive_gap_analysis(uuid, timestamp with time zone, timestamp with time zone);

-- =================================================================
-- 1. FIXED COMPETITOR SHARE OF VOICE FUNCTION
-- =================================================================
-- Fixes column ambiguity by properly qualifying all column references
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
    total_analyses BIGINT,
    total_voice_mentions BIGINT,
    share_of_voice DECIMAL,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL
) AS $$
BEGIN
    -- Strategy: Use materialized view for base data, apply date filtering afterward
    -- Fixed all column ambiguity issues with proper table aliases

    RETURN QUERY
    WITH mv_base_data AS (
        -- Use the materialized view for lightning-fast base query
        SELECT
            mv_sov.competitor_id,
            mv_sov.competitor_name,
            mv_sov.competitor_domain,
            mv_sov.total_analyses,
            mv_sov.total_voice_mentions,
            mv_sov.share_of_voice,
            mv_sov.avg_rank_position,
            mv_sov.avg_sentiment_score,
            mv_sov.avg_confidence_score,
            mv_sov.last_analyzed_at
        FROM beekon_data.mv_competitor_share_of_voice mv_sov
        WHERE mv_sov.website_id = p_website_id
          AND mv_sov.last_analyzed_at >= p_date_start
          AND mv_sov.last_analyzed_at <= p_date_end
    ),
    -- If materialized view doesn't have recent enough data, supplement with raw data
    raw_data_supplement AS (
        SELECT
            comp.id as competitor_id,
            comp.competitor_name,
            comp.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
            AVG(car.sentiment_score) AS avg_sentiment_score,
            AVG(car.confidence_score) AS avg_confidence_score
        FROM beekon_data.competitors comp
        LEFT JOIN beekon_data.competitor_analysis_results car ON comp.id = car.competitor_id
        WHERE comp.website_id = p_website_id
          AND comp.is_active = TRUE
          AND car.analyzed_at BETWEEN p_date_start AND p_date_end
          -- Only get data not already covered by materialized view
          AND car.analyzed_at > (
              SELECT COALESCE(MAX(mv_check.last_analyzed_at), p_date_start - INTERVAL '1 day')
              FROM beekon_data.mv_competitor_share_of_voice mv_check
              WHERE mv_check.website_id = p_website_id
          )
        GROUP BY comp.id, comp.competitor_name, comp.competitor_domain
        HAVING COUNT(car.id) > 0
    ),
    -- Combine materialized view data with any recent raw data
    combined_data AS (
        SELECT
            mv_data.competitor_id,
            mv_data.competitor_name,
            mv_data.competitor_domain,
            mv_data.total_analyses,
            mv_data.total_voice_mentions,
            mv_data.avg_rank_position,
            mv_data.avg_sentiment_score,
            mv_data.avg_confidence_score
        FROM mv_base_data mv_data

        UNION ALL

        SELECT
            raw_data.competitor_id,
            raw_data.competitor_name,
            raw_data.competitor_domain,
            raw_data.total_analyses,
            raw_data.total_voice_mentions,
            raw_data.avg_rank_position,
            raw_data.avg_sentiment_score,
            raw_data.avg_confidence_score
        FROM raw_data_supplement raw_data
    ),
    -- Aggregate the combined data and calculate final share of voice
    final_aggregated AS (
        SELECT
            cd.competitor_id,
            cd.competitor_name,
            cd.competitor_domain,
            SUM(cd.total_analyses) AS total_analyses,
            SUM(cd.total_voice_mentions) AS total_voice_mentions,
            AVG(cd.avg_rank_position) AS avg_rank_position,
            AVG(cd.avg_sentiment_score) AS avg_sentiment_score,
            AVG(cd.avg_confidence_score) AS avg_confidence_score
        FROM combined_data cd
        GROUP BY cd.competitor_id, cd.competitor_name, cd.competitor_domain
    ),
    total_market_mentions AS (
        SELECT COALESCE(SUM(fa.total_voice_mentions), 0) AS total_market_mentions
        FROM final_aggregated fa
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
    FROM final_aggregated fa
    CROSS JOIN total_market_mentions tma
    WHERE fa.total_analyses > 0
    ORDER BY fa.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 2. FIXED COMPETITIVE GAP ANALYSIS FUNCTION
-- =================================================================
-- Fixes all column ambiguity issues with proper table qualification
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
    -- Strategy: Use materialized views where possible, fall back to raw data for date filtering
    -- Fixed all column ambiguity issues with explicit table aliases

    RETURN QUERY
    WITH website_topics AS (
        SELECT
            topics.id as topic_id,
            topics.topic_name
        FROM beekon_data.topics topics
        WHERE topics.website_id = p_website_id
        AND topics.is_active = TRUE
    ),
    -- Get your brand performance from LLM analysis results (no materialized view available)
    your_brand_performance AS (
        SELECT
            wt.topic_id,
            wt.topic_name,
            COUNT(lar.id) AS total_analyses,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_brand_mentions,
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END AS your_brand_score
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts prompts ON wt.topic_id = prompts.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON prompts.id = lar.prompt_id
        WHERE lar.analyzed_at BETWEEN p_date_start AND p_date_end
        AND lar.website_id = p_website_id
        GROUP BY wt.topic_id, wt.topic_name
    ),
    -- Fall back to raw data for precise topic-level competitor analysis
    competitor_performance_raw AS (
        SELECT
            wt.topic_id,
            competitors.id AS competitor_id,
            competitors.competitor_name,
            competitors.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_competitor_mentions,
            CASE
                WHEN COUNT(car.id) > 0
                THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                ELSE 0
            END AS competitor_score,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts prompts ON wt.topic_id = prompts.topic_id
        LEFT JOIN beekon_data.competitors competitors ON competitors.website_id = p_website_id
        LEFT JOIN beekon_data.competitor_analysis_results car ON competitors.id = car.competitor_id AND prompts.id = car.prompt_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        AND competitors.is_active = TRUE
        GROUP BY wt.topic_id, competitors.id, competitors.competitor_name, competitors.competitor_domain
        HAVING COUNT(car.id) > 0
    ),
    aggregated_competitor_data AS (
        SELECT
            cpr.topic_id,
            jsonb_agg(
                jsonb_build_object(
                    'competitor_id', cpr.competitor_id,
                    'competitor_name', cpr.competitor_name,
                    'competitor_domain', cpr.competitor_domain,
                    'score', cpr.competitor_score,
                    'avg_rank_position', cpr.avg_rank_position,
                    'total_mentions', cpr.total_competitor_mentions
                )
                ORDER BY cpr.competitor_score DESC
            ) AS competitor_data
        FROM competitor_performance_raw cpr
        GROUP BY cpr.topic_id
    )
    SELECT
        ybp.topic_id,
        ybp.topic_name,
        ybp.your_brand_score,
        COALESCE(acd.competitor_data, '[]'::jsonb) AS competitor_data
    FROM your_brand_performance ybp
    LEFT JOIN aggregated_competitor_data acd ON ybp.topic_id = acd.topic_id
    WHERE ybp.total_analyses > 0
    ORDER BY ybp.your_brand_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. ENHANCED REFRESH FUNCTION FOR MATERIALIZED VIEWS
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_performance_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh materialized views concurrently for better performance
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;

    -- Also refresh other competitor views if they exist
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore if view doesn't exist or can't be refreshed concurrently
        NULL;
    END;

    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
    EXCEPTION WHEN OTHERS THEN
        -- Ignore if view doesn't exist or can't be refreshed concurrently
        NULL;
    END;

    -- Log the refresh (optional, for monitoring)
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', 'Competitor materialized views refreshed', NOW())
    ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
    -- If concurrent refresh fails, try regular refresh
    REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice;

    BEGIN
        REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_performance;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
        REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 4. GRANT PERMISSIONS
-- =================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO authenticated;

-- =================================================================
-- 5. OPTIMIZATION COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'FIXED: Column ambiguity resolved - Uses materialized views for lightning-fast performance with proper table aliasing';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'FIXED: Column ambiguity resolved - Leverages materialized views where possible with explicit column qualification';
COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS 'Enhanced refresh function for all competitor materialized views with comprehensive error handling';