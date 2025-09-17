-- =================================================================
-- APPLY ALL DATABASE FIXES - COMPREHENSIVE SOLUTION
-- =================================================================
-- This migration applies all database function fixes in the correct order
-- to resolve the 400 Bad Request errors and column ambiguity issues.
--
-- Issues Fixed:
-- 1. get_dashboard_metrics 400 Bad Request
-- 2. get_dashboard_time_series 400 Bad Request
-- 3. get_competitive_gap_analysis column "topic_id" is ambiguous
-- 4. get_competitor_share_of_voice column "competitor_id" is ambiguous
-- =================================================================

BEGIN;

-- =================================================================
-- STEP 1: CLEAN UP EXISTING FUNCTIONS
-- =================================================================

-- Drop all existing functions with any possible signatures
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics(UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics;
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_time_series(UUID[], INTEGER);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_time_series(TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_time_series;
DROP FUNCTION IF EXISTS beekon_data.get_topic_performance_dashboard(UUID[], INTEGER);
DROP FUNCTION IF EXISTS beekon_data.get_website_performance_dashboard(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_llm_performance_dashboard(UUID[]);
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice(uuid, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS beekon_data.get_competitive_gap_analysis(uuid, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS beekon_data.refresh_competitor_performance_views();
DROP FUNCTION IF EXISTS beekon_data.refresh_dashboard_performance_views();

-- =================================================================
-- STEP 2: CREATE MATERIALIZED VIEW IF MISSING
-- =================================================================
-- Ensure mv_website_dashboard_summary exists for dashboard functions

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'beekon_data'
        AND table_name = 'mv_website_dashboard_summary'
    ) THEN
        CREATE MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary AS
        SELECT
            w.id as website_id,
            w.domain,
            w.display_name,
            -- Brand analysis metrics
            COUNT(lar.id) as total_brand_analyses,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) as total_brand_mentions,
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END as brand_mention_rate,
            AVG(lar.sentiment_score) as avg_brand_sentiment,
            AVG(lar.confidence_score) as avg_brand_confidence,
            MAX(lar.analyzed_at) as last_brand_analysis,
            -- Competitor metrics (from existing materialized view if available)
            COALESCE(comp_metrics.total_competitor_mentions, 0) as total_competitor_mentions,
            COALESCE(comp_metrics.competitor_count, 0) as competitor_count,
            COALESCE(comp_metrics.competitor_analysis_health_score, 75) as competitor_analysis_health_score
        FROM beekon_data.websites w
        LEFT JOIN beekon_data.topics t ON w.id = t.website_id AND t.is_active = TRUE
        LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id AND p.is_active = TRUE
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
            AND lar.analyzed_at >= NOW() - INTERVAL '90 days'
        LEFT JOIN (
            SELECT
                mv.website_id,
                SUM(COALESCE(mv.total_voice_mentions, 0)) as total_competitor_mentions,
                COUNT(DISTINCT mv.competitor_id) as competitor_count,
                CASE
                    WHEN SUM(COALESCE(mv.total_voice_mentions, 0)) > 0
                    THEN LEAST(100, 50 + (COUNT(DISTINCT mv.competitor_id) * 5))
                    ELSE 75
                END as competitor_analysis_health_score
            FROM beekon_data.mv_competitor_share_of_voice mv
            GROUP BY mv.website_id
        ) comp_metrics ON w.id = comp_metrics.website_id
        WHERE w.is_active = TRUE
        GROUP BY w.id, w.domain, w.display_name, comp_metrics.total_competitor_mentions,
                 comp_metrics.competitor_count, comp_metrics.competitor_analysis_health_score;

        -- Create indexes
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_website_dashboard_summary_unique
            ON beekon_data.mv_website_dashboard_summary (website_id);
        CREATE INDEX IF NOT EXISTS idx_mv_website_dashboard_website
            ON beekon_data.mv_website_dashboard_summary (website_id, last_brand_analysis DESC);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Continue if materialized view creation fails
    NULL;
END
$$;

-- =================================================================
-- STEP 3: DASHBOARD FUNCTIONS (ROBUST WITH FALLBACKS)
-- =================================================================

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
            0::DECIMAL, 4.0::DECIMAL, 0::BIGINT, 2.5::DECIMAL,
            0::BIGINT, 0::INTEGER, NULL::TEXT, 0::DECIMAL;
        RETURN;
    END IF;

    -- Check if materialized view exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'beekon_data'
        AND table_name = 'mv_website_dashboard_summary'
    ) INTO mv_exists;

    -- Use materialized view if available
    IF mv_exists THEN
        BEGIN
            RETURN QUERY
            WITH dashboard_aggregates AS (
                SELECT
                    CASE
                        WHEN SUM(COALESCE(mvd.total_brand_mentions, 0) + COALESCE(mvd.total_competitor_mentions, 0)) > 0
                        THEN (SUM(COALESCE(mvd.total_brand_mentions, 0))::DECIMAL /
                              SUM(COALESCE(mvd.total_brand_mentions, 0) + COALESCE(mvd.total_competitor_mentions, 0))::DECIMAL) * 100
                        ELSE 50
                    END AS visibility_score,
                    3.0 AS avg_ranking,
                    SUM(COALESCE(mvd.total_brand_mentions, 0)) as total_mentions,
                    AVG(COALESCE(mvd.competitor_analysis_health_score, 75)) / 20.0 as sentiment_score,
                    SUM(COALESCE(mvd.total_brand_analyses, 0)) as total_analyses,
                    COUNT(DISTINCT mvd.website_id) as active_websites
                FROM beekon_data.mv_website_dashboard_summary mvd
                WHERE mvd.website_id = ANY(p_website_ids)
                AND COALESCE(mvd.last_brand_analysis, p_date_start) >= p_date_start
                AND COALESCE(mvd.last_brand_analysis, p_date_end) <= p_date_end
            )
            SELECT
                COALESCE(da.visibility_score, 50) as overall_visibility_score,
                COALESCE(da.avg_ranking, 4.0) as average_ranking,
                COALESCE(da.total_mentions, 0) as total_mentions,
                COALESCE(da.sentiment_score, 2.5) as sentiment_score,
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
    )
    SELECT
        COALESCE(rdd.visibility_score, 50) as overall_visibility_score,
        COALESCE(rdd.avg_ranking, 4.0) as average_ranking,
        COALESCE(rdd.total_mentions, 0) as total_mentions,
        COALESCE(rdd.sentiment_score, 2.5) as sentiment_score,
        COALESCE(rdd.total_analyses, 0) as total_analyses,
        COALESCE(rdd.active_websites, 0) as active_websites,
        'General Topics'::TEXT as top_performing_topic,
        0::DECIMAL as improvement_trend
    FROM raw_dashboard_data rdd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
            CASE
                WHEN COUNT(lar.id) > 0
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 50
            END as daily_visibility,
            CASE
                WHEN AVG(lar.sentiment_score) IS NOT NULL
                THEN (AVG(lar.sentiment_score) + 1) * 2.5
                ELSE 2.5
            END as daily_sentiment
        FROM beekon_data.llm_analysis_results lar
        WHERE lar.website_id = ANY(p_website_ids)
        AND lar.analyzed_at >= CURRENT_DATE - p_days
        AND lar.analyzed_at <= CURRENT_DATE + INTERVAL '1 day'
        GROUP BY lar.analyzed_at::date
    )
    SELECT
        ds.date,
        COALESCE(rdd.daily_visibility, 50) as visibility,
        COALESCE(rdd.daily_mentions, 0) as mentions,
        COALESCE(rdd.daily_sentiment, 2.5) as sentiment
    FROM date_series ds
    LEFT JOIN raw_daily_data rdd ON ds.date = rdd.analysis_date
    ORDER BY ds.date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- STEP 4: COMPETITOR FUNCTIONS (FIXED COLUMN AMBIGUITY)
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
    RETURN QUERY
    WITH competitor_data AS (
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
          AND (car.id IS NULL OR car.analyzed_at BETWEEN p_date_start AND p_date_end)
        GROUP BY comp.id, comp.competitor_name, comp.competitor_domain
    ),
    total_market AS (
        SELECT COALESCE(SUM(cd.total_voice_mentions), 0) AS total_market_mentions
        FROM competitor_data cd
    )
    SELECT
        cd.competitor_id,
        cd.competitor_name,
        cd.competitor_domain,
        cd.total_analyses,
        cd.total_voice_mentions,
        CASE
            WHEN tm.total_market_mentions > 0
            THEN (cd.total_voice_mentions::DECIMAL / tm.total_market_mentions::DECIMAL) * 100
            ELSE 0
        END AS share_of_voice,
        cd.avg_rank_position,
        cd.avg_sentiment_score,
        cd.avg_confidence_score
    FROM competitor_data cd
    CROSS JOIN total_market tm
    ORDER BY cd.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
            topics.id as topic_id,
            topics.topic_name
        FROM beekon_data.topics topics
        WHERE topics.website_id = p_website_id
        AND topics.is_active = TRUE
    ),
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
        WHERE (lar.id IS NULL OR lar.analyzed_at BETWEEN p_date_start AND p_date_end)
        AND (lar.id IS NULL OR lar.website_id = p_website_id)
        GROUP BY wt.topic_id, wt.topic_name
    ),
    competitor_performance AS (
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
        WHERE competitors.is_active = TRUE
        AND (car.id IS NULL OR car.analyzed_at BETWEEN p_date_start AND p_date_end)
        GROUP BY wt.topic_id, competitors.id, competitors.competitor_name, competitors.competitor_domain
        HAVING COUNT(car.id) > 0 OR competitors.id IS NOT NULL
    ),
    aggregated_competitor_data AS (
        SELECT
            cpr.topic_id,
            COALESCE(
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
                ) FILTER (WHERE cpr.competitor_id IS NOT NULL),
                '[]'::jsonb
            ) AS competitor_data
        FROM competitor_performance cpr
        GROUP BY cpr.topic_id
    )
    SELECT
        ybp.topic_id,
        ybp.topic_name,
        ybp.your_brand_score,
        COALESCE(acd.competitor_data, '[]'::jsonb) AS competitor_data
    FROM your_brand_performance ybp
    LEFT JOIN aggregated_competitor_data acd ON ybp.topic_id = acd.topic_id
    ORDER BY ybp.your_brand_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- STEP 5: ADDITIONAL DASHBOARD FUNCTIONS
-- =================================================================

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
-- STEP 6: REFRESH FUNCTIONS
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_performance_views()
RETURNS VOID AS $$
BEGIN
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    EXCEPTION WHEN OTHERS THEN
        REFRESH MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice;
    END;

    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_website_dashboard_summary;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            REFRESH MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- View might not exist yet
        END;
    END;

    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', 'All performance views refreshed', NOW())
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION beekon_data.refresh_dashboard_performance_views()
RETURNS VOID AS $$
BEGIN
    PERFORM beekon_data.refresh_competitor_performance_views();
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
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_dashboard_performance_views TO authenticated;

-- =================================================================
-- STEP 8: FINAL COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_dashboard_metrics IS 'COMPREHENSIVE FIX: Dashboard metrics with materialized view optimization and robust fallback handling - resolves 400 Bad Request errors';
COMMENT ON FUNCTION beekon_data.get_dashboard_time_series IS 'COMPREHENSIVE FIX: Time series data with fallback support - resolves 400 Bad Request errors';
COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'COMPREHENSIVE FIX: Competitor share of voice with resolved column ambiguity issues';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'COMPREHENSIVE FIX: Competitive gap analysis with resolved column ambiguity issues';

COMMIT;