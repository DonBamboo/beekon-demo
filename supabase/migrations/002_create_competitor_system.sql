-- =================================================================
-- BEEKON.AI COMPETITOR ANALYSIS SYSTEM
-- =================================================================
-- This migration creates the competitor analysis system with proper
-- relationships and data flow. This fixes the architectural issues
-- where competitor data was incorrectly joined by website_id instead
-- of using proper competitor-specific relationships.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. COMPETITORS TABLE 
-- =================================================================

CREATE TABLE IF NOT EXISTS beekon_data.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  competitor_domain TEXT NOT NULL,
  competitor_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  analysis_frequency TEXT DEFAULT 'weekly',
  analysis_status VARCHAR(20) DEFAULT 'pending',
  analysis_progress INTEGER DEFAULT 0,
  analysis_started_at TIMESTAMP WITH TIME ZONE,
  analysis_completed_at TIMESTAMP WITH TIME ZONE,
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  last_error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_analysis_frequency CHECK (analysis_frequency IN ('daily', 'weekly', 'monthly', 'manual')),
  CONSTRAINT valid_analysis_status CHECK (analysis_status IN ('pending', 'analyzing', 'completed', 'failed')),
  CONSTRAINT valid_analysis_progress CHECK (analysis_progress >= 0 AND analysis_progress <= 100),
  CONSTRAINT valid_competitor_domain CHECK (
    competitor_domain ~ '^https?:\\/\\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(\\/.*)?$' OR
    competitor_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$'
  ),
  UNIQUE(website_id, competitor_domain)
);

-- =================================================================
-- 2. COMPETITOR ANALYSIS RESULTS TABLE
-- =================================================================

-- This is the correct table for competitor-specific analysis results
-- (fixes the issue where materialized views were incorrectly using llm_analysis_results)
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
  
  -- Constraints
  CONSTRAINT valid_llm_provider CHECK (llm_provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'gpt-4', 'claude-3', 'openai', 'anthropic')),
  CONSTRAINT valid_rank_position CHECK (rank_position IS NULL OR rank_position > 0),
  CONSTRAINT valid_sentiment_score CHECK (sentiment_score IS NULL OR sentiment_score BETWEEN -1.0 AND 1.0),
  CONSTRAINT valid_confidence_score CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0.0 AND 1.0),
  
  -- Ensure unique analysis per competitor/prompt/llm combination
  UNIQUE(competitor_id, prompt_id, llm_provider)
);

-- =================================================================
-- 3. ANALYSIS SESSIONS TABLE
-- =================================================================

-- Track analysis sessions for better organization and debugging
CREATE TABLE IF NOT EXISTS beekon_data.analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  session_type VARCHAR(50) NOT NULL DEFAULT 'competitor_analysis',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_competitors INTEGER DEFAULT 0,
  completed_competitors INTEGER DEFAULT 0,
  failed_competitors INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_session_type CHECK (session_type IN ('competitor_analysis', 'brand_analysis', 'full_analysis')),
  CONSTRAINT valid_session_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT valid_competitor_counts CHECK (
    completed_competitors >= 0 AND 
    failed_competitors >= 0 AND 
    total_competitors >= (completed_competitors + failed_competitors)
  )
);

-- =================================================================
-- 4. COMPETITOR STATUS AUDIT LOG
-- =================================================================

-- Table to track status change history for monitoring and debugging
CREATE TABLE IF NOT EXISTS beekon_data.competitor_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID NOT NULL REFERENCES beekon_data.competitors(id) ON DELETE CASCADE,
  analysis_session_id UUID REFERENCES beekon_data.analysis_sessions(id) ON DELETE SET NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  progress INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =================================================================
-- 5. WEBSITE SETTINGS TABLE
-- =================================================================

-- Settings specific to each website's analysis configuration
CREATE TABLE IF NOT EXISTS beekon_data.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL UNIQUE,
  settings JSONB DEFAULT '{
    "analysis_frequency": "weekly",
    "auto_analysis": true,
    "notifications": true,
    "competitor_tracking": true,
    "weekly_reports": true,
    "show_in_dashboard": true,
    "priority_level": "medium",
    "api_access": false,
    "data_retention_days": 90,
    "export_enabled": true,
    "country_code": "US",
    "language_code": "en"
  }' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =================================================================
-- 6. EXPORT HISTORY TABLE
-- =================================================================

-- Track export operations for auditing and usage monitoring
CREATE TABLE IF NOT EXISTS beekon_data.export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  export_type VARCHAR(50) NOT NULL,
  format VARCHAR(20) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  filters JSONB,
  date_range JSONB,
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_export_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT valid_export_format CHECK (format IN ('pdf', 'csv', 'json', 'excel', 'word')),
  CONSTRAINT valid_export_type CHECK (export_type IN ('analysis', 'dashboard', 'website', 'competitor', 'configuration', 'filtered_data'))
);

-- =================================================================
-- 7. PERFORMANCE INDEXES
-- =================================================================

-- Competitors table indexes
CREATE INDEX IF NOT EXISTS idx_competitors_website_id ON beekon_data.competitors(website_id);
CREATE INDEX IF NOT EXISTS idx_competitors_domain_hash ON beekon_data.competitors USING hash(competitor_domain);
CREATE INDEX IF NOT EXISTS idx_competitors_active ON beekon_data.competitors(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_competitors_status ON beekon_data.competitors(analysis_status, analysis_started_at);
CREATE INDEX IF NOT EXISTS idx_competitors_website_status ON beekon_data.competitors(website_id, analysis_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_competitors_active_status_monitoring ON beekon_data.competitors(website_id, is_active, analysis_status)
  WHERE is_active = TRUE AND analysis_status IN ('pending', 'analyzing');

-- Competitor Analysis Results indexes (Critical for performance)
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_competitor_id ON beekon_data.competitor_analysis_results(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_prompt_id ON beekon_data.competitor_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_llm_provider ON beekon_data.competitor_analysis_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_analyzed_at ON beekon_data.competitor_analysis_results(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_mentioned ON beekon_data.competitor_analysis_results(is_mentioned, rank_position) WHERE is_mentioned = TRUE;
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_composite ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at DESC, is_mentioned);

-- Full-text search indexes for competitor results
CREATE INDEX IF NOT EXISTS idx_competitor_results_response_text_search ON beekon_data.competitor_analysis_results 
USING gin(to_tsvector('english', response_text));
CREATE INDEX IF NOT EXISTS idx_competitor_results_summary_text_search ON beekon_data.competitor_analysis_results 
USING gin(to_tsvector('english', summary_text));

-- Analysis Sessions indexes
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_website_id ON beekon_data.analysis_sessions(website_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_status ON beekon_data.analysis_sessions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_website_status ON beekon_data.analysis_sessions(website_id, status, started_at DESC);

-- Competitor Status Log indexes
CREATE INDEX IF NOT EXISTS idx_competitor_status_log_competitor ON beekon_data.competitor_status_log(competitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_status_log_session ON beekon_data.competitor_status_log(analysis_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_status_log_status ON beekon_data.competitor_status_log(new_status, created_at DESC);

-- Website Settings indexes
CREATE INDEX IF NOT EXISTS idx_website_settings_website_id ON beekon_data.website_settings(website_id);
CREATE INDEX IF NOT EXISTS idx_website_settings_gin ON beekon_data.website_settings USING gin(settings);

-- Export History indexes
CREATE INDEX IF NOT EXISTS idx_export_history_user_id ON beekon_data.export_history(user_id);
CREATE INDEX IF NOT EXISTS idx_export_history_created_at ON beekon_data.export_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_status ON beekon_data.export_history(status);
CREATE INDEX IF NOT EXISTS idx_export_history_export_type ON beekon_data.export_history(export_type);
CREATE INDEX IF NOT EXISTS idx_export_history_user_created ON beekon_data.export_history(user_id, created_at DESC);

-- =================================================================
-- 8. UPDATED_AT TRIGGERS
-- =================================================================

CREATE TRIGGER update_competitors_updated_at 
  BEFORE UPDATE ON beekon_data.competitors 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_website_settings_updated_at 
  BEFORE UPDATE ON beekon_data.website_settings 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_export_history_updated_at 
  BEFORE UPDATE ON beekon_data.export_history 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =================================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- =================================================================

-- Enable RLS on all new tables
ALTER TABLE beekon_data.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitor_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitor_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.export_history ENABLE ROW LEVEL SECURITY;

-- Competitors RLS policies
CREATE POLICY "Users can access competitors for their websites" ON beekon_data.competitors
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitor Analysis Results RLS policies
CREATE POLICY "Users can access competitor analysis results for their websites" ON beekon_data.competitor_analysis_results
  FOR ALL USING (
    competitor_id IN (
      SELECT c.id FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON c.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Analysis Sessions RLS policies
CREATE POLICY "Users can access analysis sessions for their websites" ON beekon_data.analysis_sessions
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitor Status Log RLS policies
CREATE POLICY "Users can access competitor status logs for their websites" ON beekon_data.competitor_status_log
  FOR ALL USING (
    competitor_id IN (
      SELECT c.id FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON c.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Website Settings RLS policies
CREATE POLICY "Users can access website settings for their websites" ON beekon_data.website_settings
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Export History RLS policies
CREATE POLICY "Users can access their own export history" ON beekon_data.export_history
  FOR ALL USING (auth.uid() = user_id);

-- =================================================================
-- 10. PERMISSIONS GRANTS
-- =================================================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.competitor_analysis_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.analysis_sessions TO authenticated;
GRANT SELECT ON beekon_data.competitor_status_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.website_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.export_history TO authenticated;

-- Grant all permissions to service role
GRANT ALL ON beekon_data.competitors TO service_role;
GRANT ALL ON beekon_data.competitor_analysis_results TO service_role;
GRANT ALL ON beekon_data.analysis_sessions TO service_role;
GRANT ALL ON beekon_data.competitor_status_log TO service_role;
GRANT ALL ON beekon_data.website_settings TO service_role;
GRANT ALL ON beekon_data.export_history TO service_role;

-- =================================================================
-- 11. HELPFUL COMMENTS
-- =================================================================

COMMENT ON TABLE beekon_data.competitors IS 'Competitor domains being tracked and analyzed for each website';
COMMENT ON TABLE beekon_data.competitor_analysis_results IS 'LLM analysis results specifically for competitor mentions (CORRECTED TABLE)';
COMMENT ON TABLE beekon_data.analysis_sessions IS 'Analysis session tracking for batch operations and debugging';
COMMENT ON TABLE beekon_data.competitor_status_log IS 'Audit log for competitor analysis status changes';
COMMENT ON TABLE beekon_data.website_settings IS 'Configuration settings for each website analysis';
COMMENT ON TABLE beekon_data.export_history IS 'History of data exports for auditing and usage tracking';

-- Column comments for key fields
COMMENT ON COLUMN beekon_data.competitors.analysis_status IS 'Current status: pending, analyzing, completed, failed';
COMMENT ON COLUMN beekon_data.competitors.analysis_progress IS 'Progress percentage (0-100) for ongoing analysis';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.competitor_id IS 'CRITICAL: Links to specific competitor, not website_id';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.is_mentioned IS 'Whether the competitor was mentioned in the LLM response';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.rank_position IS 'Position of competitor in ranked results (NULL if not ranked)';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.sentiment_score IS 'Sentiment score for the mention (-1 to 1, NULL if not applicable)';

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    policy_count INTEGER;
BEGIN
    -- Count new tables in this migration
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'beekon_data' 
      AND table_name IN ('competitors', 'competitor_analysis_results', 'analysis_sessions', 'competitor_status_log', 'website_settings', 'export_history');
    
    -- Count new indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data'
      AND (indexname LIKE '%competitor%' OR indexname LIKE '%analysis_session%' OR indexname LIKE '%website_setting%' OR indexname LIKE '%export_history%');
    
    -- Count RLS policies for new tables
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'beekon_data'
      AND tablename IN ('competitors', 'competitor_analysis_results', 'analysis_sessions', 'competitor_status_log', 'website_settings', 'export_history');
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'COMPETITOR ANALYSIS SYSTEM CREATED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'Indexes created: %', index_count;
    RAISE NOTICE 'RLS policies created: %', policy_count;
    RAISE NOTICE '';
    RAISE NOTICE 'CRITICAL FIX IMPLEMENTED:';
    RAISE NOTICE '  ✓ competitor_analysis_results uses competitor_id (NOT website_id)';
    RAISE NOTICE '  ✓ Proper foreign key relationships for competitor data';
    RAISE NOTICE '  ✓ Analysis session tracking for better organization';
    RAISE NOTICE '  ✓ Status tracking and audit logging';
    RAISE NOTICE '  ✓ Website-specific configuration settings';
    RAISE NOTICE '  ✓ Export history for usage monitoring';
    RAISE NOTICE '';
    RAISE NOTICE 'This fixes the architectural flaw where competitor data';
    RAISE NOTICE 'was incorrectly joined by website_id instead of competitor_id!';
    RAISE NOTICE '=================================================================';
END $$;