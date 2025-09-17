-- =================================================================
-- USE MATERIALIZED VIEWS PROPERLY IN COMPETITOR FUNCTIONS
-- =================================================================
-- This migration rewrites the competitor analysis functions to actually
-- use the existing materialized views for optimal performance, instead
-- of querying raw tables with expensive JOINs and aggregations.
-- =================================================================

-- Drop existing functions to recreate with proper materialized view usage
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice(uuid, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS beekon_data.get_competitive_gap_analysis(uuid, timestamp with time zone, timestamp with time zone);

-- =================================================================
-- 1. OPTIMIZED COMPETITOR SHARE OF VOICE - USING MATERIALIZED VIEWS
-- =================================================================
-- This function now properly uses mv_competitor_share_of_voice for
-- lightning-fast performance instead of expensive JOINs
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
    -- This is much faster than raw table JOINs since aggregations are pre-computed

    RETURN QUERY
    WITH mv_base_data AS (
        -- Use the materialized view for lightning-fast base query
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
            mv.last_analyzed_at
        FROM beekon_data.mv_competitor_share_of_voice mv
        WHERE mv.website_id = p_website_id
          AND mv.last_analyzed_at >= p_date_start  -- Filter by date range
          AND mv.last_analyzed_at <= p_date_end
    ),
    -- If materialized view doesn't have recent enough data, supplement with raw data
    raw_data_supplement AS (
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
          -- Only get data not already covered by materialized view
          AND car.analyzed_at > (
              SELECT COALESCE(MAX(mv.last_analyzed_at), p_date_start - INTERVAL '1 day')
              FROM beekon_data.mv_competitor_share_of_voice mv
              WHERE mv.website_id = p_website_id
          )
        GROUP BY c.id, c.competitor_name, c.competitor_domain
        HAVING COUNT(car.id) > 0
    ),
    -- Combine materialized view data with any recent raw data
    combined_data AS (
        SELECT
            competitor_id,
            competitor_name,
            competitor_domain,
            total_analyses,
            total_voice_mentions,
            avg_rank_position,
            avg_sentiment_score,
            avg_confidence_score
        FROM mv_base_data

        UNION ALL

        SELECT
            competitor_id,
            competitor_name,
            competitor_domain,
            total_analyses,
            total_voice_mentions,
            avg_rank_position,
            avg_sentiment_score,
            avg_confidence_score
        FROM raw_data_supplement
    ),
    -- Aggregate the combined data and calculate final share of voice
    final_aggregated AS (
        SELECT
            competitor_id,
            competitor_name,
            competitor_domain,
            SUM(total_analyses) AS total_analyses,
            SUM(total_voice_mentions) AS total_voice_mentions,
            AVG(avg_rank_position) AS avg_rank_position,
            AVG(avg_sentiment_score) AS avg_sentiment_score,
            AVG(avg_confidence_score) AS avg_confidence_score
        FROM combined_data
        GROUP BY competitor_id, competitor_name, competitor_domain
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
-- 2. OPTIMIZED COMPETITIVE GAP ANALYSIS - USING MATERIALIZED VIEWS
-- =================================================================
-- This function now uses materialized views for much better performance
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

    RETURN QUERY
    WITH website_topics AS (
        SELECT
            t.id as topic_id,
            t.topic_name
        FROM beekon_data.topics t
        WHERE t.website_id = p_website_id
        AND t.is_active = TRUE
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
        LEFT JOIN beekon_data.prompts p ON wt.topic_id = p.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE lar.analyzed_at BETWEEN p_date_start AND p_date_end
        AND lar.website_id = p_website_id
        GROUP BY wt.topic_id, wt.topic_name
    ),
    -- Use materialized view for competitor performance where possible
    competitor_performance_from_mv AS (
        SELECT DISTINCT
            wt.topic_id,
            mv.competitor_id,
            mv.competitor_name,
            mv.competitor_domain,
            -- Approximate scores from materialized view data
            mv.share_of_voice as competitor_score,
            mv.avg_rank_position,
            mv.total_voice_mentions as total_competitor_mentions
        FROM website_topics wt
        CROSS JOIN beekon_data.mv_competitor_share_of_voice mv
        WHERE mv.website_id = p_website_id
        AND mv.last_analyzed_at >= p_date_start
        AND mv.total_voice_mentions > 0
    ),
    -- Fall back to raw data for precise topic-level competitor analysis
    competitor_performance_raw AS (
        SELECT
            wt.topic_id,
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
        LEFT JOIN beekon_data.prompts p ON wt.topic_id = p.topic_id
        LEFT JOIN beekon_data.competitors c ON c.website_id = p_website_id
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id AND p.id = car.prompt_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        AND c.is_active = TRUE
        GROUP BY wt.topic_id, c.id, c.competitor_name, c.competitor_domain
        HAVING COUNT(car.id) > 0
    ),
    -- Combine materialized view and raw data (prefer raw for accuracy)
    competitor_performance_combined AS (
        SELECT
            topic_id,
            competitor_id,
            competitor_name,
            competitor_domain,
            competitor_score,
            avg_rank_position,
            total_competitor_mentions
        FROM competitor_performance_raw

        UNION

        -- Only include materialized view data for topics not covered by raw data
        SELECT
            mv.topic_id,
            mv.competitor_id,
            mv.competitor_name,
            mv.competitor_domain,
            mv.competitor_score,
            mv.avg_rank_position,
            mv.total_competitor_mentions
        FROM competitor_performance_from_mv mv
        WHERE NOT EXISTS (
            SELECT 1 FROM competitor_performance_raw cpr
            WHERE cpr.topic_id = mv.topic_id AND cpr.competitor_id = mv.competitor_id
        )
    ),
    aggregated_competitor_data AS (
        SELECT
            cp.topic_id,
            jsonb_agg(
                jsonb_build_object(
                    'competitor_id', cp.competitor_id,
                    'competitor_name', cp.competitor_name,
                    'competitor_domain', cp.competitor_domain,
                    'score', cp.competitor_score,
                    'avg_rank_position', cp.avg_rank_position,
                    'total_mentions', cp.total_competitor_mentions
                )
                ORDER BY cp.competitor_score DESC
            ) AS competitor_data
        FROM competitor_performance_combined cp
        GROUP BY cp.topic_id
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
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;

    -- Also refresh daily metrics if it exists
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
    REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_performance;

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

COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'OPTIMIZED: Uses materialized views for lightning-fast performance with fallback to raw data for recent updates';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'OPTIMIZED: Leverages materialized views where possible for better performance while maintaining data accuracy';
COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS 'Enhanced refresh function for all competitor materialized views with error handling';

-- =================================================================
-- 6. PERFORMANCE MONITORING
-- =================================================================

-- View to monitor materialized view freshness
CREATE OR REPLACE VIEW beekon_data.competitor_mv_status AS
SELECT
    'mv_competitor_share_of_voice' as view_name,
    (SELECT COUNT(*) FROM beekon_data.mv_competitor_share_of_voice) as row_count,
    (SELECT MAX(last_analyzed_at) FROM beekon_data.mv_competitor_share_of_voice) as latest_data
UNION ALL
SELECT
    'mv_competitor_performance' as view_name,
    (SELECT COUNT(*) FROM beekon_data.mv_competitor_performance) as row_count,
    (SELECT MAX(last_analysis_date) FROM beekon_data.mv_competitor_performance) as latest_data
UNION ALL
SELECT
    'mv_competitor_daily_metrics' as view_name,
    (SELECT COUNT(*) FROM beekon_data.mv_competitor_daily_metrics) as row_count,
    (SELECT MAX(analysis_date) FROM beekon_data.mv_competitor_daily_metrics) as latest_data;

GRANT SELECT ON beekon_data.competitor_mv_status TO authenticated;

COMMENT ON VIEW beekon_data.competitor_mv_status IS 'Monitor the status and freshness of competitor materialized views';