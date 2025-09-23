
-- Apply the fix directly to the RPC function
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
    daily_llm_providers bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cdm.analysis_date,
        c.id AS competitor_id,
        cdm.competitor_domain,
        COALESCE(c.competitor_name, cdm.competitor_domain) AS competitor_name,
        cdm.daily_mentions,
        cdm.daily_positive_mentions,
        cdm.daily_avg_rank,
        cdm.daily_avg_sentiment,
        cdm.daily_llm_providers
    FROM beekon_data.mv_competitor_daily_metrics cdm
    INNER JOIN beekon_data.competitors c ON cdm.competitor_domain = c.competitor_domain
        AND cdm.website_id = c.website_id
    WHERE cdm.website_id = p_website_id
        AND (p_competitor_domain IS NULL OR cdm.competitor_domain = p_competitor_domain)
        AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
        AND c.is_active = true
    ORDER BY cdm.analysis_date DESC, cdm.competitor_domain;
END;
$$;

