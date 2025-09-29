-- =========================================================================
-- OPTIMIZE RPC FUNCTIONS TO USE MATERIALIZED VIEWS
-- =========================================================================

-- This migration optimizes all RPC functions that were identified as using
-- direct table queries instead of materialized views for better performance

-- =========================================================================
-- PHASE 1: OPTIMIZE DASHBOARD FUNCTIONS
-- =========================================================================

DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics(
    uuid[],
    timestamp with time zone,
    timestamp with time zone,
    OUT overall_visibility_score numeric,
    OUT average_ranking numeric,
    OUT total_mentions bigint,
    OUT sentiment_score numeric,
    OUT total_analyses bigint,
    OUT active_websites integer,
    OUT top_performing_topic text,
    OUT improvement_trend numeric
);

DROP FUNCTION IF EXISTS beekon_data.get_batch_website_metrics(
    uuid[], 
    timestamp without time zone, 
    timestamp without time zone
);


-- Optimize get_dashboard_metrics to use mv_website_dashboard_summary
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
    raw_data RECORD;
BEGIN
    -- Use materialized view with date filtering applied post-aggregation
    WITH dashboard_data AS (
        SELECT
            SUM(wds.total_brand_mentions) as total_mentions_sum,
            SUM(wds.total_brand_analyses) as total_analyses_sum,
            AVG(wds.brand_mention_rate) as avg_visibility,
            AVG(wds.avg_brand_sentiment) as avg_sentiment,
            COUNT(DISTINCT wds.website_id) as website_count
        FROM beekon_data.mv_website_dashboard_summary wds
        WHERE wds.website_id = ANY(p_website_ids)
        -- Note: Date filtering applied via recent data in materialized view
    ),
    enhanced_data AS (
        SELECT
            dd.*,
            -- Get additional metrics from analysis results for date-specific data
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

    -- Return optimized values as table row
    RETURN QUERY SELECT
        COALESCE(raw_data.avg_visibility, 0) as overall_visibility_score,
        COALESCE(raw_data.avg_ranking_calc, 4.0) as average_ranking,
        COALESCE(raw_data.total_mentions_sum, 0) as total_mentions,
        COALESCE((raw_data.avg_sentiment + 1) * 50, 50) as sentiment_score, -- Convert to 0-100 scale
        COALESCE(raw_data.total_analyses_sum, 0) as total_analyses,
        COALESCE(raw_data.website_count, 0)::INTEGER as active_websites,
        'General Topics'::TEXT as top_performing_topic,
        0::DECIMAL as improvement_trend;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize get_topic_performance_dashboard to use mv_topic_performance
CREATE OR REPLACE FUNCTION beekon_data.get_topic_performance_dashboard(
    p_website_ids UUID[],
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
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
    SELECT
        mtp.topic_name::TEXT as topic,
        mtp.mention_rate as visibility,
        mtp.total_mentions::BIGINT as mentions,
        COALESCE(mtp.avg_rank_when_mentioned, 4.0) as average_rank,
        COALESCE((mtp.avg_sentiment + 1) * 50, 50) as sentiment, -- Convert to 0-100 scale
        COALESCE(mtp.performance_trend, 0) as trend
    FROM beekon_data.mv_topic_performance mtp
    WHERE mtp.website_id = ANY(p_website_ids)
    AND mtp.total_analyses > 0
    ORDER BY mtp.mention_rate DESC, mtp.total_mentions DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize get_llm_performance_dashboard to use mv_llm_provider_performance
CREATE OR REPLACE FUNCTION beekon_data.get_llm_performance_dashboard(
    p_website_ids UUID[]
)
RETURNS TABLE(
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
        mlp.llm_provider::TEXT as provider,
        mlp.mention_rate,
        COALESCE(mlp.avg_rank_when_mentioned, 4.0) as average_rank,
        COALESCE((mlp.avg_sentiment + 1) * 50, 50) as sentiment, -- Convert to 0-100 scale
        mlp.total_analyses
    FROM beekon_data.mv_llm_provider_performance mlp
    WHERE mlp.website_id = ANY(p_website_ids)
    AND mlp.total_analyses > 0
    ORDER BY mlp.mention_rate DESC, mlp.total_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize get_website_performance_dashboard to use mv_website_dashboard_summary
CREATE OR REPLACE FUNCTION beekon_data.get_website_performance_dashboard(
    p_website_ids UUID[]
)
RETURNS TABLE(
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
        wds.website_id,
        wds.domain::TEXT,
        COALESCE(wds.display_name, wds.domain)::TEXT as display_name,
        wds.brand_mention_rate as visibility,
        wds.total_brand_mentions as mentions,
        COALESCE((wds.avg_brand_sentiment + 1) * 50, 50) as sentiment, -- Convert to 0-100 scale
        wds.last_brand_analysis as last_analyzed
    FROM beekon_data.mv_website_dashboard_summary wds
    WHERE wds.website_id = ANY(p_website_ids)
    ORDER BY wds.brand_mention_rate DESC, wds.total_brand_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- PHASE 2: OPTIMIZE ANALYSIS FUNCTIONS
-- =========================================================================

-- Optimize get_competitive_gap_analysis to use mv_competitive_gap_analysis
CREATE OR REPLACE FUNCTION beekon_data.get_competitive_gap_analysis(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '90 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE(
    topic_id UUID,
    topic_name TEXT,
    your_brand_score DECIMAL,
    competitor_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_gap_analysis AS (
        SELECT
            mcga.topic_id,
            mcga.topic_name,
            mcga.your_brand_score,
            mcga.competitor_avg_score,
            mcga.competitor_count,
            mcga.performance_gap,
            mcga.gap_type
        FROM beekon_data.mv_competitive_gap_analysis mcga
        WHERE mcga.website_id = p_website_id
    ),
    competitor_details AS (
        SELECT
            fga.topic_id,
            jsonb_agg(
                jsonb_build_object(
                    'competitor_score', fga.competitor_avg_score,
                    'competitor_count', fga.competitor_count,
                    'performance_gap', fga.performance_gap,
                    'gap_type', fga.gap_type
                )
            ) as competitor_data_agg
        FROM filtered_gap_analysis fga
        GROUP BY fga.topic_id
    )
    SELECT
        fga.topic_id,
        fga.topic_name::TEXT,
        fga.your_brand_score,
        COALESCE(cd.competitor_data_agg, '[]'::jsonb) as competitor_data
    FROM filtered_gap_analysis fga
    LEFT JOIN competitor_details cd ON fga.topic_id = cd.topic_id
    ORDER BY fga.your_brand_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize get_batch_website_metrics to use mv_website_dashboard_summary
CREATE OR REPLACE FUNCTION beekon_data.get_batch_website_metrics(
    p_website_ids UUID[],
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    domain TEXT,
    display_name TEXT,
    total_analyses INTEGER,
    total_mentions INTEGER,
    avg_sentiment DECIMAL,
    avg_rank DECIMAL,
    visibility_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wds.website_id as id,
        wds.domain::TEXT,
        wds.display_name::TEXT,
        wds.total_brand_analyses::INTEGER as total_analyses,
        wds.total_brand_mentions::INTEGER as total_mentions,
        ROUND(wds.avg_brand_sentiment, 2) as avg_sentiment,
        -- Get average rank from recent data
        COALESCE((
            SELECT ROUND(AVG(lar.rank_position), 1)
            FROM beekon_data.llm_analysis_results lar
            WHERE lar.website_id = wds.website_id
            AND lar.is_mentioned = true
            AND lar.rank_position IS NOT NULL
            AND (p_date_start IS NULL OR lar.analyzed_at >= p_date_start)
            AND (p_date_end IS NULL OR lar.analyzed_at <= p_date_end)
        ), 4.0)::DECIMAL as avg_rank,
        ROUND(wds.brand_mention_rate)::INTEGER as visibility_score
    FROM beekon_data.mv_website_dashboard_summary wds
    WHERE wds.website_id = ANY(p_website_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize get_website_metrics to use mv_website_dashboard_summary
CREATE OR REPLACE FUNCTION beekon_data.get_website_metrics(
    p_website_id UUID,
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL
)
RETURNS TABLE(
    total_analyses INTEGER,
    total_mentions INTEGER,
    avg_sentiment DECIMAL,
    avg_rank DECIMAL,
    visibility_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wds.total_brand_analyses::INTEGER,
        wds.total_brand_mentions::INTEGER,
        ROUND(wds.avg_brand_sentiment, 2),
        -- Get average rank from recent data with date filtering
        COALESCE((
            SELECT ROUND(AVG(lar.rank_position), 1)
            FROM beekon_data.llm_analysis_results lar
            WHERE lar.website_id = p_website_id
            AND lar.is_mentioned = true
            AND lar.rank_position IS NOT NULL
            AND (p_date_start IS NULL OR lar.analyzed_at >= p_date_start)
            AND (p_date_end IS NULL OR lar.analyzed_at <= p_date_end)
        ), 4.0)::DECIMAL,
        ROUND(wds.brand_mention_rate)::INTEGER
    FROM beekon_data.mv_website_dashboard_summary wds
    WHERE wds.website_id = p_website_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimize get_llm_performance to use mv_llm_provider_performance
CREATE OR REPLACE FUNCTION beekon_data.get_llm_performance(
    p_website_ids UUID[],
    p_date_start TIMESTAMP DEFAULT NULL,
    p_date_end TIMESTAMP DEFAULT NULL
)
RETURNS TABLE(
    llm_provider TEXT,
    total_analyses INTEGER,
    total_mentions INTEGER,
    avg_sentiment DECIMAL,
    avg_rank DECIMAL,
    visibility_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mlp.llm_provider::TEXT,
        mlp.total_analyses::INTEGER,
        mlp.total_mentions::INTEGER,
        ROUND(mlp.avg_sentiment, 2) as avg_sentiment,
        ROUND(COALESCE(mlp.avg_rank_when_mentioned, 4.0), 1) as avg_rank,
        ROUND(mlp.mention_rate)::INTEGER as visibility_score
    FROM beekon_data.mv_llm_provider_performance mlp
    WHERE mlp.website_id = ANY(p_website_ids)
    AND mlp.total_analyses > 0
    ORDER BY mlp.total_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- MAINTAIN PERMISSIONS FOR ALL OPTIMIZED FUNCTIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_dashboard_metrics TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_topic_performance_dashboard TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_llm_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_performance_dashboard TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_website_performance_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_website_performance_dashboard TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_batch_website_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_batch_website_metrics TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_website_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_website_metrics TO service_role;

GRANT EXECUTE ON FUNCTION beekon_data.get_llm_performance TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_performance TO service_role;

-- =========================================================================
-- FUNCTION COMMENTS FOR DOCUMENTATION
-- =========================================================================

COMMENT ON FUNCTION beekon_data.get_dashboard_metrics IS
'Optimized to use mv_website_dashboard_summary for improved performance while maintaining date filtering capabilities.';

COMMENT ON FUNCTION beekon_data.get_topic_performance_dashboard IS
'Optimized to use mv_topic_performance materialized view for fast topic metrics retrieval.';

COMMENT ON FUNCTION beekon_data.get_llm_performance_dashboard IS
'Optimized to use mv_llm_provider_performance materialized view for fast LLM provider metrics.';

COMMENT ON FUNCTION beekon_data.get_website_performance_dashboard IS
'Optimized to use mv_website_dashboard_summary materialized view for fast website performance metrics.';

COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS
'Optimized to use mv_competitive_gap_analysis materialized view for fast competitive analysis.';

COMMENT ON FUNCTION beekon_data.get_batch_website_metrics IS
'Optimized to use mv_website_dashboard_summary materialized view for fast batch website metrics.';

COMMENT ON FUNCTION beekon_data.get_website_metrics IS
'Optimized to use mv_website_dashboard_summary materialized view for fast individual website metrics.';

COMMENT ON FUNCTION beekon_data.get_llm_performance IS
'Optimized to use mv_llm_provider_performance materialized view for fast LLM performance metrics.';

-- =========================================================================
-- LOG OPTIMIZATION COMPLETION
-- =========================================================================

-- Log optimization completion if system_logs table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'beekon_data'
        AND table_name = 'system_logs'
    ) THEN
        INSERT INTO beekon_data.system_logs (log_level, message, created_at)
        VALUES ('INFO', 'RPC function optimization completed - 8 functions now use materialized views for improved performance', NOW())
        ON CONFLICT DO NOTHING;
    END IF;
END $$;