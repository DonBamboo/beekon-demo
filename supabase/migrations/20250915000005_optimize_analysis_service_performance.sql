-- =================================================================
-- ANALYSIS SERVICE PERFORMANCE OPTIMIZATION
-- =================================================================
-- This migration creates materialized views and optimized functions
-- for the Analysis Service to eliminate expensive 4-table JOINs
-- and complex real-time aggregations.
-- =================================================================

-- =================================================================
-- 0. DROP EXISTING VIEWS AND INDEXES BEFORE OPTIMIZATION
-- =================================================================
-- Drop any existing materialized views and indexes that will be replaced

-- Drop indexes first (dependent objects)
DROP INDEX IF EXISTS beekon_data.idx_mv_analysis_results_unique;
DROP INDEX IF EXISTS beekon_data.idx_mv_analysis_website_topic;
DROP INDEX IF EXISTS beekon_data.idx_mv_analysis_website_analyzed;
DROP INDEX IF EXISTS beekon_data.idx_mv_analysis_mentioned;

DROP INDEX IF EXISTS beekon_data.idx_mv_topic_performance_unique;
DROP INDEX IF EXISTS beekon_data.idx_mv_topic_website;
DROP INDEX IF EXISTS beekon_data.idx_mv_topic_mentions;

DROP INDEX IF EXISTS beekon_data.idx_mv_llm_provider_performance_unique;
DROP INDEX IF EXISTS beekon_data.idx_mv_llm_website;

-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_analysis_results;
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_topic_performance;
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_llm_provider_performance;

-- =================================================================
-- 1. ANALYSIS RESULTS MATERIALIZED VIEW
-- =================================================================
-- Pre-aggregates analysis results with all related data

CREATE MATERIALIZED VIEW beekon_data.mv_analysis_results AS
SELECT
    lar.id,
    lar.website_id,
    lar.prompt_id,
    lar.is_mentioned,
    lar.rank_position,
    lar.sentiment_score,
    lar.confidence_score,
    lar.llm_provider,
    lar.response_text,
    lar.summary_text,
    lar.analyzed_at,
    lar.created_at,
    -- Prompt and topic information
    p.topic_id,
    p.prompt_text,
    p.reporting_text as prompt_reporting_text,
    p.recommendation_text,
    p.strengths,
    p.opportunities,
    t.topic_name,
    -- Analysis session information
    ses.id as session_id,
    ses.analysis_name,
    ses.status as session_status,
    -- Aggregated metrics per analysis result
    COUNT(*) OVER (PARTITION BY lar.website_id, p.topic_id) as topic_total_analyses,
    COUNT(CASE WHEN lar.is_mentioned THEN 1 END) OVER (PARTITION BY lar.website_id, p.topic_id) as topic_mentions,
    AVG(lar.confidence_score) OVER (PARTITION BY lar.website_id, p.topic_id) as topic_avg_confidence,
    AVG(lar.sentiment_score) OVER (PARTITION BY lar.website_id, p.topic_id) as topic_avg_sentiment,
    AVG(lar.rank_position) OVER (PARTITION BY lar.website_id, p.topic_id) as topic_avg_rank
FROM beekon_data.llm_analysis_results lar
INNER JOIN beekon_data.prompts p ON lar.prompt_id = p.id
INNER JOIN beekon_data.topics t ON p.topic_id = t.id
LEFT JOIN beekon_data.analysis_sessions ses ON lar.analysis_session_id = ses.id
WHERE lar.analyzed_at >= NOW() - INTERVAL '90 days'  -- Keep recent data only
AND t.is_active = TRUE
AND p.is_active = TRUE;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_analysis_results_unique ON beekon_data.mv_analysis_results (id);

-- Performance indexes
CREATE INDEX idx_mv_analysis_website_topic ON beekon_data.mv_analysis_results (website_id, topic_id, analyzed_at DESC);
CREATE INDEX idx_mv_analysis_website_analyzed ON beekon_data.mv_analysis_results (website_id, analyzed_at DESC);
CREATE INDEX idx_mv_analysis_mentioned ON beekon_data.mv_analysis_results (website_id, is_mentioned, analyzed_at DESC);

-- =================================================================
-- 2. TOPIC PERFORMANCE MATERIALIZED VIEW
-- =================================================================
-- Pre-aggregated topic-level performance metrics

CREATE MATERIALIZED VIEW beekon_data.mv_topic_performance AS
WITH topic_metrics AS (
    SELECT
        t.website_id,
        t.id as topic_id,
        t.topic_name,
        COUNT(lar.id) as total_analyses,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 END) as total_mentions,
        AVG(lar.confidence_score) as avg_confidence,
        AVG(lar.sentiment_score) as avg_sentiment,
        AVG(CASE WHEN lar.is_mentioned THEN lar.rank_position END) as avg_rank_when_mentioned,
        MAX(lar.analyzed_at) as last_analyzed,
        COUNT(DISTINCT lar.llm_provider) as llm_providers_used,
        -- Recent performance (last 7 days)
        COUNT(CASE WHEN lar.analyzed_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_analyses,
        COUNT(CASE WHEN lar.analyzed_at >= NOW() - INTERVAL '7 days' AND lar.is_mentioned THEN 1 END) as recent_mentions,
        -- Performance percentage
        CASE
            WHEN COUNT(lar.id) > 0
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END as mention_rate
    FROM beekon_data.topics t
    LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id AND p.is_active = TRUE
    LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
    WHERE t.is_active = TRUE
    AND lar.analyzed_at >= NOW() - INTERVAL '90 days'
    GROUP BY t.website_id, t.id, t.topic_name
)
SELECT
    *,
    -- Performance trend calculation
    CASE
        WHEN recent_analyses > 0 AND total_analyses - recent_analyses > 0
        THEN ((recent_mentions::DECIMAL / recent_analyses::DECIMAL) -
              ((total_mentions - recent_mentions)::DECIMAL / (total_analyses - recent_analyses)::DECIMAL)) * 100
        ELSE 0
    END as performance_trend
FROM topic_metrics;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_topic_performance_unique ON beekon_data.mv_topic_performance (website_id, topic_id);

-- Performance indexes
CREATE INDEX idx_mv_topic_website ON beekon_data.mv_topic_performance (website_id, mention_rate DESC);
CREATE INDEX idx_mv_topic_mentions ON beekon_data.mv_topic_performance (website_id, total_mentions DESC);

-- =================================================================
-- 3. LLM PROVIDER PERFORMANCE MATERIALIZED VIEW
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_llm_provider_performance AS
SELECT
    lar.website_id,
    lar.llm_provider,
    COUNT(lar.id) as total_analyses,
    COUNT(CASE WHEN lar.is_mentioned THEN 1 END) as total_mentions,
    CASE
        WHEN COUNT(lar.id) > 0
        THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
        ELSE 0
    END as mention_rate,
    AVG(CASE WHEN lar.is_mentioned THEN lar.rank_position END) as avg_rank_when_mentioned,
    AVG(lar.sentiment_score) as avg_sentiment,
    AVG(lar.confidence_score) as avg_confidence,
    MAX(lar.analyzed_at) as last_used,
    -- Recent performance
    COUNT(CASE WHEN lar.analyzed_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_analyses,
    COUNT(CASE WHEN lar.analyzed_at >= NOW() - INTERVAL '7 days' AND lar.is_mentioned THEN 1 END) as recent_mentions
FROM beekon_data.llm_analysis_results lar
WHERE lar.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY lar.website_id, lar.llm_provider;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_llm_provider_performance_unique ON beekon_data.mv_llm_provider_performance (website_id, llm_provider);

-- Performance indexes
CREATE INDEX idx_mv_llm_website ON beekon_data.mv_llm_provider_performance (website_id, mention_rate DESC);

-- =================================================================
-- 4. OPTIMIZED ANALYSIS RESULTS FUNCTION
-- =================================================================
-- Uses materialized views for instant analysis results

CREATE OR REPLACE FUNCTION beekon_data.get_analysis_results_optimized(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    topic TEXT,
    topic_id UUID,
    llm_provider TEXT,
    is_mentioned BOOLEAN,
    rank_position INTEGER,
    sentiment_score DECIMAL,
    confidence_score DECIMAL,
    summary_text TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    session_name TEXT,
    prompt_text TEXT,
    recommendation_text TEXT,
    strengths TEXT[],
    opportunities TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mar.id,
        mar.topic_name::TEXT as topic,
        mar.topic_id,
        mar.llm_provider::TEXT,
        mar.is_mentioned,
        mar.rank_position,
        mar.sentiment_score,
        mar.confidence_score,
        mar.summary_text::TEXT,
        mar.analyzed_at,
        mar.created_at,
        mar.analysis_name::TEXT as session_name,
        mar.prompt_text::TEXT,
        mar.recommendation_text::TEXT,
        mar.strengths,
        mar.opportunities
    FROM beekon_data.mv_analysis_results mar
    WHERE mar.website_id = p_website_id
    AND mar.analyzed_at BETWEEN p_date_start AND p_date_end
    ORDER BY mar.analyzed_at DESC, mar.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 5. OPTIMIZED TOPICS FUNCTION
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_topics_optimized(
    p_website_id UUID
)
RETURNS TABLE (
    id UUID,
    topic_name TEXT,
    result_count BIGINT,
    mention_rate DECIMAL,
    avg_confidence DECIMAL,
    avg_sentiment DECIMAL,
    last_analyzed TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mtp.topic_id as id,
        mtp.topic_name::TEXT,
        mtp.total_analyses as result_count,
        mtp.mention_rate,
        mtp.avg_confidence,
        mtp.avg_sentiment,
        mtp.last_analyzed
    FROM beekon_data.mv_topic_performance mtp
    WHERE mtp.website_id = p_website_id
    AND mtp.total_analyses > 0
    ORDER BY mtp.mention_rate DESC, mtp.total_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 6. OPTIMIZED LLM PROVIDERS FUNCTION
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.get_llm_providers_optimized(
    p_website_id UUID
)
RETURNS TABLE (
    id TEXT,
    name TEXT,
    description TEXT,
    result_count BIGINT,
    mention_rate DECIMAL,
    avg_confidence DECIMAL,
    avg_sentiment DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mlp.llm_provider::TEXT as id,
        mlp.llm_provider::TEXT as name,
        ('LLM Provider: ' || mlp.llm_provider)::TEXT as description,
        mlp.total_analyses as result_count,
        mlp.mention_rate,
        mlp.avg_confidence,
        mlp.avg_sentiment
    FROM beekon_data.mv_llm_provider_performance mlp
    WHERE mlp.website_id = p_website_id
    AND mlp.total_analyses > 0
    ORDER BY mlp.mention_rate DESC, mlp.total_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 7. REFRESH FUNCTION FOR ANALYSIS VIEWS
-- =================================================================

CREATE OR REPLACE FUNCTION beekon_data.refresh_analysis_performance_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh all analysis materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_analysis_results;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_topic_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_llm_provider_performance;

    -- Log the refresh
    INSERT INTO beekon_data.system_logs (log_level, message, created_at)
    VALUES ('INFO', 'Analysis materialized views refreshed', NOW())
    ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
    -- If concurrent refresh fails, try regular refresh
    REFRESH MATERIALIZED VIEW beekon_data.mv_analysis_results;
    REFRESH MATERIALIZED VIEW beekon_data.mv_topic_performance;
    REFRESH MATERIALIZED VIEW beekon_data.mv_llm_provider_performance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 8. GRANT PERMISSIONS
-- =================================================================

GRANT SELECT ON beekon_data.mv_analysis_results TO authenticated;
GRANT SELECT ON beekon_data.mv_topic_performance TO authenticated;
GRANT SELECT ON beekon_data.mv_llm_provider_performance TO authenticated;

GRANT EXECUTE ON FUNCTION beekon_data.get_analysis_results_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_topics_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_llm_providers_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_analysis_performance_views TO authenticated;

-- =================================================================
-- 9. PERFORMANCE COMMENTS
-- =================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_analysis_results IS 'OPTIMIZED: Pre-aggregated analysis results eliminating expensive 4-table JOINs';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_topic_performance IS 'OPTIMIZED: Topic-level performance metrics with trend analysis';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_llm_provider_performance IS 'OPTIMIZED: LLM provider performance aggregations';

COMMENT ON FUNCTION beekon_data.get_analysis_results_optimized IS 'OPTIMIZED: Lightning-fast analysis results using materialized views';
COMMENT ON FUNCTION beekon_data.get_topics_optimized IS 'OPTIMIZED: Instant topic metrics from pre-computed aggregations';
COMMENT ON FUNCTION beekon_data.get_llm_providers_optimized IS 'OPTIMIZED: Fast LLM provider performance using materialized data';
COMMENT ON FUNCTION beekon_data.refresh_analysis_performance_views IS 'Refreshes all analysis-related materialized views for data freshness';