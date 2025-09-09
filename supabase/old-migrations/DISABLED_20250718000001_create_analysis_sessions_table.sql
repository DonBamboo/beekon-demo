-- =================================================================
-- CREATE ANALYSIS SESSIONS TABLE
-- =================================================================
-- This migration creates the analysis_sessions table to properly
-- track analysis metadata including user-defined analysis names,
-- configurations, and session status.
-- 
-- Created: 2025-07-18
-- =================================================================

BEGIN;

-- Create analysis_sessions table
CREATE TABLE IF NOT EXISTS beekon_data.analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_name TEXT NOT NULL,
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  configuration JSONB NOT NULL DEFAULT '{}',
  progress_data JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add comments for documentation
COMMENT ON TABLE beekon_data.analysis_sessions IS 'Stores analysis session metadata including user-defined names and configurations';
COMMENT ON COLUMN beekon_data.analysis_sessions.analysis_name IS 'User-defined name for the analysis session';
COMMENT ON COLUMN beekon_data.analysis_sessions.configuration IS 'Analysis configuration including topics, LLM models, prompts, etc.';
COMMENT ON COLUMN beekon_data.analysis_sessions.progress_data IS 'Real-time progress tracking data';
COMMENT ON COLUMN beekon_data.analysis_sessions.status IS 'Current status of the analysis session';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_website_id ON beekon_data.analysis_sessions(website_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_user_id ON beekon_data.analysis_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_workspace_id ON beekon_data.analysis_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_status ON beekon_data.analysis_sessions(status);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_created_at ON beekon_data.analysis_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_compound ON beekon_data.analysis_sessions(website_id, status, created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_analysis_sessions_updated_at 
  BEFORE UPDATE ON beekon_data.analysis_sessions 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add RLS policies
ALTER TABLE beekon_data.analysis_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own analysis sessions
CREATE POLICY "Users can view their own analysis sessions" ON beekon_data.analysis_sessions
  FOR SELECT USING (
    user_id = auth.uid() 
    OR workspace_id IN (
      SELECT w.id FROM beekon_data.workspaces w
      WHERE w.owner_id = auth.uid()
    )
  );

-- Policy: Users can create analysis sessions for their websites
CREATE POLICY "Users can create analysis sessions for their websites" ON beekon_data.analysis_sessions
  FOR INSERT WITH CHECK (
    user_id = auth.uid() 
    AND website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      WHERE ws.owner_id = auth.uid()
    )
  );

-- Policy: Users can update their own analysis sessions
CREATE POLICY "Users can update their own analysis sessions" ON beekon_data.analysis_sessions
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR workspace_id IN (
      SELECT w.id FROM beekon_data.workspaces w
      WHERE w.owner_id = auth.uid()
    )
  );

-- Policy: Users can delete their own analysis sessions
CREATE POLICY "Users can delete their own analysis sessions" ON beekon_data.analysis_sessions
  FOR DELETE USING (
    user_id = auth.uid() 
    OR workspace_id IN (
      SELECT w.id FROM beekon_data.workspaces w
      WHERE w.owner_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.analysis_sessions TO authenticated;
GRANT SELECT ON beekon_data.analysis_sessions TO service_role;

COMMIT;