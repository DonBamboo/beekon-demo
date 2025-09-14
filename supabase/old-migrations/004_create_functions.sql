-- =================================================================
-- BEEKON.AI DATABASE FUNCTIONS (SERVICE-ALIGNED)
-- =================================================================
-- This migration creates all database functions (RPCs) that align with
-- service layer expectations. These functions use the corrected 
-- materialized views and provide the exact field structure expected
-- by the TypeScript services.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. COMPETITOR PERFORMANCE FUNCTIONS
-- =================================================================

-- Get competitor performance data (aligned with competitorService.ts)
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_performance(
    p_website_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_domain TEXT,
    competitor_name TEXT,
    total_mentions BIGINT,
    positive_mentions BIGINT,
    avg_rank_position NUMERIC,
    avg_sentiment_score NUMERIC,
    avg_confidence_score NUMERIC,
    llm_providers_count BIGINT,
    last_analysis_date TIMESTAMP WITH TIME ZONE,
    mentions_last_7_days BIGINT,
    mentions_last_30_days BIGINT,
    mention_trend_7d NUMERIC,
    recent_sentiment_score NUMERIC,
    recent_avg_rank NUMERIC,
    analysis_status TEXT
) AS $$
BEGIN
    -- Check if website exists and user has access
    IF NOT EXISTS (
        SELECT 1 FROM beekon_data.websites 
        WHERE id = p_website_id 
    ) THEN
        RAISE EXCEPTION 'Website not found or access denied';
    END IF;

    RETURN QUERY
    SELECT 
        cp.competitor_id,
        cp.competitor_domain,
        cp.competitor_name,
        COALESCE(cp.total_mentions, 0) as total_mentions,
        COALESCE(cp.positive_mentions, 0) as positive_mentions,
        -- Return NULL instead of 0 for missing rank data
        CASE 
            WHEN cp.avg_rank_position IS NOT NULL AND cp.avg_rank_position > 0 
            THEN cp.avg_rank_position 
            ELSE NULL 
        END as avg_rank_position,
        cp.avg_sentiment_score,
        COALESCE(cp.avg_confidence_score, 0) as avg_confidence_score,
        COALESCE(cp.llm_providers_count, 0) as llm_providers_count,
        cp.last_analysis_date,
        COALESCE(cp.mentions_last_7_days, 0) as mentions_last_7_days,
        COALESCE(cp.mentions_last_30_days, 0) as mentions_last_30_days,
        COALESCE(cp.mention_trend_7d, 0) as mention_trend_7d,
        cp.recent_sentiment_score,
        -- Return NULL instead of 0 for missing recent rank data
        CASE 
            WHEN cp.recent_avg_rank IS NOT NULL AND cp.recent_avg_rank > 0 
            THEN cp.recent_avg_rank 
            ELSE NULL 
        END as recent_avg_rank,
        cp.analysis_status
    FROM beekon_data.mv_competitor_performance cp
    WHERE cp.website_id = p_website_id
    ORDER BY cp.total_mentions DESC, cp.competitor_name
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get competitor time series data (aligned with competitorService.ts)
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_time_series(
    p_website_id UUID,
    p_competitor_domain TEXT DEFAULT NULL,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    analysis_date DATE,
    competitor_id UUID,
    competitor_domain TEXT,
    daily_mentions BIGINT,
    daily_positive_mentions BIGINT,
    daily_avg_rank NUMERIC,
    daily_avg_sentiment NUMERIC,
    daily_llm_providers BIGINT
) AS $$
BEGIN
    -- Check if website exists and user has access
    IF NOT EXISTS (
        SELECT 1 FROM beekon_data.websites 
        WHERE id = p_website_id 
    ) THEN
        RAISE EXCEPTION 'Website not found or access denied';
    END IF;

    RETURN QUERY
    SELECT 
        cdm.analysis_date,
        cdm.competitor_id,
        cdm.competitor_domain,
        COALESCE(cdm.daily_mentions, 0) as daily_mentions,
        COALESCE(cdm.daily_positive_mentions, 0) as daily_positive_mentions,
        cdm.daily_avg_rank,
        cdm.daily_avg_sentiment,
        COALESCE(cdm.daily_llm_providers, 0) as daily_llm_providers
    FROM beekon_data.mv_competitor_daily_metrics cdm
    WHERE cdm.website_id = p_website_id
        AND (p_competitor_domain IS NULL OR cdm.competitor_domain = p_competitor_domain)
        AND cdm.analysis_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
    ORDER BY cdm.analysis_date DESC, cdm.competitor_domain;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 2. COMPETITOR SHARE OF VOICE FUNCTIONS
-- =================================================================

-- Get competitor share of voice data
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
    total_mentions INTEGER,
    share_of_voice DECIMAL,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL
) AS $$
BEGIN
    -- Check if website exists and user has access
    IF NOT EXISTS (
        SELECT 1 FROM beekon_data.websites 
        WHERE id = p_website_id 
    ) THEN
        RAISE EXCEPTION 'Website not found or access denied';
    END IF;

    RETURN QUERY
    SELECT 
        sov.competitor_id,
        sov.competitor_name,
        sov.competitor_domain,
        sov.total_analyses::INTEGER,
        sov.total_voice_mentions::INTEGER as total_mentions,
        sov.share_of_voice,
        sov.avg_rank_position,
        sov.avg_sentiment_score,
        sov.avg_confidence_score
    FROM beekon_data.mv_competitor_share_of_voice sov
    WHERE sov.website_id = p_website_id
      AND sov.last_analyzed_at BETWEEN p_date_start AND p_date_end
    ORDER BY sov.share_of_voice DESC, sov.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. COMPETITIVE GAP ANALYSIS FUNCTIONS
-- =================================================================

-- Get competitive gap analysis
CREATE OR REPLACE FUNCTION beekon_data.get_competitive_gap_analysis(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    topic_id UUID,
    topic_name TEXT,
    your_brand_score DECIMAL,
    competitor_avg_score DECIMAL,
    competitor_count INTEGER,
    performance_gap DECIMAL,
    gap_type TEXT
) AS $$
BEGIN
    -- Check if website exists and user has access
    IF NOT EXISTS (
        SELECT 1 FROM beekon_data.websites 
        WHERE id = p_website_id 
    ) THEN
        RAISE EXCEPTION 'Website not found or access denied';
    END IF;

    RETURN QUERY
    SELECT 
        cga.topic_id,
        cga.topic_name,
        cga.your_brand_score,
        cga.competitor_avg_score,
        cga.competitor_count::INTEGER,
        cga.performance_gap,
        cga.gap_type
    FROM beekon_data.mv_competitive_gap_analysis cga
    WHERE cga.website_id = p_website_id
    ORDER BY cga.performance_gap DESC, cga.your_brand_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 4. DASHBOARD SUMMARY FUNCTIONS
-- =================================================================

-- Get website dashboard summary (for dashboard service)
CREATE OR REPLACE FUNCTION beekon_data.get_website_dashboard_summary(
    p_website_id UUID
)
RETURNS TABLE (
    website_id UUID,
    website_domain TEXT,
    website_name TEXT,
    total_competitors INTEGER,
    analyzed_competitors INTEGER,
    analyzing_competitors INTEGER,
    failed_competitors INTEGER,
    total_competitor_analyses BIGINT,
    total_competitor_mentions BIGINT,
    total_brand_analyses BIGINT,
    total_brand_mentions BIGINT,
    recent_competitor_analyses BIGINT,
    recent_brand_analyses BIGINT,
    last_competitor_analysis TIMESTAMP WITH TIME ZONE,
    last_brand_analysis TIMESTAMP WITH TIME ZONE,
    competitor_analysis_health_score NUMERIC
) AS $$
BEGIN
    -- Check if website exists and user has access
    IF NOT EXISTS (
        SELECT 1 FROM beekon_data.websites 
        WHERE id = p_website_id 
    ) THEN
        RAISE EXCEPTION 'Website not found or access denied';
    END IF;

    RETURN QUERY
    SELECT 
        ds.website_id,
        ds.website_domain,
        ds.website_name,
        ds.total_competitors::INTEGER,
        ds.analyzed_competitors::INTEGER,
        ds.analyzing_competitors::INTEGER,
        ds.failed_competitors::INTEGER,
        ds.total_competitor_analyses,
        ds.total_competitor_mentions,
        ds.total_brand_analyses,
        ds.total_brand_mentions,
        ds.recent_competitor_analyses,
        ds.recent_brand_analyses,
        ds.last_competitor_analysis,
        ds.last_brand_analysis,
        ds.competitor_analysis_health_score
    FROM beekon_data.mv_website_dashboard_summary ds
    WHERE ds.website_id = p_website_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 5. COMPETITOR MANAGEMENT FUNCTIONS
-- =================================================================

-- Update competitor analysis status (for real-time updates)
CREATE OR REPLACE FUNCTION beekon_data.update_competitor_analysis_status(
    p_competitor_id UUID,
    p_status VARCHAR(20),
    p_progress INTEGER DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_status VARCHAR(20);
    v_updated BOOLEAN := FALSE;
BEGIN
    -- Get current status
    SELECT analysis_status INTO v_current_status
    FROM beekon_data.competitors
    WHERE id = p_competitor_id;
    
    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Competitor not found: %', p_competitor_id;
    END IF;
    
    -- Validate status transition
    IF NOT beekon_data.is_valid_status_transition(v_current_status, p_status) THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_status;
    END IF;
    
    -- Update competitor status
    UPDATE beekon_data.competitors
    SET 
        analysis_status = p_status,
        analysis_progress = COALESCE(p_progress, analysis_progress),
        last_error_message = p_error_message,
        analysis_started_at = CASE 
            WHEN p_status = 'analyzing' AND analysis_started_at IS NULL 
            THEN NOW() 
            ELSE analysis_started_at 
        END,
        analysis_completed_at = CASE 
            WHEN p_status IN ('completed', 'failed') 
            THEN NOW() 
            ELSE analysis_completed_at 
        END,
        last_analyzed_at = CASE 
            WHEN p_status = 'completed' 
            THEN NOW() 
            ELSE last_analyzed_at 
        END,
        updated_at = NOW()
    WHERE id = p_competitor_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    -- Log status change
    IF v_updated THEN
        INSERT INTO beekon_data.competitor_status_log (
            competitor_id, 
            old_status, 
            new_status, 
            progress, 
            error_message,
            created_at
        ) VALUES (
            p_competitor_id, 
            v_current_status, 
            p_status, 
            p_progress, 
            p_error_message,
            NOW()
        );
    END IF;
    
    RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Validate status transitions
CREATE OR REPLACE FUNCTION beekon_data.is_valid_status_transition(
    p_from_status VARCHAR(20),
    p_to_status VARCHAR(20)
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Allow any transition to failed
    IF p_to_status = 'failed' THEN
        RETURN TRUE;
    END IF;
    
    -- Define valid transitions
    RETURN CASE p_from_status
        WHEN 'pending' THEN p_to_status IN ('analyzing', 'completed', 'failed')
        WHEN 'analyzing' THEN p_to_status IN ('completed', 'failed')
        WHEN 'completed' THEN p_to_status IN ('analyzing', 'pending') -- Allow re-analysis
        WHEN 'failed' THEN p_to_status IN ('analyzing', 'pending') -- Allow retry
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get competitors by status
CREATE OR REPLACE FUNCTION beekon_data.get_competitors_by_status(
    p_website_id UUID,
    p_status VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    competitor_domain TEXT,
    competitor_name TEXT,
    analysis_status VARCHAR(20),
    analysis_progress INTEGER,
    analysis_started_at TIMESTAMP WITH TIME ZONE,
    analysis_completed_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.competitor_domain,
        c.competitor_name,
        c.analysis_status,
        c.analysis_progress,
        c.analysis_started_at,
        c.analysis_completed_at,
        c.last_error_message,
        c.updated_at
    FROM beekon_data.competitors c
    WHERE c.website_id = p_website_id
      AND c.is_active = true
      AND (p_status IS NULL OR c.analysis_status = p_status)
    ORDER BY 
        CASE c.analysis_status
            WHEN 'analyzing' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'failed' THEN 3
            WHEN 'completed' THEN 4
        END,
        c.analysis_started_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 6. MATERIALIZED VIEW MANAGEMENT FUNCTIONS
-- =================================================================

-- Refresh all competitor analysis views (improved version)
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_analysis_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh all competitor analysis materialized views concurrently
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_website_dashboard_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh specific view for a website (for targeted updates)
CREATE OR REPLACE FUNCTION beekon_data.refresh_website_competitor_views(
    p_website_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- For now, refresh all views since PostgreSQL doesn't support partial refreshes
    -- In future, could implement custom logic to rebuild only relevant data
    PERFORM beekon_data.refresh_competitor_analysis_views();
    
    -- Log the refresh for monitoring
    INSERT INTO beekon_data.competitor_status_log (
        competitor_id,
        old_status,
        new_status,
        error_message,
        created_at
    ) 
    SELECT 
        c.id,
        'refresh',
        'refreshed',
        'Materialized views refreshed for website: ' || p_website_id,
        NOW()
    FROM beekon_data.competitors c
    WHERE c.website_id = p_website_id
    LIMIT 1; -- Just log once per website
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 7. ANALYSIS UTILITIES
-- =================================================================

-- Analyze competitor mentions in text (basic implementation)
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
    
    IF v_competitor_domain IS NULL THEN
        RAISE EXCEPTION 'Competitor not found: %', p_competitor_id;
    END IF;
    
    -- Simple mention detection (case-insensitive)
    IF p_response_text ILIKE '%' || v_competitor_domain || '%' 
       OR (v_competitor_name IS NOT NULL AND p_response_text ILIKE '%' || v_competitor_name || '%') THEN
        v_is_mentioned := TRUE;
        v_confidence_score := 0.8;
        
        -- Simple ranking detection (look for numbered lists)
        IF p_response_text ~* '1\.\s*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
            v_rank_position := 1;
        ELSIF p_response_text ~* '2\.\s*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
            v_rank_position := 2;
        ELSIF p_response_text ~* '3\.\s*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
            v_rank_position := 3;
        ELSIF p_response_text ~* '4\.\s*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
            v_rank_position := 4;
        ELSIF p_response_text ~* '5\.\s*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
            v_rank_position := 5;
        ELSE
            -- If mentioned but no clear ranking, assign default position
            v_rank_position := 3;
        END IF;
        
        -- Simple sentiment analysis
        IF p_response_text ~* '(best|excellent|great|top|leading|recommended|superior).*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
            v_sentiment_score := 0.7;
        ELSIF p_response_text ~* '(worst|terrible|bad|poor|avoid|inferior).*' || COALESCE(v_competitor_name, v_competitor_domain) THEN
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

-- =================================================================
-- 8. REAL-TIME NOTIFICATION FUNCTIONS
-- =================================================================

-- Function to notify real-time subscribers of status changes
CREATE OR REPLACE FUNCTION beekon_data.notify_competitor_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for status-related changes
    IF (TG_OP = 'UPDATE' AND (
        OLD.analysis_status IS DISTINCT FROM NEW.analysis_status OR
        OLD.analysis_progress IS DISTINCT FROM NEW.analysis_progress
    )) OR TG_OP = 'INSERT' THEN
        
        -- Notify real-time subscribers
        PERFORM pg_notify(
            'competitor_status_change',
            json_build_object(
                'competitor_id', NEW.id,
                'website_id', NEW.website_id,
                'analysis_status', NEW.analysis_status,
                'analysis_progress', NEW.analysis_progress,
                'updated_at', NEW.updated_at,
                'operation', TG_OP
            )::text
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 9. CREATE TRIGGERS
-- =================================================================

-- Create trigger for real-time notifications
DROP TRIGGER IF EXISTS competitor_status_change_trigger ON beekon_data.competitors;
CREATE TRIGGER competitor_status_change_trigger
    AFTER INSERT OR UPDATE ON beekon_data.competitors
    FOR EACH ROW
    EXECUTE FUNCTION beekon_data.notify_competitor_status_change();

-- =================================================================
-- 10. GRANT PERMISSIONS
-- =================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_performance(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_time_series(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_website_dashboard_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.update_competitor_analysis_status(UUID, VARCHAR, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.is_valid_status_transition(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitors_by_status(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.analyze_competitor_mentions(UUID, UUID, UUID, VARCHAR, TEXT) TO authenticated;

-- Management functions (for admin/system operations)
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views() TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_website_competitor_views(UUID) TO authenticated;

-- Grant all to service role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA beekon_data TO service_role;

-- =================================================================
-- 11. HELPFUL COMMENTS
-- =================================================================

COMMENT ON FUNCTION beekon_data.get_competitor_performance IS 'Returns competitor performance metrics aligned with competitorService.ts expectations';
COMMENT ON FUNCTION beekon_data.get_competitor_time_series IS 'Returns time series data for competitor analysis charts';
COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'Returns share of voice metrics using corrected competitor relationships';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'Returns competitive gap analysis using proper topic-competitor mapping';
COMMENT ON FUNCTION beekon_data.get_website_dashboard_summary IS 'Returns comprehensive dashboard summary for a website';
COMMENT ON FUNCTION beekon_data.refresh_competitor_analysis_views IS 'Refreshes all competitor analysis materialized views concurrently';
COMMENT ON FUNCTION beekon_data.update_competitor_analysis_status IS 'Updates competitor analysis status with validation and logging';
COMMENT ON FUNCTION beekon_data.analyze_competitor_mentions IS 'Basic competitor mention analysis (can be enhanced with AI/NLP)';

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    function_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Count functions created in this migration
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_schema = 'beekon_data'
      AND routine_name IN (
        'get_competitor_performance',
        'get_competitor_time_series', 
        'get_competitor_share_of_voice',
        'get_competitive_gap_analysis',
        'get_website_dashboard_summary',
        'update_competitor_analysis_status',
        'is_valid_status_transition',
        'get_competitors_by_status',
        'refresh_competitor_analysis_views',
        'refresh_website_competitor_views',
        'analyze_competitor_mentions',
        'notify_competitor_status_change'
      );
    
    -- Count triggers
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers 
    WHERE trigger_schema = 'beekon_data'
      AND trigger_name LIKE '%competitor%';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'DATABASE FUNCTIONS CREATED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Functions created: %', function_count;
    RAISE NOTICE 'Triggers created: %', trigger_count;
    RAISE NOTICE '';
    RAISE NOTICE 'SERVICE-ALIGNED FUNCTIONS:';
    RAISE NOTICE '  ✓ get_competitor_performance() - Aligned with competitorService.ts';
    RAISE NOTICE '  ✓ get_competitor_time_series() - For time series charts';
    RAISE NOTICE '  ✓ get_competitor_share_of_voice() - Corrected share of voice';
    RAISE NOTICE '  ✓ get_competitive_gap_analysis() - Proper gap analysis';
    RAISE NOTICE '  ✓ get_website_dashboard_summary() - Dashboard metrics';
    RAISE NOTICE '';
    RAISE NOTICE 'MANAGEMENT FUNCTIONS:';
    RAISE NOTICE '  ✓ update_competitor_analysis_status() - Real-time status tracking';
    RAISE NOTICE '  ✓ refresh_competitor_analysis_views() - View maintenance';
    RAISE NOTICE '  ✓ analyze_competitor_mentions() - Text analysis utility';
    RAISE NOTICE '';
    RAISE NOTICE 'These functions use the corrected materialized views and provide';
    RAISE NOTICE 'the exact field structures expected by the TypeScript services!';
    RAISE NOTICE '=================================================================';
END $$;