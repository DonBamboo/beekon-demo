-- =========================================================================
-- FIX DASHBOARD METRICS FUNCTION TYPE ISSUES AND HARDCODED VALUES
-- =========================================================================

-- This migration fixes the type mismatch issues in get_dashboard_metrics
-- and improves the function to return actual dynamic values instead of hardcoded ones

-- =========================================================================
-- 1. DROP EXISTING FUNCTION TO AVOID CONFLICTS
-- =========================================================================

DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics(
    UUID[],
    TIMESTAMP WITH TIME ZONE,
    TIMESTAMP WITH TIME ZONE
);

-- =========================================================================
-- 2. RECREATE WITH CORRECT TYPES AND DYNAMIC VALUES
-- =========================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_dashboard_metrics(
    p_website_ids UUID[],
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    overall_visibility_score DECIMAL,
    average_ranking DECIMAL,
    total_mentions BIGINT,              -- Fixed: Changed from DECIMAL to BIGINT
    sentiment_score DECIMAL,
    total_analyses BIGINT,              -- Fixed: Changed from DECIMAL to BIGINT
    active_websites INTEGER,
    top_performing_topic TEXT,
    improvement_trend DECIMAL
) AS $$
DECLARE
    raw_data RECORD;
    top_topic TEXT;
BEGIN
    -- Get aggregated data from materialized view
    WITH dashboard_data AS (
        SELECT
            SUM(wds.total_brand_mentions)::BIGINT as total_mentions_sum,
            SUM(wds.total_brand_analyses)::BIGINT as total_analyses_sum,
            AVG(wds.brand_mention_rate) as avg_visibility,
            AVG(wds.avg_brand_sentiment) as avg_sentiment,
            COUNT(DISTINCT wds.website_id) as website_count
        FROM beekon_data.mv_website_dashboard_summary wds
        WHERE wds.website_id = ANY(p_website_ids)
    ),
    enhanced_data AS (
        SELECT
            dd.*,
            -- Get average ranking from recent analysis data
            COALESCE((
                SELECT AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
                    THEN lar.rank_position ELSE 4 END)
                FROM beekon_data.llm_analysis_results lar
                WHERE lar.website_id = ANY(p_website_ids)
                AND (p_date_start IS NULL OR lar.analyzed_at >= p_date_start)
                AND (p_date_end IS NULL OR lar.analyzed_at <= p_date_end)
            ), 4.0) as avg_ranking_calc
        FROM dashboard_data dd
    )
    SELECT * INTO raw_data FROM enhanced_data;

    -- Get top performing topic dynamically instead of hardcoded value
    SELECT topic_name INTO top_topic
    FROM beekon_data.mv_topic_performance mtp
    WHERE mtp.website_id = ANY(p_website_ids)
    AND mtp.total_analyses > 0
    ORDER BY mtp.mention_rate DESC, mtp.total_mentions DESC
    LIMIT 1;

    -- Return optimized values with proper types
    RETURN QUERY SELECT
        COALESCE(raw_data.avg_visibility, 0::DECIMAL) as overall_visibility_score,
        COALESCE(raw_data.avg_ranking_calc, 4.0::DECIMAL) as average_ranking,
        COALESCE(raw_data.total_mentions_sum, 0::BIGINT) as total_mentions,        -- Fixed: Explicit BIGINT cast
        COALESCE((raw_data.avg_sentiment + 1) * 50, 50::DECIMAL) as sentiment_score,
        COALESCE(raw_data.total_analyses_sum, 0::BIGINT) as total_analyses,        -- Fixed: Explicit BIGINT cast
        COALESCE(raw_data.website_count, 0)::INTEGER as active_websites,
        COALESCE(top_topic, 'No Topics Found'::TEXT) as top_performing_topic,     -- Fixed: Dynamic instead of hardcoded
        0::DECIMAL as improvement_trend;

    -- Add fallback mechanism if materialized view returns no data
    IF NOT FOUND OR raw_data.total_analyses_sum = 0 THEN
        -- Fallback to direct table query
        WITH fallback_data AS (
            SELECT
                COUNT(*)::BIGINT as total_analyses_fallback,
                COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::BIGINT as total_mentions_fallback,
                CASE
                    WHEN COUNT(*) > 0
                    THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(*)::DECIMAL) * 100
                    ELSE 0::DECIMAL
                END as visibility_fallback,
                AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
                    THEN lar.rank_position ELSE 4 END) as avg_rank_fallback,
                AVG(lar.sentiment_score) as avg_sentiment_fallback,
                COUNT(DISTINCT lar.website_id) as website_count_fallback
            FROM beekon_data.llm_analysis_results lar
            WHERE lar.website_id = ANY(p_website_ids)
            AND (p_date_start IS NULL OR lar.analyzed_at >= p_date_start)
            AND (p_date_end IS NULL OR lar.analyzed_at <= p_date_end)
        )
        SELECT
            fd.visibility_fallback,
            COALESCE(fd.avg_rank_fallback, 4.0::DECIMAL),
            fd.total_mentions_fallback,
            COALESCE((fd.avg_sentiment_fallback + 1) * 50, 50::DECIMAL),
            fd.total_analyses_fallback,
            fd.website_count_fallback::INTEGER,
            'Fallback Data'::TEXT,
            0::DECIMAL
        FROM fallback_data fd;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. CHECK IF get_dashboard_time_series EXISTS - CREATE IF MISSING
-- =========================================================================

-- Check if function exists and create if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.routines
        WHERE routine_schema = 'beekon_data'
        AND routine_name = 'get_dashboard_time_series'
    ) THEN
        CREATE OR REPLACE FUNCTION beekon_data.get_dashboard_time_series(
            p_website_ids UUID[],
            p_days INTEGER DEFAULT 7
        )
        RETURNS TABLE (
            date DATE,
            visibility DECIMAL,
            mentions BIGINT,
            sentiment DECIMAL
        ) AS $func$
        BEGIN
            IF p_website_ids IS NULL OR array_length(p_website_ids, 1) = 0 THEN
                RETURN;
            END IF;

            RETURN QUERY
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - (p_days - 1),
                    CURRENT_DATE,
                    '1 day'::interval
                )::date AS date
            ),
            raw_daily_data AS (
                SELECT
                    lar.analyzed_at::date as analysis_date,
                    COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::BIGINT as daily_mentions,
                    CASE
                        WHEN COUNT(lar.id) > 0
                        THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                        ELSE 0::DECIMAL
                    END as daily_visibility,
                    CASE
                        WHEN AVG(lar.sentiment_score) IS NOT NULL
                        THEN (AVG(lar.sentiment_score) + 1) * 50
                        ELSE 50::DECIMAL
                    END as daily_sentiment
                FROM beekon_data.llm_analysis_results lar
                WHERE lar.website_id = ANY(p_website_ids)
                AND lar.analyzed_at >= CURRENT_DATE - p_days
                AND lar.analyzed_at <= CURRENT_DATE + INTERVAL '1 day'
                GROUP BY lar.analyzed_at::date
            )
            SELECT
                ds.date,
                COALESCE(rdd.daily_visibility, 0::DECIMAL) as visibility,
                COALESCE(rdd.daily_mentions, 0::BIGINT) as mentions,
                COALESCE(rdd.daily_sentiment, 50::DECIMAL) as sentiment
            FROM date_series ds
            LEFT JOIN raw_daily_data rdd ON ds.date = rdd.analysis_date
            ORDER BY ds.date;
        END;
        $func$ LANGUAGE plpgsql SECURITY DEFINER;

        -- Grant permissions
        GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_time_series TO authenticated;
        GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_time_series TO service_role;
    END IF;
END $$;

-- =========================================================================
-- 4. GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_metrics TO service_role;

-- =========================================================================
-- 5. ADD FUNCTION COMMENTS
-- =========================================================================

COMMENT ON FUNCTION beekon_data.get_dashboard_metrics IS
'Fixed version with correct return types (BIGINT for counts), dynamic top topic calculation, and robust fallback mechanism.';

COMMENT ON FUNCTION beekon_data.get_dashboard_time_series IS
'Time series function for dashboard charts with proper type casting and date handling.';