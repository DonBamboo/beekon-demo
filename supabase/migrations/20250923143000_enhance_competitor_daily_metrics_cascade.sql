-- Comprehensive migration to enhance mv_competitor_daily_metrics with "Your Brand" data
-- Uses CASCADE to drop dependencies, then recreates everything properly

-- Step 1: Drop the existing materialized view with CASCADE to remove all dependencies
DROP MATERIALIZED VIEW IF EXISTS beekon_data.mv_competitor_daily_metrics CASCADE;

-- Step 2: Create enhanced materialized view that includes both competitors AND "Your Brand" data
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics AS
-- Competitor data (existing logic from original view)
SELECT
    w.id AS website_id,
    c.competitor_domain,
    c.id AS competitor_id,
    COALESCE(c.competitor_name, c.competitor_domain) AS competitor_name,
    date(car.analyzed_at) AS analysis_date,
    count(car.id) AS daily_mentions,
    count(CASE WHEN car.is_mentioned THEN 1 END) AS daily_positive_mentions,
    avg(CASE WHEN car.is_mentioned THEN car.rank_position END) AS daily_avg_rank,
    avg(car.sentiment_score) AS daily_avg_sentiment,
    count(DISTINCT car.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT car.llm_provider) AS llm_providers_list,
    false AS is_your_brand -- New field to distinguish competitors
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = true
    AND car.analyzed_at >= (now() - '90 days'::interval)
GROUP BY w.id, c.competitor_domain, c.id, c.competitor_name, date(car.analyzed_at)

UNION ALL

-- "Your Brand" data (new addition)
SELECT
    w.id AS website_id,
    w.domain AS competitor_domain, -- Use website domain
    '00000000-0000-0000-0000-000000000000'::uuid AS competitor_id, -- Special UUID for Your Brand
    'Your Brand' AS competitor_name,
    date(lar.analyzed_at) AS analysis_date,
    count(lar.id) AS daily_mentions,
    count(CASE WHEN lar.is_mentioned THEN 1 END) AS daily_positive_mentions,
    avg(CASE WHEN lar.is_mentioned THEN lar.rank_position END) AS daily_avg_rank,
    avg(lar.sentiment_score) AS daily_avg_sentiment,
    count(DISTINCT lar.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT lar.llm_provider) AS llm_providers_list,
    true AS is_your_brand -- New field to identify Your Brand
FROM beekon_data.websites w
JOIN beekon_data.prompts p ON p.topic_id IN (
    SELECT t.id FROM beekon_data.topics t WHERE t.website_id = w.id AND t.is_active = true
)
JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
WHERE w.is_active = true
    AND lar.analyzed_at >= (now() - '90 days'::interval)
    AND p.is_active = true
GROUP BY w.id, w.domain, date(lar.analyzed_at);

-- Step 3: Create performance indexes
CREATE INDEX idx_mv_competitor_daily_metrics_website_date
ON beekon_data.mv_competitor_daily_metrics(website_id, analysis_date);

CREATE INDEX idx_mv_competitor_daily_metrics_competitor
ON beekon_data.mv_competitor_daily_metrics(competitor_id, is_your_brand);

-- Step 4: Recreate the dependent monitoring views with enhanced functionality

-- Recreate competitor_mv_status view (monitoring view for materialized view status)
CREATE VIEW beekon_data.competitor_mv_status AS
SELECT 'mv_competitor_share_of_voice'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_competitor_share_of_voice) AS row_count,
    (SELECT max(last_analyzed_at) FROM beekon_data.mv_competitor_share_of_voice) AS latest_data
UNION ALL
SELECT 'mv_competitor_performance'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_competitor_performance) AS row_count,
    (SELECT max(last_analysis_date) FROM beekon_data.mv_competitor_performance) AS latest_data
UNION ALL
SELECT 'mv_competitor_daily_metrics'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_competitor_daily_metrics) AS row_count,
    (SELECT max(analysis_date) FROM beekon_data.mv_competitor_daily_metrics) AS latest_data;

-- Recreate materialized_view_health view (health monitoring with freshness indicators)
CREATE VIEW beekon_data.materialized_view_health AS
SELECT 'mv_competitor_share_of_voice'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_competitor_share_of_voice) AS row_count,
    (SELECT max(last_analyzed_at) FROM beekon_data.mv_competitor_share_of_voice) AS latest_data,
    CASE
        WHEN (SELECT max(last_analyzed_at) FROM beekon_data.mv_competitor_share_of_voice) >= (now() - '2 days'::interval)
        THEN 'FRESH'::text
        ELSE 'STALE'::text
    END AS data_freshness
UNION ALL
SELECT 'mv_website_dashboard_summary'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_website_dashboard_summary) AS row_count,
    (SELECT max(last_brand_analysis) FROM beekon_data.mv_website_dashboard_summary) AS latest_data,
    CASE
        WHEN (SELECT max(last_brand_analysis) FROM beekon_data.mv_website_dashboard_summary) >= (now() - '2 days'::interval)
        THEN 'FRESH'::text
        ELSE 'STALE'::text
    END AS data_freshness
UNION ALL
SELECT 'mv_competitive_gap_analysis'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_competitive_gap_analysis) AS row_count,
    NULL::timestamp with time zone AS latest_data,
    'N/A'::text AS data_freshness
UNION ALL
SELECT 'mv_competitor_daily_metrics'::text AS view_name,
    (SELECT count(*) FROM beekon_data.mv_competitor_daily_metrics) AS row_count,
    (SELECT max(analysis_date)::timestamp with time zone FROM beekon_data.mv_competitor_daily_metrics) AS latest_data,
    CASE
        WHEN (SELECT max(analysis_date) FROM beekon_data.mv_competitor_daily_metrics) >= (CURRENT_DATE - 2)
        THEN 'FRESH'::text
        ELSE 'STALE'::text
    END AS data_freshness;

-- Step 5: Update the get_competitor_time_series function to handle the new is_your_brand field
DROP FUNCTION IF EXISTS beekon_data.get_competitor_time_series(uuid, text, integer);

CREATE OR REPLACE FUNCTION beekon_data.get_competitor_time_series(
    p_website_id uuid,
    p_competitor_domain text DEFAULT NULL,
    p_days integer DEFAULT 30
)
RETURNS TABLE (
    analysis_date date,
    competitor_id uuid,
    competitor_domain text,
    competitor_name text,
    daily_mentions bigint,
    daily_positive_mentions bigint,
    daily_avg_rank numeric,
    daily_avg_sentiment numeric,
    daily_llm_providers bigint,
    is_your_brand boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cdm.analysis_date,
        cdm.competitor_id,
        cdm.competitor_domain,
        cdm.competitor_name,
        cdm.daily_mentions,
        cdm.daily_positive_mentions,
        cdm.daily_avg_rank,
        cdm.daily_avg_sentiment,
        cdm.daily_llm_providers,
        cdm.is_your_brand
    FROM beekon_data.mv_competitor_daily_metrics cdm
    WHERE cdm.website_id = p_website_id
        AND (p_competitor_domain IS NULL OR cdm.competitor_domain = p_competitor_domain)
        AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
    ORDER BY cdm.analysis_date DESC, cdm.competitor_name;
END;
$$;

-- Step 6: Add comments explaining the enhanced objects
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics IS 'Enhanced daily metrics for both competitors and "Your Brand" with time series data. Includes is_your_brand flag to distinguish between competitors and the website''s own brand performance.';

COMMENT ON FUNCTION beekon_data.get_competitor_time_series IS 'Enhanced time series function that returns both competitor data AND "Your Brand" data from the unified materialized view. Includes is_your_brand flag to distinguish between competitors and the website''s own brand performance.';

COMMENT ON VIEW beekon_data.competitor_mv_status IS 'Monitoring view for competitor materialized views - tracks row counts and latest data timestamps.';

COMMENT ON VIEW beekon_data.materialized_view_health IS 'Health monitoring view for all materialized views - includes freshness indicators and data quality checks.';