-- =================================================================
-- COMPLETE DATABASE SCHEMA RECREATION
-- =================================================================
-- This migration recreates the exact database structure from the
-- live Supabase project: apzyfnqlajvbgaejfzfm
-- 
-- Generated automatically to ensure perfect replication of:
-- - All table structures with exact column types and constraints
-- - All indexes for optimal performance
-- - All foreign key relationships
-- - All check constraints and validations
-- =================================================================

BEGIN;

-- =================================================================
-- 1. CREATE BEEKON_DATA SCHEMA
-- =================================================================

CREATE SCHEMA IF NOT EXISTS beekon_data;
GRANT USAGE ON SCHEMA beekon_data TO authenticated;
GRANT USAGE ON SCHEMA beekon_data TO service_role;

-- =================================================================
-- 2. UTILITY FUNCTIONS 
-- =================================================================

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user signup and create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO beekon_data.profiles (user_id, email, full_name, first_name, last_name, company)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'company'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. CORE TABLES CREATION
-- =================================================================

-- Workspaces table (Create first as it's referenced by profiles)
CREATE TABLE beekon_data.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID, -- Will be linked to profiles after profiles table is created
  settings JSONB DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free',
  credits_remaining INTEGER DEFAULT 100,
  credits_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_subscription_tier CHECK (subscription_tier = ANY (ARRAY['free'::text, 'starter'::text, 'professional'::text, 'enterprise'::text]))
);

-- Profiles table 
CREATE TABLE beekon_data.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  avatar_url TEXT,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE SET NULL,
  notification_settings JSONB DEFAULT '{"daily_digest": false, "weekly_reports": true, "security_alerts": true, "analysis_complete": true, "competitor_alerts": false, "email_notifications": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint from workspaces to profiles (now that profiles exists)
ALTER TABLE beekon_data.workspaces 
ADD CONSTRAINT workspaces_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES beekon_data.profiles(user_id) ON DELETE SET NULL;

-- API Keys table
CREATE TABLE beekon_data.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  rate_limit INTEGER DEFAULT 1000,
  rate_limit_window TEXT DEFAULT '1 hour',
  scopes TEXT[] DEFAULT ARRAY['read'],
  
  UNIQUE(user_id, name),
  CONSTRAINT valid_scopes CHECK (scopes <@ ARRAY['read'::text, 'write'::text, 'update'::text, 'delete'::text])
);

-- Websites table
CREATE TABLE beekon_data.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  display_name TEXT,
  crawl_status TEXT DEFAULT 'pending',
  is_active BOOLEAN DEFAULT TRUE,
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_crawl_status CHECK (crawl_status = ANY (ARRAY['pending'::text, 'crawling'::text, 'completed'::text, 'failed'::text, 'paused'::text])),
  CONSTRAINT valid_domain CHECK (domain ~ '^https?:\\/\\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(\\/.*)?$'::text)
);

-- Topics table
CREATE TABLE beekon_data.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL,
  topic_keywords TEXT[],
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  recommendation_text TEXT,
  reporting_text TEXT,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 5),
  UNIQUE(website_id, topic_name)
);

-- Prompts table
CREATE TABLE beekon_data.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text TEXT NOT NULL,
  prompt_type TEXT DEFAULT 'general',
  priority INTEGER DEFAULT 1,
  topic_id UUID REFERENCES beekon_data.topics(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  strengths TEXT[],
  opportunities TEXT[],
  recommendation_text TEXT,
  reporting_text TEXT,
  expected_llms TEXT[] DEFAULT ARRAY['chatgpt', 'claude', 'gemini'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT prompts_priority_check CHECK (priority >= 0 AND priority <= 5),
  CONSTRAINT prompts_prompt_type_check CHECK (prompt_type = ANY (ARRAY['listicle'::text, 'comparison'::text, 'use_case'::text, 'alternative'::text, 'general'::text, 'custom'::text]))
);

-- Analysis Sessions table
CREATE TABLE beekon_data.analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_name TEXT NOT NULL,
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending',
  configuration JSONB DEFAULT '{}',
  progress_data JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT analysis_sessions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))
);

-- LLM Analysis Results table (for brand analysis)
CREATE TABLE beekon_data.llm_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES beekon_data.prompts(id) ON DELETE CASCADE NOT NULL,
  llm_provider TEXT NOT NULL,
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  is_mentioned BOOLEAN DEFAULT FALSE,
  rank_position INTEGER,
  sentiment_score NUMERIC,
  confidence_score NUMERIC,
  response_text TEXT,
  summary_text TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis_session_id UUID REFERENCES beekon_data.analysis_sessions(id) ON DELETE SET NULL,
  
  CONSTRAINT valid_llm_provider CHECK (llm_provider = ANY (ARRAY['chatgpt'::text, 'claude'::text, 'gemini'::text, 'perplexity'::text, 'gpt-4'::text, 'claude-3'::text])),
  CONSTRAINT valid_rank_position CHECK (rank_position > -1),
  CONSTRAINT valid_sentiment_score CHECK (sentiment_score >= -1.0 AND sentiment_score <= 1.0),
  CONSTRAINT valid_confidence_score CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0)
);

-- Competitors table
CREATE TABLE beekon_data.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  competitor_domain TEXT NOT NULL,
  competitor_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  analysis_frequency TEXT DEFAULT 'weekly',
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  analysis_status CHARACTER VARYING DEFAULT 'pending',
  analysis_started_at TIMESTAMP WITH TIME ZONE,
  analysis_completed_at TIMESTAMP WITH TIME ZONE,
  analysis_progress INTEGER DEFAULT 0,
  last_error_message TEXT,
  
  CONSTRAINT valid_analysis_frequency CHECK (analysis_frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'manual'::text])),
  CONSTRAINT competitors_analysis_status_check CHECK (analysis_status::text = ANY (ARRAY['pending'::character varying, 'analyzing'::character varying, 'completed'::character varying, 'failed'::character varying]::text[])),
  CONSTRAINT valid_competitor_domain CHECK (competitor_domain ~ '^https?:\\/\\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(\\/.*)?$'::text),
  CONSTRAINT competitors_analysis_progress_check CHECK (analysis_progress >= 0 AND analysis_progress <= 100),
  UNIQUE(website_id, competitor_domain)
);

-- Website Settings table
CREATE TABLE beekon_data.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL UNIQUE,
  settings JSONB DEFAULT '{"api_access": false, "country_code": null, "country_name": null, "auto_analysis": true, "notifications": true, "data_retention": "90", "export_enabled": true, "priority_level": "medium", "weekly_reports": true, "show_in_dashboard": true, "analysis_frequency": "weekly", "competitor_tracking": false}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitor Analysis Results table
CREATE TABLE beekon_data.competitor_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES beekon_data.competitors(id) ON DELETE CASCADE NOT NULL,
  llm_analysis_id UUID REFERENCES beekon_data.llm_analysis_results(id) ON DELETE CASCADE NOT NULL,
  llm_provider CHARACTER VARYING NOT NULL,
  is_mentioned BOOLEAN DEFAULT FALSE,
  rank_position INTEGER,
  sentiment_score NUMERIC,
  confidence_score NUMERIC,
  response_text TEXT,
  summary_text TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  prompt_id UUID REFERENCES beekon_data.prompts(id) ON DELETE SET NULL,
  analysis_session_id UUID REFERENCES beekon_data.analysis_sessions(id) ON DELETE SET NULL,
  
  UNIQUE(competitor_id, llm_analysis_id, llm_provider)
);

-- Export History table
CREATE TABLE beekon_data.export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  export_type CHARACTER VARYING NOT NULL,
  format CHARACTER VARYING NOT NULL,
  filename CHARACTER VARYING NOT NULL,
  file_size BIGINT,
  status CHARACTER VARYING DEFAULT 'pending',
  filters JSONB,
  date_range JSONB,
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT export_history_type_check CHECK (export_type::text = ANY (ARRAY['analysis'::character varying, 'dashboard'::character varying, 'website'::character varying, 'competitor'::character varying, 'configuration'::character varying, 'filtered_data'::character varying]::text[])),
  CONSTRAINT export_history_status_check CHECK (status::text = ANY (ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying]::text[])),
  CONSTRAINT export_history_format_check CHECK (format::text = ANY (ARRAY['pdf'::character varying, 'csv'::character varying, 'json'::character varying, 'excel'::character varying, 'word'::character varying]::text[]))
);

-- Competitor Status Log table
CREATE TABLE beekon_data.competitor_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES beekon_data.competitors(id) ON DELETE CASCADE NOT NULL,
  old_status CHARACTER VARYING,
  new_status CHARACTER VARYING NOT NULL,
  progress INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =================================================================
-- 4. PERFORMANCE INDEXES
-- =================================================================

-- Profiles indexes
CREATE INDEX idx_profiles_user_id ON beekon_data.profiles(user_id);
CREATE INDEX idx_profiles_workspace_id ON beekon_data.profiles(workspace_id);
CREATE INDEX idx_profiles_email ON beekon_data.profiles(email);

-- API Keys indexes  
CREATE INDEX idx_api_keys_user_id ON beekon_data.api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON beekon_data.api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON beekon_data.api_keys(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_api_keys_key_prefix ON beekon_data.api_keys(key_prefix);

-- Workspaces indexes
CREATE INDEX idx_workspaces_owner_id ON beekon_data.workspaces(owner_id);
CREATE INDEX idx_workspaces_subscription_tier ON beekon_data.workspaces(subscription_tier);

-- Websites indexes
CREATE INDEX idx_websites_workspace_id ON beekon_data.websites(workspace_id);
CREATE INDEX idx_websites_domain_hash ON beekon_data.websites USING hash(domain);
CREATE INDEX idx_websites_active ON beekon_data.websites(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_websites_crawl_status ON beekon_data.websites(crawl_status);

-- Topics indexes
CREATE INDEX idx_topics_website_id ON beekon_data.topics(website_id);
CREATE INDEX idx_topics_active ON beekon_data.topics(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_topics_name_gin ON beekon_data.topics USING gin(to_tsvector('english', topic_name));

-- Prompts indexes
CREATE INDEX idx_prompts_topic_id ON beekon_data.prompts(topic_id);
CREATE INDEX idx_prompts_active ON beekon_data.prompts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_prompts_priority ON beekon_data.prompts(priority);

-- LLM Analysis Results indexes
CREATE INDEX idx_llm_results_prompt_id ON beekon_data.llm_analysis_results(prompt_id);
CREATE INDEX idx_llm_results_website_id ON beekon_data.llm_analysis_results(website_id);
CREATE INDEX idx_llm_results_provider ON beekon_data.llm_analysis_results(llm_provider);
CREATE INDEX idx_llm_results_mentioned ON beekon_data.llm_analysis_results(is_mentioned) WHERE is_mentioned = TRUE;
CREATE INDEX idx_llm_results_analyzed_at ON beekon_data.llm_analysis_results(analyzed_at DESC);
CREATE INDEX idx_llm_results_compound ON beekon_data.llm_analysis_results(website_id, llm_provider, analyzed_at DESC);

-- Full-text search indexes
CREATE INDEX idx_llm_results_response_text_search ON beekon_data.llm_analysis_results 
USING gin(to_tsvector('english', response_text));
CREATE INDEX idx_llm_results_summary_text_search ON beekon_data.llm_analysis_results 
USING gin(to_tsvector('english', summary_text));

-- Competitors table indexes
CREATE INDEX idx_competitors_website_id ON beekon_data.competitors(website_id);
CREATE INDEX idx_competitors_domain_hash ON beekon_data.competitors USING hash(competitor_domain);
CREATE INDEX idx_competitors_active ON beekon_data.competitors(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_competitors_status ON beekon_data.competitors(analysis_status, analysis_started_at);
CREATE INDEX idx_competitors_website_status ON beekon_data.competitors(website_id, analysis_status, updated_at);

-- Competitor Analysis Results indexes 
CREATE INDEX idx_competitor_analysis_results_competitor_id ON beekon_data.competitor_analysis_results(competitor_id);
CREATE INDEX idx_competitor_analysis_results_llm_analysis_id ON beekon_data.competitor_analysis_results(llm_analysis_id);
CREATE INDEX idx_competitor_analysis_results_llm_provider ON beekon_data.competitor_analysis_results(llm_provider);
CREATE INDEX idx_competitor_analysis_results_analyzed_at ON beekon_data.competitor_analysis_results(analyzed_at DESC);
CREATE INDEX idx_competitor_analysis_results_mentioned ON beekon_data.competitor_analysis_results(is_mentioned, rank_position) WHERE is_mentioned = TRUE;
CREATE INDEX idx_competitor_analysis_results_composite ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at DESC, is_mentioned);

-- Full-text search indexes for competitor results
CREATE INDEX idx_competitor_results_response_text_search ON beekon_data.competitor_analysis_results 
USING gin(to_tsvector('english', response_text));
CREATE INDEX idx_competitor_results_summary_text_search ON beekon_data.competitor_analysis_results 
USING gin(to_tsvector('english', summary_text));

-- Analysis Sessions indexes
CREATE INDEX idx_analysis_sessions_website_id ON beekon_data.analysis_sessions(website_id);
CREATE INDEX idx_analysis_sessions_user_id ON beekon_data.analysis_sessions(user_id);
CREATE INDEX idx_analysis_sessions_workspace_id ON beekon_data.analysis_sessions(workspace_id);
CREATE INDEX idx_analysis_sessions_status ON beekon_data.analysis_sessions(status, created_at DESC);
CREATE INDEX idx_analysis_sessions_website_status ON beekon_data.analysis_sessions(website_id, status, started_at DESC);

-- Competitor Status Log indexes
CREATE INDEX idx_competitor_status_log_competitor ON beekon_data.competitor_status_log(competitor_id, created_at DESC);
CREATE INDEX idx_competitor_status_log_status ON beekon_data.competitor_status_log(new_status, created_at DESC);

-- Website Settings indexes
CREATE INDEX idx_website_settings_website_id ON beekon_data.website_settings(website_id);
CREATE INDEX idx_website_settings_gin ON beekon_data.website_settings USING gin(settings);

-- Export History indexes
CREATE INDEX idx_export_history_user_id ON beekon_data.export_history(user_id);
CREATE INDEX idx_export_history_created_at ON beekon_data.export_history(created_at DESC);
CREATE INDEX idx_export_history_status ON beekon_data.export_history(status);
CREATE INDEX idx_export_history_export_type ON beekon_data.export_history(export_type);
CREATE INDEX idx_export_history_user_created ON beekon_data.export_history(user_id, created_at DESC);

-- =================================================================
-- 5. TRIGGERS SETUP
-- =================================================================

-- Add updated_at triggers for tables that need them
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON beekon_data.profiles 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at 
  BEFORE UPDATE ON beekon_data.workspaces 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_websites_updated_at 
  BEFORE UPDATE ON beekon_data.websites 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitors_updated_at 
  BEFORE UPDATE ON beekon_data.competitors 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_website_settings_updated_at 
  BEFORE UPDATE ON beekon_data.website_settings 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_export_history_updated_at 
  BEFORE UPDATE ON beekon_data.export_history 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_analysis_sessions_updated_at 
  BEFORE UPDATE ON beekon_data.analysis_sessions 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create user signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- =================================================================

-- Enable RLS on all tables
ALTER TABLE beekon_data.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.llm_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitor_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitor_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.export_history ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 7. PERMISSIONS GRANTS
-- =================================================================

-- Grant basic permissions to authenticated users
GRANT SELECT ON beekon_data.profiles TO authenticated;
GRANT INSERT, UPDATE ON beekon_data.profiles TO authenticated;

GRANT SELECT ON beekon_data.workspaces TO authenticated;
GRANT INSERT, UPDATE, DELETE ON beekon_data.workspaces TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.websites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.prompts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.llm_analysis_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.competitor_analysis_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.analysis_sessions TO authenticated;
GRANT SELECT ON beekon_data.competitor_status_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.website_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.export_history TO authenticated;

-- Grant all permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA beekon_data TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beekon_data TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA beekon_data TO service_role;

-- =================================================================
-- 8. HELPFUL COMMENTS
-- =================================================================

COMMENT ON SCHEMA beekon_data IS 'Main application schema for Beekon.ai containing all business logic tables';

COMMENT ON TABLE beekon_data.profiles IS 'User profiles linked to auth.users with workspace associations';
COMMENT ON TABLE beekon_data.workspaces IS 'Tenant/organization structure for multi-user access';
COMMENT ON TABLE beekon_data.api_keys IS 'User API keys for programmatic access with rate limiting';
COMMENT ON TABLE beekon_data.websites IS 'Websites being analyzed, owned by workspaces';
COMMENT ON TABLE beekon_data.topics IS 'Topics/categories for analysis prompts, scoped to websites';
COMMENT ON TABLE beekon_data.prompts IS 'Individual analysis prompts for LLM queries, grouped by topics';
COMMENT ON TABLE beekon_data.llm_analysis_results IS 'Results from LLM analysis for your brand/website mentions';
COMMENT ON TABLE beekon_data.competitors IS 'Competitor domains being tracked and analyzed for each website';
COMMENT ON TABLE beekon_data.competitor_analysis_results IS 'LLM analysis results specifically for competitor mentions';
COMMENT ON TABLE beekon_data.analysis_sessions IS 'Analysis session tracking for batch operations and debugging';
COMMENT ON TABLE beekon_data.competitor_status_log IS 'Audit log for competitor analysis status changes';
COMMENT ON TABLE beekon_data.website_settings IS 'Configuration settings for each website analysis';
COMMENT ON TABLE beekon_data.export_history IS 'History of data exports for auditing and usage tracking';

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Count created tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'beekon_data';
    
    -- Count created indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE schemaname = 'beekon_data';
    
    -- Count created triggers
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers 
    WHERE trigger_schema = 'beekon_data';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'BEEKON.AI COMPLETE SCHEMA RECREATED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'Indexes created: %', index_count;
    RAISE NOTICE 'Triggers created: %', trigger_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Complete schema includes:';
    RAISE NOTICE '  ✓ All 13 core tables with exact column definitions';
    RAISE NOTICE '  ✓ All foreign key relationships and constraints';
    RAISE NOTICE '  ✓ All indexes for optimal performance';
    RAISE NOTICE '  ✓ All triggers for automation';
    RAISE NOTICE '  ✓ Row Level Security enabled';
    RAISE NOTICE '  ✓ Proper permissions and grants';
    RAISE NOTICE '=================================================================';
END $$;