-- =================================================================
-- Competitor Status Tracking Migration
-- =================================================================
-- This migration adds real-time status tracking for competitor analysis
-- to enable real-time UI updates during the analysis process.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. ADD COMPETITOR STATUS FIELDS
-- =================================================================

-- Add analysis status tracking columns to competitors table
ALTER TABLE beekon_data.competitors 
ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(20) DEFAULT 'pending' 
  CHECK (analysis_status IN ('pending', 'analyzing', 'completed', 'failed'));

ALTER TABLE beekon_data.competitors 
ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE beekon_data.competitors 
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE beekon_data.competitors 
ADD COLUMN IF NOT EXISTS analysis_progress INTEGER DEFAULT 0 
  CHECK (analysis_progress >= 0 AND analysis_progress <= 100);

ALTER TABLE beekon_data.competitors 
ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- =================================================================
-- 2. CREATE PERFORMANCE INDEXES
-- =================================================================

-- Index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_competitors_analysis_status 
ON beekon_data.competitors(analysis_status, analysis_started_at);

-- Index for real-time queries by website and status
CREATE INDEX IF NOT EXISTS idx_competitors_website_status 
ON beekon_data.competitors(website_id, analysis_status, updated_at);

-- Composite index for active status monitoring
CREATE INDEX IF NOT EXISTS idx_competitors_active_status_monitoring 
ON beekon_data.competitors(website_id, is_active, analysis_status)
WHERE is_active = true AND analysis_status IN ('pending', 'analyzing');

-- =================================================================
-- 3. UPDATE EXISTING DATA
-- =================================================================

-- Set initial status for existing competitors based on their current state
UPDATE beekon_data.competitors 
SET analysis_status = CASE
    WHEN last_analyzed_at IS NOT NULL THEN 'completed'
    ELSE 'pending'
END
WHERE analysis_status IS NULL OR analysis_status = 'pending';

-- Set completed timestamp for already analyzed competitors
UPDATE beekon_data.competitors 
SET analysis_completed_at = last_analyzed_at
WHERE analysis_status = 'completed' 
  AND analysis_completed_at IS NULL 
  AND last_analyzed_at IS NOT NULL;

-- =================================================================
-- 4. CREATE STATUS MANAGEMENT FUNCTIONS
-- =================================================================

-- Function to update competitor analysis status
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
        updated_at = NOW()
    WHERE id = p_competitor_id;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    -- Log status change for monitoring
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

-- Function to validate status transitions
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

-- Function to get competitors by status for a workspace
CREATE OR REPLACE FUNCTION beekon_data.get_competitors_by_status(
    p_website_id UUID,
    p_status VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    competitor_domain VARCHAR,
    competitor_name VARCHAR,
    analysis_status VARCHAR,
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
-- 5. CREATE STATUS LOGGING TABLE
-- =================================================================

-- Table to track status change history for monitoring and debugging
CREATE TABLE IF NOT EXISTS beekon_data.competitor_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID NOT NULL REFERENCES beekon_data.competitors(id) ON DELETE CASCADE,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    progress INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient log queries
CREATE INDEX IF NOT EXISTS idx_competitor_status_log_competitor 
ON beekon_data.competitor_status_log(competitor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_status_log_status 
ON beekon_data.competitor_status_log(new_status, created_at DESC);

-- =================================================================
-- 6. UPDATE ROW LEVEL SECURITY
-- =================================================================

-- Enable RLS on status log table
ALTER TABLE beekon_data.competitor_status_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for competitor status log
CREATE POLICY "Users can access competitor status logs for their websites" 
    ON beekon_data.competitor_status_log
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

-- =================================================================
-- 7. CREATE REAL-TIME SUBSCRIPTION TRIGGERS
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

-- Create trigger for real-time notifications
DROP TRIGGER IF EXISTS competitor_status_change_trigger ON beekon_data.competitors;
CREATE TRIGGER competitor_status_change_trigger
    AFTER INSERT OR UPDATE ON beekon_data.competitors
    FOR EACH ROW
    EXECUTE FUNCTION beekon_data.notify_competitor_status_change();

-- =================================================================
-- 8. GRANT PERMISSIONS
-- =================================================================

-- Grant permissions on new functions
GRANT EXECUTE ON FUNCTION beekon_data.update_competitor_analysis_status TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.is_valid_status_transition TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitors_by_status TO authenticated;

-- Grant permissions on status log table
GRANT SELECT ON beekon_data.competitor_status_log TO authenticated;

-- Grant service role permissions for status management
GRANT EXECUTE ON FUNCTION beekon_data.update_competitor_analysis_status TO service_role;
GRANT ALL ON beekon_data.competitor_status_log TO service_role;

-- =================================================================
-- 9. ADD HELPFUL COMMENTS
-- =================================================================

COMMENT ON COLUMN beekon_data.competitors.analysis_status IS 'Current status of competitor analysis: pending, analyzing, completed, failed';
COMMENT ON COLUMN beekon_data.competitors.analysis_progress IS 'Progress percentage (0-100) for ongoing analysis';
COMMENT ON COLUMN beekon_data.competitors.analysis_started_at IS 'Timestamp when analysis was started';
COMMENT ON COLUMN beekon_data.competitors.analysis_completed_at IS 'Timestamp when analysis was completed or failed';
COMMENT ON COLUMN beekon_data.competitors.last_error_message IS 'Last error message if analysis failed';

COMMENT ON TABLE beekon_data.competitor_status_log IS 'Audit log for competitor analysis status changes';
COMMENT ON FUNCTION beekon_data.update_competitor_analysis_status IS 'Updates competitor analysis status with validation and logging';
COMMENT ON FUNCTION beekon_data.get_competitors_by_status IS 'Returns competitors filtered by analysis status';

COMMIT;

-- =================================================================
-- 10. VERIFICATION
-- =================================================================

DO $$
DECLARE
    status_columns INTEGER;
    status_indexes INTEGER;
    status_functions INTEGER;
BEGIN
    -- Count new status columns
    SELECT COUNT(*) INTO status_columns
    FROM information_schema.columns
    WHERE table_schema = 'beekon_data'
      AND table_name = 'competitors'
      AND column_name IN ('analysis_status', 'analysis_progress', 'analysis_started_at', 'analysis_completed_at');
    
    -- Count new status indexes
    SELECT COUNT(*) INTO status_indexes
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data' 
      AND tablename = 'competitors'
      AND indexname LIKE '%status%';
    
    -- Count new status functions
    SELECT COUNT(*) INTO status_functions
    FROM information_schema.routines 
    WHERE routine_schema = 'beekon_data'
      AND routine_name LIKE '%competitor%status%';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Competitor Status Tracking Migration Completed Successfully';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Status columns added: %', status_columns;
    RAISE NOTICE 'Status indexes created: %', status_indexes;
    RAISE NOTICE 'Status functions created: %', status_functions;
    RAISE NOTICE '';
    RAISE NOTICE 'Status Values Available:';
    RAISE NOTICE '  • pending: Competitor added, waiting to start analysis';
    RAISE NOTICE '  • analyzing: Analysis in progress';
    RAISE NOTICE '  • completed: Analysis finished successfully';  
    RAISE NOTICE '  • failed: Analysis failed with errors';
    RAISE NOTICE '';
    RAISE NOTICE 'New Functions Available:';
    RAISE NOTICE '  → update_competitor_analysis_status(id, status, progress, error)';
    RAISE NOTICE '  → get_competitors_by_status(website_id, status)';
    RAISE NOTICE '  → is_valid_status_transition(from_status, to_status)';
    RAISE NOTICE '';
    RAISE NOTICE 'Real-time Features:';
    RAISE NOTICE '  ✓ PostgreSQL notifications for status changes';
    RAISE NOTICE '  ✓ Audit logging for all status transitions';
    RAISE NOTICE '  ✓ Row Level Security for competitor status data';
    RAISE NOTICE '  ✓ Performance indexes for efficient status queries';
    RAISE NOTICE '=================================================================';
END $$;