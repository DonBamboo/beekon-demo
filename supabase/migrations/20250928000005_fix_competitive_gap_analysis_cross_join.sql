-- =========================================================================
-- FIX COMPETITIVE GAP ANALYSIS CROSS-JOIN ISSUE
-- =========================================================================

-- The issue: get_competitive_gap_analysis was creating cross-join behavior where
-- every topic was paired with every competitor, resulting in 10 competitors
-- being shown when only 2-3 should be displayed (actual competitors with data)

-- The root cause: LEFT JOIN competitors ON website_id creates entries for all
-- competitors across all topics, even when there's no analysis data

-- =========================================================================
-- 1. DROP EXISTING FUNCTION
-- =========================================================================

DROP FUNCTION IF EXISTS beekon_data.get_competitive_gap_analysis(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);

-- =========================================================================
-- 2. CREATE FIXED FUNCTION WITHOUT CROSS-JOIN
-- =========================================================================

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
    -- FIXED: Only include competitors that actually have analysis data for topics
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
        JOIN beekon_data.prompts prompts ON wt.topic_id = prompts.topic_id
        JOIN beekon_data.competitor_analysis_results car ON prompts.id = car.prompt_id
        JOIN beekon_data.competitors competitors ON car.competitor_id = competitors.id
        WHERE competitors.website_id = p_website_id
        AND competitors.is_active = TRUE
        AND car.analyzed_at BETWEEN p_date_start AND p_date_end
        -- FIXED: Only include if there's actual analysis data (no empty cross-joins)
        AND car.id IS NOT NULL
        GROUP BY wt.topic_id, competitors.id, competitors.competitor_name, competitors.competitor_domain
        -- FIXED: Only include competitors that have actual mentions/data
        HAVING COUNT(car.id) > 0
    ),
    -- Aggregate competitor data by topic
    competitor_data_agg AS (
        SELECT
            cp.topic_id,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'competitor_id', cp.competitor_id,
                    'competitor_name', cp.competitor_name,
                    'competitorDomain', cp.competitor_domain,
                    'score', cp.competitor_score,
                    'avgRankPosition', cp.avg_rank_position,
                    'totalMentions', cp.total_competitor_mentions
                )
            ) AS competitor_data
        FROM competitor_performance cp
        GROUP BY cp.topic_id
    )
    -- Final result combining your brand performance with competitor data
    SELECT
        ybp.topic_id,
        ybp.topic_name,
        ybp.your_brand_score,
        COALESCE(cda.competitor_data, '[]'::JSONB) AS competitor_data
    FROM your_brand_performance ybp
    LEFT JOIN competitor_data_agg cda ON ybp.topic_id = cda.topic_id
    ORDER BY ybp.topic_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. GRANT PERMISSIONS
-- =========================================================================

GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO service_role;

-- =========================================================================
-- 4. ADD FUNCTION COMMENT
-- =========================================================================

COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS
'FIXED: Eliminates cross-join behavior that was creating entries for all competitors across all topics. Now only returns competitors that actually have analysis data for each topic, preventing the display of 10+ competitors when only 2-3 should be shown.';