-- Drop existing function if it exists to avoid conflicts
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice(uuid, timestamp with time zone, timestamp with time zone);

-- Create function to get competitor share of voice
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_share_of_voice(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name TEXT,
    competitor_domain TEXT,
    total_analyses INTEGER,
    total_voice_mentions INTEGER,
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
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
            AVG(car.sentiment_score) AS avg_sentiment_score,
            AVG(car.confidence_score) AS avg_confidence_score
        FROM website_competitors wc
        LEFT JOIN beekon_data.competitor_analysis_results car ON wc.id = car.competitor_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        GROUP BY wc.id, wc.competitor_name, wc.competitor_domain
    ),
    total_mentions_all AS (
        SELECT SUM(cs.total_voice_mentions) AS total_market_mentions
        FROM competitor_stats cs
    )
    SELECT 
        cs.competitor_id,
        cs.competitor_name,
        cs.competitor_domain,
        cs.total_analyses,
        cs.total_voice_mentions,
        CASE 
            WHEN tma.total_market_mentions > 0 
            THEN (cs.total_voice_mentions::DECIMAL / tma.total_market_mentions::DECIMAL) * 100
            ELSE 0
        END AS share_of_voice,
        cs.avg_rank_position,
        cs.avg_sentiment_score,
        cs.avg_confidence_score
    FROM competitor_stats cs
    CROSS JOIN total_mentions_all tma
    ORDER BY cs.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing function if it exists to avoid conflicts
DROP FUNCTION IF EXISTS beekon_data.get_competitive_gap_analysis(uuid, timestamp with time zone, timestamp with time zone);

-- Create function to get competitive gap analysis
CREATE OR REPLACE FUNCTION beekon_data.get_competitive_gap_analysis(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
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
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_brand_mentions,
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
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_competitor_mentions,
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
                    'total_mentions', total_competitor_mentions
                )
                ORDER BY competitor_score DESC
            ) AS competitor_data
        FROM competitor_performance
        GROUP BY topic_id
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

-- Drop existing function if it exists to avoid conflicts
DROP FUNCTION IF EXISTS beekon_data.analyze_competitor_mentions(uuid, uuid, uuid, varchar, text);

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
    v_competitor_domain TEXT;
    v_competitor_name TEXT;
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

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.analyze_competitor_mentions TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'Returns share of voice data for competitors';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'Returns competitive gap analysis by topic';
COMMENT ON FUNCTION beekon_data.analyze_competitor_mentions IS 'Analyzes competitor mentions in LLM responses';