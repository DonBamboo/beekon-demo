-- =================================================================
-- ADD ANALYSIS SESSION REFERENCE TO LLM ANALYSIS RESULTS
-- =================================================================
-- This migration adds analysis_session_id to llm_analysis_results
-- table to link analysis results to their parent analysis sessions.
-- 
-- Created: 2025-07-18
-- =================================================================

BEGIN;

-- Add analysis_session_id column to llm_analysis_results table
ALTER TABLE beekon_data.llm_analysis_results 
ADD COLUMN IF NOT EXISTS analysis_session_id UUID REFERENCES beekon_data.analysis_sessions(id) ON DELETE CASCADE;

-- Add comment for documentation
COMMENT ON COLUMN beekon_data.llm_analysis_results.analysis_session_id IS 'Reference to the analysis session that generated this result';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_llm_results_session_id ON beekon_data.llm_analysis_results(analysis_session_id);

-- Create compound index for common queries
CREATE INDEX IF NOT EXISTS idx_llm_results_session_website ON beekon_data.llm_analysis_results(analysis_session_id, website_id);

-- Add similar column to competitor_analysis_results for consistency
ALTER TABLE beekon_data.competitor_analysis_results 
ADD COLUMN IF NOT EXISTS analysis_session_id UUID REFERENCES beekon_data.analysis_sessions(id) ON DELETE CASCADE;

-- Add comment for competitor analysis results
COMMENT ON COLUMN beekon_data.competitor_analysis_results.analysis_session_id IS 'Reference to the analysis session that generated this competitor result';

-- Create index for competitor analysis results
CREATE INDEX IF NOT EXISTS idx_competitor_results_session_id ON beekon_data.competitor_analysis_results(analysis_session_id);

COMMIT;