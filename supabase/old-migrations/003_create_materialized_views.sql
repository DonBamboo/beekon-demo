-- =================================================================
-- BEEKON.AI CORRECTED MATERIALIZED VIEWS
-- =================================================================
-- This migration creates materialized views with CORRECTED relationships.
-- The previous implementation had a critical flaw where competitor data
-- was joined by website_id, making the results meaningless.
-- 
-- This fixes the issue by using proper competitor_analysis_results 
-- with correct competitor_id relationships.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. COMPETITOR SHARE OF VOICE VIEW (CORRECTED)
-- =================================================================

-- This view now correctly uses competitor_analysis_results with competitor_id
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    COUNT(car.id) AS total_analyses,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
    CASE 
        WHEN COUNT(car.id) > 0 
        THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
        ELSE 0
    END AS share_of_voice,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    COUNT(DISTINCT car.llm_provider) AS llm_providers_count,
    MAX(car.analyzed_at) AS last_analyzed_at,
    -- Recent performance metrics (last 7 days)
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) AS mentions_last_7_days,
    AVG(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN car.sentiment_score END) AS recent_sentiment_score,
    AVG(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN car.rank_position END) AS recent_avg_rank
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
-- CRITICAL FIX: Use competitor_analysis_results with competitor_id (not website_id join)
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
  AND car.analyzed_at >= NOW() - INTERVAL '30 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- =================================================================
-- 2. COMPETITIVE GAP ANALYSIS VIEW (CORRECTED)
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis AS
WITH topic_performance AS (
    SELECT 
        t.website_id,
        t.id AS topic_id,
        t.topic_name,
        -- Your brand performance (from llm_analysis_results)
        COUNT(lar.id) AS your_brand_analyses,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS your_brand_mentions,
        CASE 
            WHEN COUNT(lar.id) > 0 
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END AS your_brand_score,
        -- Competitor performance (CORRECTED: from competitor_analysis_results)
        COALESCE(comp_stats.competitor_avg_score, 0) AS competitor_avg_score,
        COALESCE(comp_stats.competitor_count, 0) AS competitor_count
    FROM beekon_data.topics t
    LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id
    LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
    LEFT JOIN (
        -- CRITICAL FIX: Proper competitor analysis subquery
        SELECT 
            competitor_scores.topic_id,
            AVG(competitor_scores.competitor_score) AS competitor_avg_score,
            COUNT(DISTINCT competitor_scores.competitor_id) AS competitor_count
        FROM (
            SELECT 
                p2.topic_id AS topic_id,
                c.id AS competitor_id,
                CASE 
                    WHEN COUNT(car.id) > 0 
                    THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                    ELSE 0
                END AS competitor_score
            FROM beekon_data.prompts p2
            -- CORRECTED: Join competitor_analysis_results by prompt_id AND competitor_id
            LEFT JOIN beekon_data.competitor_analysis_results car ON p2.id = car.prompt_id
            LEFT JOIN beekon_data.competitors c ON car.competitor_id = c.id
            -- Ensure we only get competitors for the same website as the topic
            JOIN beekon_data.topics t2 ON p2.topic_id = t2.id
            WHERE c.is_active = TRUE
              AND c.website_id = t2.website_id -- This ensures proper website scoping
              AND car.analyzed_at >= NOW() - INTERVAL '30 days'
            GROUP BY p2.topic_id, c.id
        ) competitor_scores
        GROUP BY competitor_scores.topic_id
    ) comp_stats ON t.id = comp_stats.topic_id
    WHERE t.is_active = TRUE
      AND lar.analyzed_at >= NOW() - INTERVAL '30 days'
    GROUP BY t.website_id, t.id, t.topic_name, comp_stats.competitor_avg_score, comp_stats.competitor_count
)
SELECT 
    website_id,
    topic_id,
    topic_name,
    your_brand_score,
    competitor_avg_score,
    competitor_count,
    (your_brand_score - competitor_avg_score) AS performance_gap,
    CASE 
        WHEN your_brand_score > competitor_avg_score THEN 'advantage'
        WHEN your_brand_score < competitor_avg_score THEN 'disadvantage'
        ELSE 'neutral'
    END AS gap_type
FROM topic_performance;

-- =================================================================
-- 3. COMPETITOR PERFORMANCE VIEW (CORRECTED)
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_competitor_performance AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    c.analysis_status,
    c.last_analyzed_at,
    -- Analysis metrics (CORRECTED: using competitor_analysis_results)
    COUNT(car.id) AS total_mentions,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS positive_mentions,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    COUNT(DISTINCT car.llm_provider) AS llm_providers_count,
    MAX(car.analyzed_at) AS last_analysis_date,
    -- Time-based metrics
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) AS mentions_last_7_days,
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '30 days' AND car.is_mentioned THEN 1 END) AS mentions_last_30_days,
    -- Trend calculation (7-day vs previous 7-day period)
    CASE 
        WHEN COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) > 0
        THEN (
            COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::DECIMAL 
            / COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::DECIMAL - 1
        ) * 100
        ELSE 0
    END AS mention_trend_7d,
    -- Recent performance
    AVG(CASE 
        WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned 
        THEN car.sentiment_score 
    END) AS recent_sentiment_score,
    AVG(CASE 
        WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned 
        THEN car.rank_position 
    END) AS recent_avg_rank
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
-- CRITICAL FIX: Use competitor_analysis_results with proper competitor_id join
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
  AND car.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain, c.analysis_status, c.last_analyzed_at;

-- =================================================================
-- 4. COMPETITOR DAILY METRICS VIEW (CORRECTED)
-- =================================================================

CREATE MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_domain,
    DATE(car.analyzed_at) AS analysis_date,
    COUNT(car.id) AS daily_mentions,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS daily_positive_mentions,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS daily_avg_rank,
    AVG(car.sentiment_score) AS daily_avg_sentiment,
    COUNT(DISTINCT car.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT car.llm_provider ORDER BY car.llm_provider) AS llm_providers_list,
    -- Additional daily metrics
    MIN(car.analyzed_at) AS first_analysis_of_day,
    MAX(car.analyzed_at) AS last_analysis_of_day,
    COUNT(DISTINCT car.prompt_id) AS unique_prompts_analyzed
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id  
-- CRITICAL FIX: Use competitor_analysis_results with proper competitor_id join
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
  AND car.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY w.id, c.id, c.competitor_domain, DATE(car.analyzed_at)
ORDER BY analysis_date DESC;

-- =================================================================
-- 5. WEBSITE DASHBOARD SUMMARY VIEW
-- =================================================================

-- Aggregated view for dashboard performance
CREATE MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary AS
SELECT 
    w.id AS website_id,
    w.domain AS website_domain,
    w.display_name AS website_name,
    -- Competitor metrics
    COUNT(DISTINCT c.id) AS total_competitors,
    COUNT(DISTINCT CASE WHEN c.analysis_status = 'completed' THEN c.id END) AS analyzed_competitors,
    COUNT(DISTINCT CASE WHEN c.analysis_status = 'analyzing' THEN c.id END) AS analyzing_competitors,
    COUNT(DISTINCT CASE WHEN c.analysis_status = 'failed' THEN c.id END) AS failed_competitors,
    -- Analysis metrics (from competitor_analysis_results)
    COUNT(car.id) AS total_competitor_analyses,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_competitor_mentions,
    -- Your brand metrics (from llm_analysis_results)
    COUNT(lar.id) AS total_brand_analyses,
    COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_brand_mentions,
    -- Recent activity (last 7 days)
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS recent_competitor_analyses,
    COUNT(CASE WHEN lar.analyzed_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS recent_brand_analyses,
    -- Last analysis times
    MAX(c.last_analyzed_at) AS last_competitor_analysis,
    MAX(lar.analyzed_at) AS last_brand_analysis,
    -- Overall health scores
    CASE 
        WHEN COUNT(DISTINCT c.id) = 0 THEN 0
        WHEN COUNT(DISTINCT CASE WHEN c.analysis_status = 'completed' THEN c.id END) = COUNT(DISTINCT c.id) THEN 100
        ELSE (COUNT(DISTINCT CASE WHEN c.analysis_status = 'completed' THEN c.id END)::DECIMAL / COUNT(DISTINCT c.id)::DECIMAL) * 100
    END AS competitor_analysis_health_score
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id AND c.is_active = TRUE
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
LEFT JOIN beekon_data.topics t ON w.id = t.website_id AND t.is_active = TRUE
LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id AND p.is_active = TRUE
LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
WHERE w.is_active = TRUE
GROUP BY w.id, w.domain, w.display_name;

-- =================================================================
-- 6. UNIQUE INDEXES FOR CONCURRENT REFRESH
-- =================================================================

-- Create unique indexes required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_competitor_share_of_voice_unique 
  ON beekon_data.mv_competitor_share_of_voice (website_id, competitor_id);

CREATE UNIQUE INDEX idx_mv_competitive_gap_analysis_unique 
  ON beekon_data.mv_competitive_gap_analysis (website_id, topic_id);

CREATE UNIQUE INDEX idx_mv_competitor_performance_unique 
  ON beekon_data.mv_competitor_performance (website_id, competitor_id);

CREATE UNIQUE INDEX idx_mv_competitor_daily_metrics_unique 
  ON beekon_data.mv_competitor_daily_metrics (website_id, competitor_id, analysis_date);

CREATE UNIQUE INDEX idx_mv_website_dashboard_summary_unique 
  ON beekon_data.mv_website_dashboard_summary (website_id);

-- =================================================================
-- 7. PERFORMANCE INDEXES FOR MATERIALIZED VIEWS
-- =================================================================

-- Share of Voice view indexes
CREATE INDEX IF NOT EXISTS idx_mv_sov_website_id ON beekon_data.mv_competitor_share_of_voice(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_sov_share_of_voice ON beekon_data.mv_competitor_share_of_voice(share_of_voice DESC);
CREATE INDEX IF NOT EXISTS idx_mv_sov_last_analyzed ON beekon_data.mv_competitor_share_of_voice(last_analyzed_at DESC);

-- Competitive Gap Analysis view indexes
CREATE INDEX IF NOT EXISTS idx_mv_gap_website_id ON beekon_data.mv_competitive_gap_analysis(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_gap_gap_type ON beekon_data.mv_competitive_gap_analysis(gap_type);
CREATE INDEX IF NOT EXISTS idx_mv_gap_performance_gap ON beekon_data.mv_competitive_gap_analysis(performance_gap DESC);

-- Competitor Performance view indexes
CREATE INDEX IF NOT EXISTS idx_mv_perf_website_id ON beekon_data.mv_competitor_performance(website_id);
CREATE INDEX IF NOT EXISTS idx_mv_perf_total_mentions ON beekon_data.mv_competitor_performance(total_mentions DESC);
CREATE INDEX IF NOT EXISTS idx_mv_perf_avg_sentiment ON beekon_data.mv_competitor_performance(avg_sentiment_score DESC);
CREATE INDEX IF NOT EXISTS idx_mv_perf_analysis_status ON beekon_data.mv_competitor_performance(analysis_status);

-- Daily Metrics view indexes
CREATE INDEX IF NOT EXISTS idx_mv_daily_website_date ON beekon_data.mv_competitor_daily_metrics(website_id, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_mv_daily_competitor_date ON beekon_data.mv_competitor_daily_metrics(competitor_id, analysis_date DESC);

-- Dashboard Summary view indexes
CREATE INDEX IF NOT EXISTS idx_mv_dash_health_score ON beekon_data.mv_website_dashboard_summary(competitor_analysis_health_score DESC);
CREATE INDEX IF NOT EXISTS idx_mv_dash_last_analysis ON beekon_data.mv_website_dashboard_summary(last_competitor_analysis DESC);

-- =================================================================
-- 8. PERMISSIONS GRANTS
-- =================================================================

-- Grant SELECT permissions to authenticated users
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_performance TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_daily_metrics TO authenticated;
GRANT SELECT ON beekon_data.mv_website_dashboard_summary TO authenticated;

-- Grant all permissions to service role
GRANT ALL ON beekon_data.mv_competitor_share_of_voice TO service_role;
GRANT ALL ON beekon_data.mv_competitive_gap_analysis TO service_role;
GRANT ALL ON beekon_data.mv_competitor_performance TO service_role;
GRANT ALL ON beekon_data.mv_competitor_daily_metrics TO service_role;
GRANT ALL ON beekon_data.mv_website_dashboard_summary TO service_role;

-- =================================================================
-- 9. HELPFUL COMMENTS
-- =================================================================

COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'CORRECTED: Share of voice metrics using proper competitor_id joins';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis IS 'CORRECTED: Competitive gap analysis with proper competitor-topic relationships';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_performance IS 'CORRECTED: Competitor performance metrics using competitor_analysis_results table';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics IS 'CORRECTED: Daily competitor metrics with proper relationships';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_website_dashboard_summary IS 'NEW: Website dashboard summary combining brand and competitor metrics';

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    mv_count INTEGER;
    index_count INTEGER;
    unique_index_count INTEGER;
BEGIN
    -- Count materialized views created
    SELECT COUNT(*) INTO mv_count
    FROM pg_matviews 
    WHERE schemaname = 'beekon_data'
      AND matviewname IN ('mv_competitor_share_of_voice', 'mv_competitive_gap_analysis', 'mv_competitor_performance', 'mv_competitor_daily_metrics', 'mv_website_dashboard_summary');
    
    -- Count indexes created
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data'
      AND indexname LIKE 'idx_mv_%';
    
    -- Count unique indexes (required for concurrent refresh)
    SELECT COUNT(*) INTO unique_index_count
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data'
      AND indexname LIKE '%_unique'
      AND indexdef LIKE '%UNIQUE%';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'CORRECTED MATERIALIZED VIEWS CREATED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Materialized views created: %', mv_count;
    RAISE NOTICE 'Performance indexes created: %', index_count;
    RAISE NOTICE 'Unique indexes for concurrent refresh: %', unique_index_count;
    RAISE NOTICE '';
    RAISE NOTICE 'CRITICAL ARCHITECTURAL FIXES:';
    RAISE NOTICE '  ✓ Share of Voice: Now uses competitor_analysis_results.competitor_id';
    RAISE NOTICE '  ✓ Gap Analysis: Proper competitor-topic relationship mapping';
    RAISE NOTICE '  ✓ Performance: Correct competitor metrics (not website-based)';
    RAISE NOTICE '  ✓ Daily Metrics: Time-series data with proper granularity';
    RAISE NOTICE '  ✓ Dashboard Summary: Comprehensive website overview';
    RAISE NOTICE '';
    RAISE NOTICE 'These views now provide MEANINGFUL competitor data instead of';
    RAISE NOTICE 'the previous broken website_id joins that made results useless!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: Create RPC functions that use these corrected views.';
    RAISE NOTICE '=================================================================';
END $$;