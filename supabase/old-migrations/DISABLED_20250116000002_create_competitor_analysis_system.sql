-- Create competitor analysis results table
CREATE TABLE IF NOT EXISTS beekon_data.competitor_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID NOT NULL REFERENCES beekon_data.competitors(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL REFERENCES beekon_data.prompts(id) ON DELETE CASCADE,
    llm_provider VARCHAR(50) NOT NULL,
    is_mentioned BOOLEAN DEFAULT FALSE,
    rank_position INTEGER,
    sentiment_score DECIMAL(3,2),
    confidence_score DECIMAL(3,2),
    response_text TEXT,
    summary_text TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique analysis per competitor/prompt/llm combination
    UNIQUE(competitor_id, prompt_id, llm_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_competitor_id 
    ON beekon_data.competitor_analysis_results(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_prompt_id 
    ON beekon_data.competitor_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_llm_provider 
    ON beekon_data.competitor_analysis_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_analyzed_at 
    ON beekon_data.competitor_analysis_results(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_mentioned 
    ON beekon_data.competitor_analysis_results(is_mentioned, rank_position);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_composite 
    ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at, is_mentioned);

-- Add Row Level Security (RLS)
ALTER TABLE beekon_data.competitor_analysis_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for competitor analysis results
CREATE POLICY "Users can access competitor analysis results for their websites" 
    ON beekon_data.competitor_analysis_results
    FOR ALL
    TO authenticated
    USING (
        competitor_id IN (
            SELECT c.id 
            FROM beekon_data.competitors c
            JOIN beekon_data.websites w ON c.website_id = w.id
            WHERE w.workspace_id IN (
                SELECT workspace_id 
                FROM beekon_data.profiles 
                WHERE user_id = auth.uid()
            )
        )
    );

-- Create function to get competitor share of voice
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_share_of_voice(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name VARCHAR,
    competitor_domain VARCHAR,
    total_analyses INTEGER,
    total_mentions INTEGER,
    share_of_voice DECIMAL,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH website_competitors AS (
        SELECT 
            c.id,
            c.competitor_name,
            c.competitor_domain
        FROM beekon_data.competitors c
        WHERE c.website_id = p_website_id
        AND c.is_active = TRUE
    ),
    competitor_stats AS (
        SELECT 
            wc.id AS competitor_id,
            wc.competitor_name,
            wc.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_mentions,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
            AVG(car.sentiment_score) AS avg_sentiment_score,
            AVG(car.confidence_score) AS avg_confidence_score
        FROM website_competitors wc
        LEFT JOIN beekon_data.competitor_analysis_results car ON wc.id = car.competitor_id
        LEFT JOIN beekon_data.prompts p ON car.prompt_id = p.id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        GROUP BY wc.id, wc.competitor_name, wc.competitor_domain
    ),
    total_mentions_all AS (
        SELECT SUM(total_mentions) AS total_market_mentions
        FROM competitor_stats
    )
    SELECT 
        cs.competitor_id,
        cs.competitor_name,
        cs.competitor_domain,
        cs.total_analyses,
        cs.total_mentions,
        CASE 
            WHEN tma.total_market_mentions > 0 
            THEN (cs.total_mentions::DECIMAL / tma.total_market_mentions::DECIMAL) * 100
            ELSE 0
        END AS share_of_voice,
        cs.avg_rank_position,
        cs.avg_sentiment_score,
        cs.avg_confidence_score
    FROM competitor_stats cs
    CROSS JOIN total_mentions_all tma
    ORDER BY cs.total_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get competitive gap analysis
CREATE OR REPLACE FUNCTION beekon_data.get_competitive_gap_analysis(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    topic_id UUID,
    topic_name VARCHAR,
    your_brand_score DECIMAL,
    competitor_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH website_topics AS (
        SELECT 
            t.id,
            t.topic_name
        FROM beekon_data.topics t
        WHERE t.website_id = p_website_id
        AND t.is_active = TRUE
    ),
    your_brand_performance AS (
        SELECT 
            wt.id AS topic_id,
            wt.topic_name,
            COUNT(lar.id) AS total_analyses,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_mentions,
            CASE 
                WHEN COUNT(lar.id) > 0 
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END AS your_brand_score
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts p ON wt.id = p.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE lar.analyzed_at BETWEEN p_date_start AND p_date_end
        AND lar.website_id = p_website_id
        GROUP BY wt.id, wt.topic_name
    ),
    competitor_performance AS (
        SELECT 
            wt.id AS topic_id,
            c.id AS competitor_id,
            c.competitor_name,
            c.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_mentions,
            CASE 
                WHEN COUNT(car.id) > 0 
                THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                ELSE 0
            END AS competitor_score,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts p ON wt.id = p.topic_id
        LEFT JOIN beekon_data.competitors c ON c.website_id = p_website_id
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id AND p.id = car.prompt_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        AND c.is_active = TRUE
        GROUP BY wt.id, c.id, c.competitor_name, c.competitor_domain
    ),
    aggregated_competitor_data AS (
        SELECT 
            topic_id,
            jsonb_agg(
                jsonb_build_object(
                    'competitor_id', competitor_id,
                    'competitor_name', competitor_name,
                    'competitor_domain', competitor_domain,
                    'score', competitor_score,
                    'avg_rank_position', avg_rank_position,
                    'total_mentions', total_mentions
                )
                ORDER BY competitor_score DESC
            ) AS competitor_data
        FROM competitor_performance
        GROUP BY competitor_performance.topic_id
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

-- Create function to analyze competitor mentions
CREATE OR REPLACE FUNCTION beekon_data.analyze_competitor_mentions(
    p_website_id UUID,
    p_competitor_id UUID,
    p_prompt_id UUID,
    p_llm_provider VARCHAR(50),
    p_response_text TEXT
)
RETURNS TABLE (
    is_mentioned BOOLEAN,
    rank_position INTEGER,
    sentiment_score DECIMAL,
    confidence_score DECIMAL,
    summary_text TEXT
) AS $$
DECLARE
    v_competitor_domain VARCHAR;
    v_competitor_name VARCHAR;
    v_is_mentioned BOOLEAN := FALSE;
    v_rank_position INTEGER := NULL;
    v_sentiment_score DECIMAL := 0.0;
    v_confidence_score DECIMAL := 0.5;
    v_summary_text TEXT := '';
BEGIN
    -- Get competitor details
    SELECT competitor_domain, competitor_name 
    INTO v_competitor_domain, v_competitor_name
    FROM beekon_data.competitors 
    WHERE id = p_competitor_id;
    
    -- Simple mention detection (case-insensitive)
    IF p_response_text ILIKE '%' || v_competitor_domain || '%' 
       OR (v_competitor_name IS NOT NULL AND p_response_text ILIKE '%' || v_competitor_name || '%') THEN
        v_is_mentioned := TRUE;
        v_confidence_score := 0.8;
        
        -- Simple ranking detection (look for numbered lists)
        -- This is a basic implementation - in production, you'd use more sophisticated NLP
        IF p_response_text ~* '1\.\s*' || v_competitor_domain THEN
            v_rank_position := 1;
        ELSIF p_response_text ~* '2\.\s*' || v_competitor_domain THEN
            v_rank_position := 2;
        ELSIF p_response_text ~* '3\.\s*' || v_competitor_domain THEN
            v_rank_position := 3;
        ELSIF p_response_text ~* '4\.\s*' || v_competitor_domain THEN
            v_rank_position := 4;
        ELSIF p_response_text ~* '5\.\s*' || v_competitor_domain THEN
            v_rank_position := 5;
        ELSE
            -- If mentioned but no clear ranking, assign a default position
            v_rank_position := 3;
        END IF;
        
        -- Simple sentiment analysis (look for positive/negative keywords)
        -- This is a basic implementation - in production, you'd use more sophisticated sentiment analysis
        IF p_response_text ~* '(best|excellent|great|top|leading|recommended|superior).*' || v_competitor_domain THEN
            v_sentiment_score := 0.7;
        ELSIF p_response_text ~* '(worst|terrible|bad|poor|avoid|inferior).*' || v_competitor_domain THEN
            v_sentiment_score := -0.7;
        ELSE
            v_sentiment_score := 0.0; -- Neutral
        END IF;
        
        v_summary_text := 'Competitor mentioned in LLM response';
    ELSE
        v_summary_text := 'Competitor not mentioned in LLM response';
    END IF;
    
    RETURN QUERY SELECT 
        v_is_mentioned,
        v_rank_position,
        v_sentiment_score,
        v_confidence_score,
        v_summary_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create materialized view for competitor share of voice
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_competitor_share_of_voice AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    COUNT(car.id) AS total_analyses,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_mentions,
    CASE 
        WHEN COUNT(car.id) > 0 
        THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
        ELSE 0
    END AS share_of_voice,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    MAX(car.analyzed_at) AS last_analyzed_at
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '30 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Create unique index on materialized view for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_share_of_voice_unique 
    ON beekon_data.mv_competitor_share_of_voice (website_id, competitor_id);

-- Create materialized view for competitive gap analysis  
CREATE MATERIALIZED VIEW IF NOT EXISTS beekon_data.mv_competitive_gap_analysis AS
WITH topic_performance AS (
    SELECT 
        t.website_id,
        t.id AS topic_id,
        t.topic_name,
        -- Your brand performance
        COUNT(lar.id) AS your_brand_analyses,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS your_brand_mentions,
        CASE 
            WHEN COUNT(lar.id) > 0 
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END AS your_brand_score,
        -- Competitor performance
        COALESCE(comp_stats.competitor_avg_score, 0) AS competitor_avg_score,
        COALESCE(comp_stats.competitor_count, 0) AS competitor_count
    FROM beekon_data.topics t
    LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id
    LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
    LEFT JOIN (
        SELECT 
            topic_id,
            AVG(competitor_score) AS competitor_avg_score,
            COUNT(DISTINCT competitor_id) AS competitor_count
        FROM (
            SELECT 
                p2.topic_id,
                c.id AS competitor_id,
                CASE 
                    WHEN COUNT(car.id) > 0 
                    THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                    ELSE 0
                END AS competitor_score
            FROM beekon_data.prompts p2
            LEFT JOIN beekon_data.competitor_analysis_results car ON p2.id = car.prompt_id
            LEFT JOIN beekon_data.competitors c ON car.competitor_id = c.id
            WHERE c.is_active = TRUE
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

-- Create unique index on competitive gap analysis materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitive_gap_analysis_unique 
    ON beekon_data.mv_competitive_gap_analysis (website_id, topic_id);

-- Create function to refresh competitor analysis views
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_analysis_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA beekon_data TO authenticated;
GRANT SELECT ON beekon_data.competitor_analysis_results TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.analyze_competitor_mentions TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO authenticated;

-- Add helpful comments
COMMENT ON TABLE beekon_data.competitor_analysis_results IS 'Stores competitor analysis results from LLM responses';
COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'Returns share of voice data for competitors';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'Returns competitive gap analysis by topic';
COMMENT ON FUNCTION beekon_data.analyze_competitor_mentions IS 'Analyzes competitor mentions in LLM responses';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'Materialized view for competitor share of voice metrics';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis IS 'Materialized view for competitive gap analysis';