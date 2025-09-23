-- Create enhanced time series function that includes both competitors AND "Your Brand" data
-- This provides complete Share of Voice Over Time data for the stacked area chart

CREATE OR REPLACE FUNCTION beekon_data.get_complete_time_series(
    p_website_id uuid,
    p_competitor_domain text DEFAULT NULL,
    p_days integer DEFAULT 30
)
RETURNS TABLE (
    analysis_date date,
    competitor_id text, -- Changed to text to allow "your-brand" special ID
    competitor_domain text,
    competitor_name text,
    daily_mentions bigint,
    daily_positive_mentions bigint,
    daily_avg_rank numeric,
    daily_avg_sentiment numeric,
    daily_llm_providers bigint,
    is_your_brand boolean -- Flag to identify "Your Brand" vs competitors
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    -- First, get competitor data (existing logic)
    SELECT
        cdm.analysis_date,
        c.id::text AS competitor_id,
        cdm.competitor_domain,
        COALESCE(c.competitor_name, cdm.competitor_domain) AS competitor_name,
        cdm.daily_mentions,
        cdm.daily_positive_mentions,
        cdm.daily_avg_rank,
        cdm.daily_avg_sentiment,
        cdm.daily_llm_providers,
        false AS is_your_brand
    FROM beekon_data.mv_competitor_daily_metrics cdm
    INNER JOIN beekon_data.competitors c ON cdm.competitor_domain = c.competitor_domain
        AND cdm.website_id = c.website_id
    WHERE cdm.website_id = p_website_id
        AND (p_competitor_domain IS NULL OR cdm.competitor_domain = p_competitor_domain)
        AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
        AND c.is_active = true

    UNION ALL

    -- Second, get "Your Brand" data from website's own analysis results
    SELECT DISTINCT
        result_date.analysis_date,
        'your-brand' AS competitor_id,
        w.website_domain AS competitor_domain,
        'Your Brand' AS competitor_name,
        COALESCE(daily_stats.daily_mentions, 0::bigint) AS daily_mentions,
        COALESCE(daily_stats.daily_positive_mentions, 0::bigint) AS daily_positive_mentions,
        COALESCE(daily_stats.daily_avg_rank, 0::numeric) AS daily_avg_rank,
        COALESCE(daily_stats.daily_avg_sentiment, 0::numeric) AS daily_avg_sentiment,
        COALESCE(daily_stats.daily_llm_providers, 0::bigint) AS daily_llm_providers,
        true AS is_your_brand
    FROM (
        -- Generate date series for the requested period
        SELECT generate_series(
            CURRENT_DATE - INTERVAL '1 day' * p_days,
            CURRENT_DATE,
            INTERVAL '1 day'
        )::date AS analysis_date
    ) result_date
    CROSS JOIN beekon_data.websites w
    LEFT JOIN (
        -- Calculate daily stats for "Your Brand" from analysis results
        SELECT
            ar.created_at::date AS analysis_date,
            COUNT(llmr.id) AS daily_mentions,
            COUNT(CASE WHEN llmr.is_mentioned = true THEN 1 END) AS daily_positive_mentions,
            AVG(CASE WHEN llmr.rank_position IS NOT NULL AND llmr.rank_position > 0 THEN llmr.rank_position END) AS daily_avg_rank,
            AVG(CASE WHEN llmr.sentiment_score IS NOT NULL THEN llmr.sentiment_score END) AS daily_avg_sentiment,
            COUNT(DISTINCT llmr.llm_provider) AS daily_llm_providers
        FROM beekon_data.analysis_results ar
        INNER JOIN beekon_data.llm_results llmr ON ar.id = llmr.analysis_result_id
        WHERE ar.website_id = p_website_id
            AND ar.created_at >= CURRENT_DATE - INTERVAL '1 day' * p_days
        GROUP BY ar.created_at::date
    ) daily_stats ON result_date.analysis_date = daily_stats.analysis_date
    WHERE w.id = p_website_id

    ORDER BY analysis_date DESC, competitor_name;
END;
$$;

-- Add comment explaining the enhanced function
COMMENT ON FUNCTION beekon_data.get_complete_time_series IS 'Enhanced time series function that returns both competitor data AND "Your Brand" data for complete Share of Voice Over Time charts. Includes is_your_brand flag to distinguish between competitors and the website''s own brand.';