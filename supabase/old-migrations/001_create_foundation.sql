-- =================================================================
-- BEEKON.AI FOUNDATION SCHEMA
-- =================================================================
-- This migration creates the foundational database structure for Beekon.ai
-- including core schemas, tables, relationships, and basic configurations.
-- 
-- This is part of the complete schema rebuild to fix architectural issues
-- and establish a clean, maintainable database structure.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. SCHEMA CREATION
-- =================================================================

-- Create the main application schema
CREATE SCHEMA IF NOT EXISTS beekon_data;

-- Grant usage on the schema
GRANT USAGE ON SCHEMA beekon_data TO authenticated;
GRANT USAGE ON SCHEMA beekon_data TO service_role;

-- =================================================================
-- 2. UTILITY FUNCTIONS (Must be created before triggers)
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
CREATE TABLE IF NOT EXISTS beekon_data.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID, -- Will be linked to profiles after profiles table is created
  settings JSONB DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free',
  credits_remaining INTEGER DEFAULT 100,
  credits_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise')),
  CONSTRAINT valid_credits CHECK (credits_remaining >= 0)
);

-- Profiles table (Core user profiles)
CREATE TABLE IF NOT EXISTS beekon_data.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  avatar_url TEXT,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE SET NULL,
  notification_settings JSONB DEFAULT '{
    "email_notifications": true,
    "weekly_reports": true,
    "competitor_alerts": false,
    "analysis_complete": true,
    "daily_digest": false,
    "security_alerts": true
  }',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraint from workspaces to profiles (now that profiles exists)
ALTER TABLE beekon_data.workspaces 
DROP CONSTRAINT IF EXISTS workspaces_owner_id_fkey;

ALTER TABLE beekon_data.workspaces
ADD CONSTRAINT workspaces_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES beekon_data.profiles(id) ON DELETE SET NULL;

-- API Keys table
CREATE TABLE IF NOT EXISTS beekon_data.api_keys (
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
  CONSTRAINT valid_scopes CHECK (scopes <@ ARRAY['read', 'write', 'update', 'delete']),
  CONSTRAINT valid_rate_limit CHECK (rate_limit > 0),
  CONSTRAINT valid_usage_count CHECK (usage_count >= 0)
);

-- Websites table
CREATE TABLE IF NOT EXISTS beekon_data.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  display_name TEXT,
  crawl_status TEXT DEFAULT 'pending',
  is_active BOOLEAN DEFAULT TRUE,
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_crawl_status CHECK (crawl_status IN ('pending', 'crawling', 'completed', 'failed', 'paused')),
  CONSTRAINT valid_domain CHECK (domain ~ '^https?:\\/\\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(\\/.*)?$'),
  UNIQUE(workspace_id, domain)
);

-- Topics table
CREATE TABLE IF NOT EXISTS beekon_data.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL,
  topic_keywords TEXT[],
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  recommendation_text TEXT,
  reporting_text TEXT,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 5),
  UNIQUE(website_id, topic_name)
);

-- Prompts table
CREATE TABLE IF NOT EXISTS beekon_data.prompts (
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT valid_prompt_type CHECK (prompt_type IN ('listicle', 'comparison', 'use_case', 'alternative', 'general'))
);

-- =================================================================
-- 4. ANALYSIS RESULTS TABLES
-- =================================================================

-- LLM Analysis Results table (for your brand analysis)
CREATE TABLE IF NOT EXISTS beekon_data.llm_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES beekon_data.prompts(id) ON DELETE CASCADE NOT NULL,
  llm_provider TEXT NOT NULL,
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  is_mentioned BOOLEAN DEFAULT FALSE,
  rank_position INTEGER,
  sentiment_score DECIMAL(3,2),
  confidence_score DECIMAL(3,2),
  response_text TEXT,
  summary_text TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_llm_provider CHECK (llm_provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'gpt-4', 'claude-3', 'openai', 'anthropic')),
  CONSTRAINT valid_rank_position CHECK (rank_position IS NULL OR rank_position > 0),
  CONSTRAINT valid_sentiment_score CHECK (sentiment_score IS NULL OR sentiment_score BETWEEN -1.0 AND 1.0),
  CONSTRAINT valid_confidence_score CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0.0 AND 1.0),
  UNIQUE(prompt_id, llm_provider, website_id)
);

-- =================================================================
-- 5. CORE INDEXES
-- =================================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON beekon_data.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON beekon_data.profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON beekon_data.profiles(email);

-- API Keys indexes  
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON beekon_data.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON beekon_data.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON beekon_data.api_keys(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON beekon_data.api_keys(key_prefix);

-- Workspaces indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON beekon_data.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_tier ON beekon_data.workspaces(subscription_tier);

-- Websites indexes
CREATE INDEX IF NOT EXISTS idx_websites_workspace_id ON beekon_data.websites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_websites_domain_hash ON beekon_data.websites USING hash(domain);
CREATE INDEX IF NOT EXISTS idx_websites_active ON beekon_data.websites(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_websites_crawl_status ON beekon_data.websites(crawl_status);

-- Topics indexes
CREATE INDEX IF NOT EXISTS idx_topics_website_id ON beekon_data.topics(website_id);
CREATE INDEX IF NOT EXISTS idx_topics_active ON beekon_data.topics(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_topics_name_gin ON beekon_data.topics USING gin(to_tsvector('english', topic_name));

-- Prompts indexes
CREATE INDEX IF NOT EXISTS idx_prompts_topic_id ON beekon_data.prompts(topic_id);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON beekon_data.prompts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_prompts_priority ON beekon_data.prompts(priority);

-- LLM Analysis Results indexes
CREATE INDEX IF NOT EXISTS idx_llm_results_prompt_id ON beekon_data.llm_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_website_id ON beekon_data.llm_analysis_results(website_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_provider ON beekon_data.llm_analysis_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_llm_results_mentioned ON beekon_data.llm_analysis_results(is_mentioned) WHERE is_mentioned = TRUE;
CREATE INDEX IF NOT EXISTS idx_llm_results_analyzed_at ON beekon_data.llm_analysis_results(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_results_compound ON beekon_data.llm_analysis_results(website_id, llm_provider, analyzed_at DESC);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_llm_results_response_text_search ON beekon_data.llm_analysis_results 
USING gin(to_tsvector('english', response_text));
CREATE INDEX IF NOT EXISTS idx_llm_results_summary_text_search ON beekon_data.llm_analysis_results 
USING gin(to_tsvector('english', summary_text));

-- =================================================================
-- 6. TRIGGERS SETUP
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

CREATE TRIGGER update_topics_updated_at 
  BEFORE UPDATE ON beekon_data.topics 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prompts_updated_at 
  BEFORE UPDATE ON beekon_data.prompts 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create user signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- =================================================================

-- Enable RLS on all tables
ALTER TABLE beekon_data.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.llm_analysis_results ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Users can view own profile" ON beekon_data.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON beekon_data.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Workspaces RLS policies  
CREATE POLICY "Users can view their workspaces" ON beekon_data.workspaces
  FOR SELECT USING (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    ) OR
    id IN (
      SELECT workspace_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can modify workspaces they own" ON beekon_data.workspaces
  FOR ALL USING (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- API Keys RLS policies
CREATE POLICY "Users can manage own API keys" ON beekon_data.api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Websites RLS policies
CREATE POLICY "Users can access websites in their workspace" ON beekon_data.websites
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- Topics RLS policies
CREATE POLICY "Users can access topics for their websites" ON beekon_data.topics
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Prompts RLS policies
CREATE POLICY "Users can access prompts for their topics" ON beekon_data.prompts
  FOR ALL USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON t.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- LLM Analysis Results RLS policies
CREATE POLICY "Users can access analysis results for their websites" ON beekon_data.llm_analysis_results
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- =================================================================
-- 8. PERMISSIONS GRANTS
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

-- Grant all permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA beekon_data TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beekon_data TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA beekon_data TO service_role;

-- =================================================================
-- 9. HELPFUL COMMENTS
-- =================================================================

COMMENT ON SCHEMA beekon_data IS 'Main application schema for Beekon.ai containing all business logic tables';

COMMENT ON TABLE beekon_data.profiles IS 'User profiles linked to auth.users with workspace associations';
COMMENT ON TABLE beekon_data.workspaces IS 'Tenant/organization structure for multi-user access';
COMMENT ON TABLE beekon_data.api_keys IS 'User API keys for programmatic access with rate limiting';
COMMENT ON TABLE beekon_data.websites IS 'Websites being analyzed, owned by workspaces';
COMMENT ON TABLE beekon_data.topics IS 'Topics/categories for analysis prompts, scoped to websites';
COMMENT ON TABLE beekon_data.prompts IS 'Individual analysis prompts for LLM queries, grouped by topics';
COMMENT ON TABLE beekon_data.llm_analysis_results IS 'Results from LLM analysis for your brand/website mentions';

COMMIT;

-- =================================================================
-- POST-MIGRATION VERIFICATION
-- =================================================================

DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
    trigger_count INTEGER;
    policy_count INTEGER;
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
    
    -- Count RLS policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'beekon_data';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'BEEKON.AI FOUNDATION SCHEMA CREATED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'Indexes created: %', index_count;
    RAISE NOTICE 'Triggers created: %', trigger_count;
    RAISE NOTICE 'RLS policies created: %', policy_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Foundation includes:';
    RAISE NOTICE '  ✓ Core user and workspace management';
    RAISE NOTICE '  ✓ Website and topic organization';
    RAISE NOTICE '  ✓ LLM analysis results storage';
    RAISE NOTICE '  ✓ Comprehensive indexing for performance';
    RAISE NOTICE '  ✓ Row Level Security for data isolation';
    RAISE NOTICE '  ✓ Audit trails with updated_at triggers';
    RAISE NOTICE '=================================================================';
END $$;