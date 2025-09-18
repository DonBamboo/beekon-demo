-- =================================================================
-- FIX DASHBOARD DATA ACCURACY ISSUES (WITH PROPER FUNCTION DROPS)
-- =================================================================
-- This migration fixes two critical data accuracy issues:
-- 1. Visibility Over Time chart showing constant 50% values
-- 2. Sentiment values incorrectly displaying as "Negative"
--
-- NOTE: This version properly drops existing functions first
-- =================================================================

BEGIN;

-- =================================================================
-- STEP 1: DROP ALL EXISTING FUNCTIONS WITH ALL POSSIBLE SIGNATURES
-- =================================================================

-- Drop get_dashboard_metrics with all possible signatures
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics(UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics(UUID[], TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics();

-- Drop get_dashboard_time_series with all possible signatures
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_time_series(UUID[], INTEGER);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_time_series(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_time_series();

-- Drop get_topic_performance_dashboard with all possible signatures
DROP FUNCTION IF EXISTS beekon_data.get_topic_performance_dashboard(UUID[], INTEGER);
DROP FUNCTION IF EXISTS beekon_data.get_topic_performance_dashboard(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_topic_performance_dashboard();

-- Drop get_website_performance_dashboard with all possible signatures
DROP FUNCTION IF EXISTS beekon_data.get_website_performance_dashboard(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_website_performance_dashboard();

-- Drop get_llm_performance_dashboard with all possible signatures
DROP FUNCTION IF EXISTS beekon_data.get_llm_performance_dashboard(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_llm_performance_dashboard();

-- =================================================================
-- STEP 2: RECREATE get_dashboard_time_series FUNCTION
-- =================================================================
-- Issue: Shows 50% visibility for days without analysis data
-- Fix: Show 0% for days without analysis, fix sentiment scale to 0-100

CREATE OR REPLACE FUNCTION beekon_data.get_dashboard_time_series(
    p_website_ids UUID[],
    p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    date DATE,
    visibility DECIMAL,
    mentions BIGINT,
    sentiment DECIMAL
) AS $$
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
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) as daily_mentions,
            -- FIX: Changed fallback from 50 to 0 for accurate visibility representation
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0  -- ✅ FIXED: Show 0% instead of 50% when no analysis data
            END as daily_visibility,
            -- FIX: Changed sentiment calculation to 0-100 scale instead of 0-5 scale
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 50  -- ✅ FIXED: Changed from * 2.5 to * 50
                ELSE 50  -- ✅ FIXED: Changed from 2.5 to 50 (neutral on 0-100 scale)
            END as daily_sentiment
        FROM beekon_data.llm_analysis_results lar
        WHERE lar.website_id = ANY(p_website_ids)
        AND lar.analyzed_at >= CURRENT_DATE - p_days
        AND lar.analyzed_at <= CURRENT_DATE + INTERVAL '1 day'
        GROUP BY lar.analyzed_at::date
    )
    SELECT
        ds.date,
        -- FIX: Changed fallback from 50 to 0 for accurate visibility representation
        COALESCE(rdd.daily_visibility, 0) as visibility,  -- ✅ FIXED: Show 0% instead of 50%
        COALESCE(rdd.daily_mentions, 0) as mentions,
        -- FIX: Changed fallback to match 0-100 sentiment scale
        COALESCE(rdd.daily_sentiment, 50) as sentiment  -- ✅ FIXED: Changed from 2.5 to 50
    FROM date_series ds
    LEFT JOIN raw_daily_data rdd ON ds.date = rdd.analysis_date
    ORDER BY ds.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- STEP 3: RECREATE get_topic_performance_dashboard FUNCTION
-- =================================================================
-- Issue: Sentiment calculation produces 0-5 scale instead of 0-100 scale

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
            -- FIX: Changed sentiment calculation to 0-100 scale instead of 0-5 scale
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 50  -- ✅ FIXED: Changed from * 2.5 to * 50
                ELSE 50  -- ✅ FIXED: Changed from 2.5 to 50 (neutral on 0-100 scale)
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

-- =================================================================
-- STEP 4: RECREATE get_website_performance_dashboard FUNCTION
-- =================================================================
-- Issue: Sentiment calculation produces 0-5 scale instead of 0-100 scale

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
        -- FIX: Changed sentiment calculation to 0-100 scale instead of 0-5 scale
        CASE
            WHEN AVG(lar.sentiment_score) IS NOT NULL
            THEN (AVG(lar.sentiment_score) + 1) * 50  -- ✅ FIXED: Changed from * 2.5 to * 50
            ELSE 50  -- ✅ FIXED: Changed from 2.5 to 50 (neutral on 0-100 scale)
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

-- =================================================================
-- STEP 5: RECREATE get_llm_performance_dashboard FUNCTION
-- =================================================================
-- Issue: Sentiment calculation produces 0-5 scale instead of 0-100 scale

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
    IF p_website_ids IS NULL OR array_length(p_website_ids, 1) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        lar.llm_provider as provider,
        CASE
            WHEN COUNT(lar.id) > 0
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END as mention_rate,
        AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
            THEN lar.rank_position ELSE 4 END) as average_rank,
        -- FIX: Changed sentiment calculation to 0-100 scale instead of 0-5 scale
        CASE
            WHEN AVG(lar.sentiment_score) IS NOT NULL
            THEN (AVG(lar.sentiment_score) + 1) * 50  -- ✅ FIXED: Changed from * 2.5 to * 50
            ELSE 50  -- ✅ FIXED: Changed from 2.5 to 50 (neutral on 0-100 scale)
        END as sentiment,
        COUNT(lar.id) as total_analyses
    FROM beekon_data.llm_analysis_results lar
    WHERE lar.website_id = ANY(p_website_ids)
    AND lar.analyzed_at >= NOW() - INTERVAL '30 days'
    GROUP BY lar.llm_provider
    ORDER BY mention_rate DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- STEP 6: RECREATE get_dashboard_metrics FUNCTION
-- =================================================================
-- Issue: Fix sentiment calculation to use 0-100 scale consistently

CREATE OR REPLACE FUNCTION beekon_data.get_dashboard_metrics(
    p_website_ids UUID[],
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    overall_visibility_score DECIMAL,
    average_ranking DECIMAL,
    total_mentions BIGINT,
    sentiment_score DECIMAL,
    total_analyses BIGINT,
    active_websites INTEGER,
    top_performing_topic TEXT,
    improvement_trend DECIMAL
) AS $$
DECLARE
    website_count INTEGER;
    mv_exists BOOLEAN := FALSE;
BEGIN
    website_count := array_length(p_website_ids, 1);

    IF website_count = 0 OR p_website_ids IS NULL THEN
        RETURN QUERY SELECT
            0::DECIMAL as overall_visibility_score,
            0::DECIMAL as average_ranking,
            0::BIGINT as total_mentions,
            50::DECIMAL as sentiment_score,  -- ✅ FIXED: Changed from 0 to 50 (neutral)
            0::BIGINT as total_analyses,
            0::INTEGER as active_websites,
            'No Data'::TEXT as top_performing_topic,
            0::DECIMAL as improvement_trend;
        RETURN;
    END IF;

    -- Check if materialized view exists and has recent data
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'beekon_data'
            AND table_name = 'mv_website_dashboard_summary'
        ) THEN
            mv_exists := TRUE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        mv_exists := FALSE;
    END;

    -- Try materialized view first
    IF mv_exists THEN
        BEGIN
            RETURN QUERY
            WITH dashboard_aggregates AS (
                SELECT
                    CASE
                        WHEN SUM(COALESCE(mvd.total_brand_analyses, 0)) > 0
                        THEN (SUM(COALESCE(mvd.total_brand_mentions, 0))::DECIMAL / SUM(COALESCE(mvd.total_brand_analyses, 0))::DECIMAL) * 100
                        ELSE 0
                    END AS visibility_score,
                    3.0 AS avg_ranking,
                    SUM(COALESCE(mvd.total_brand_mentions, 0)) as total_mentions,
                    -- FIX: Changed sentiment calculation to 0-100 scale
                    CASE
                        WHEN AVG(mvd.avg_brand_sentiment) IS NOT NULL
                        THEN (AVG(mvd.avg_brand_sentiment) + 1) * 50  -- ✅ FIXED: Changed from / 20.0 to * 50
                        ELSE 50  -- ✅ FIXED: Changed from 75 to 50 (neutral)
                    END as sentiment_score,
                    SUM(COALESCE(mvd.total_brand_analyses, 0)) as total_analyses,
                    COUNT(DISTINCT mvd.website_id) as active_websites
                FROM beekon_data.mv_website_dashboard_summary mvd
                WHERE mvd.website_id = ANY(p_website_ids)
                AND COALESCE(mvd.last_brand_analysis, p_date_start) >= p_date_start
                AND COALESCE(mvd.last_brand_analysis, p_date_end) <= p_date_end
            )
            SELECT
                COALESCE(da.visibility_score, 0) as overall_visibility_score,  -- ✅ FIXED: Changed from 50 to 0
                COALESCE(da.avg_ranking, 4.0) as average_ranking,
                COALESCE(da.total_mentions, 0) as total_mentions,
                COALESCE(da.sentiment_score, 50) as sentiment_score,  -- ✅ FIXED: Changed from 2.5 to 50
                COALESCE(da.total_analyses, 0) as total_analyses,
                COALESCE(da.active_websites, 0) as active_websites,
                'General Topics'::TEXT as top_performing_topic,
                0::DECIMAL as improvement_trend
            FROM dashboard_aggregates da;
            RETURN;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Fall through to raw data
        END;
    END IF;

    -- Fallback to raw data
    RETURN QUERY
    WITH raw_dashboard_data AS (
        SELECT
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0  -- ✅ FIXED: Changed from 50 to 0
            END AS visibility_score,
            AVG(CASE WHEN lar.is_mentioned AND lar.rank_position IS NOT NULL
                THEN lar.rank_position ELSE 4 END) AS avg_ranking,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_mentions,
            -- FIX: Changed sentiment calculation to 0-100 scale
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 50  -- ✅ FIXED: Changed from * 2.5 to * 50
                ELSE 50  -- ✅ FIXED: Changed from 2.5 to 50 (neutral)
            END AS sentiment_score,
            COUNT(lar.id) AS total_analyses,
            COUNT(DISTINCT lar.website_id) AS active_websites
        FROM beekon_data.llm_analysis_results lar
        WHERE lar.website_id = ANY(p_website_ids)
        AND lar.analyzed_at BETWEEN p_date_start AND p_date_end
    )
    SELECT
        COALESCE(rdd.visibility_score, 0) as overall_visibility_score,  -- ✅ FIXED: Changed from 50 to 0
        COALESCE(rdd.avg_ranking, 4.0) as average_ranking,
        COALESCE(rdd.total_mentions, 0) as total_mentions,
        COALESCE(rdd.sentiment_score, 50) as sentiment_score,  -- ✅ FIXED: Changed from 2.5 to 50
        COALESCE(rdd.total_analyses, 0) as total_analyses,
        COALESCE(rdd.active_websites, 0) as active_websites,
        'General Topics'::TEXT as top_performing_topic,
        0::DECIMAL as improvement_trend
    FROM raw_dashboard_data rdd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- STEP 7: GRANT PERMISSIONS
-- =================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_time_series TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_website_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_performance_dashboard TO authenticated;

-- =================================================================
-- STEP 8: ADD COMMENTS FOR DOCUMENTATION
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_dashboard_time_series IS 'ACCURACY FIX: Shows 0% visibility for no-analysis days and uses 0-100 sentiment scale';
COMMENT ON FUNCTION beekon_data.get_topic_performance_dashboard IS 'ACCURACY FIX: Uses 0-100 sentiment scale for correct frontend display';
COMMENT ON FUNCTION beekon_data.get_website_performance_dashboard IS 'ACCURACY FIX: Uses 0-100 sentiment scale for correct frontend display';
COMMENT ON FUNCTION beekon_data.get_llm_performance_dashboard IS 'ACCURACY FIX: Uses 0-100 sentiment scale for correct frontend display';
COMMENT ON FUNCTION beekon_data.get_dashboard_metrics IS 'ACCURACY FIX: Uses 0-100 sentiment scale and accurate visibility calculations';

COMMIT;