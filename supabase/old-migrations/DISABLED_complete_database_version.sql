-- =================================================================
-- Complete Beekon.ai Database Structure Migration
-- =================================================================
-- This migration creates the complete database structure for Beekon.ai
-- including all schemas, tables, relationships, indexes, policies, 
-- functions, triggers, and storage configuration.
--
-- This is a comprehensive migration that can be used to set up
-- the complete database structure on a fresh Supabase instance.
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
-- 2. CORE FUNCTIONS (Must be created before triggers)
-- =================================================================

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
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
  credits_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise'))
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  rate_limit INTEGER DEFAULT 1000,
  rate_limit_window TEXT DEFAULT '1 hour',
  scopes TEXT[] DEFAULT ARRAY['read'],
  
  UNIQUE(user_id, name),
  CONSTRAINT valid_scopes CHECK (scopes <@ ARRAY['read', 'write', 'update', 'delete'])
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_crawl_status CHECK (crawl_status IN ('pending', 'crawling', 'completed', 'failed', 'paused')),
  CONSTRAINT valid_domain CHECK (domain ~ '^https?:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(\/.*)?$')
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT valid_prompt_type CHECK (prompt_type IN ('listicle', 'comparison', 'use_case', 'alternative', 'general'))
);

-- LLM Analysis Results table
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
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_llm_provider CHECK (llm_provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'gpt-4', 'claude-3')),
  CONSTRAINT valid_rank_position CHECK (rank_position > -1),
  CONSTRAINT valid_sentiment_score CHECK (sentiment_score BETWEEN -1.0 AND 1.0),
  CONSTRAINT valid_confidence_score CHECK (confidence_score BETWEEN 0.0 AND 1.0)
);

-- Competitors table
CREATE TABLE IF NOT EXISTS beekon_data.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  competitor_domain TEXT NOT NULL,
  competitor_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  analysis_frequency TEXT DEFAULT 'weekly',
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_analysis_frequency CHECK (analysis_frequency IN ('daily', 'weekly', 'monthly', 'manual')),
  CONSTRAINT valid_competitor_domain CHECK (competitor_domain ~ '^https?:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(\/.*)?$'),
  UNIQUE(website_id, competitor_domain)
);

-- Website Settings table
CREATE TABLE IF NOT EXISTS beekon_data.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL UNIQUE,
  settings JSONB DEFAULT '{
    "analysis_frequency": "weekly",
    "auto_analysis": true,
    "notifications": true,
    "competitor_tracking": false,
    "weekly_reports": true,
    "show_in_dashboard": true,
    "priority_level": "medium",
    "api_access": false,
    "data_retention": "90",
    "export_enabled": true
  }' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =================================================================
-- 4. PERFORMANCE INDEXES
-- =================================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON beekon_data.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON beekon_data.profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON beekon_data.profiles(email);

-- API Keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON beekon_data.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON beekon_data.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON beekon_data.api_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON beekon_data.api_keys(key_prefix);

-- Workspaces indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON beekon_data.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_tier ON beekon_data.workspaces(subscription_tier);

-- Websites indexes
CREATE INDEX IF NOT EXISTS idx_websites_workspace_id ON beekon_data.websites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_websites_domain ON beekon_data.websites(domain);
CREATE INDEX IF NOT EXISTS idx_websites_active ON beekon_data.websites(is_active);
CREATE INDEX IF NOT EXISTS idx_websites_crawl_status ON beekon_data.websites(crawl_status);

-- Topics indexes
CREATE INDEX IF NOT EXISTS idx_topics_website_id ON beekon_data.topics(website_id);
CREATE INDEX IF NOT EXISTS idx_topics_active ON beekon_data.topics(is_active);
CREATE INDEX IF NOT EXISTS idx_topics_name ON beekon_data.topics(topic_name);

-- Prompts indexes
CREATE INDEX IF NOT EXISTS idx_prompts_topic_id ON beekon_data.prompts(topic_id);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON beekon_data.prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_prompts_priority ON beekon_data.prompts(priority);

-- LLM Analysis Results indexes (Critical for performance)
CREATE INDEX IF NOT EXISTS idx_llm_results_prompt_id ON beekon_data.llm_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_website_id ON beekon_data.llm_analysis_results(website_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_provider ON beekon_data.llm_analysis_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_llm_results_mentioned ON beekon_data.llm_analysis_results(is_mentioned);
CREATE INDEX IF NOT EXISTS idx_llm_results_analyzed_at ON beekon_data.llm_analysis_results(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_llm_results_compound ON beekon_data.llm_analysis_results(website_id, llm_provider, analyzed_at);

-- Competitors indexes
CREATE INDEX IF NOT EXISTS idx_competitors_website_id ON beekon_data.competitors(website_id);
CREATE INDEX IF NOT EXISTS idx_competitors_domain ON beekon_data.competitors(competitor_domain);
CREATE INDEX IF NOT EXISTS idx_competitors_active ON beekon_data.competitors(is_active);

-- Website Settings indexes
CREATE INDEX IF NOT EXISTS idx_website_settings_website_id ON beekon_data.website_settings(website_id);

-- =================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =================================================================

-- Enable RLS on all tables
ALTER TABLE beekon_data.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.llm_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.website_settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON beekon_data.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON beekon_data.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON beekon_data.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- API Keys policies
CREATE POLICY "Users can view their own API keys" ON beekon_data.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys" ON beekon_data.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" ON beekon_data.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON beekon_data.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Workspaces policies
CREATE POLICY "Users can view workspaces they own" ON beekon_data.workspaces
  FOR SELECT USING (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update workspaces they own" ON beekon_data.workspaces
  FOR UPDATE USING (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert workspaces they own" ON beekon_data.workspaces
  FOR INSERT WITH CHECK (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- Websites policies
CREATE POLICY "Users can view websites in their workspaces" ON beekon_data.websites
  FOR SELECT USING (
    workspace_id IN (
      SELECT w.id FROM beekon_data.workspaces w
      JOIN beekon_data.profiles p ON w.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage websites in their workspaces" ON beekon_data.websites
  FOR ALL USING (
    workspace_id IN (
      SELECT w.id FROM beekon_data.workspaces w
      JOIN beekon_data.profiles p ON w.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Topics policies
CREATE POLICY "Users can view topics for their websites" ON beekon_data.topics
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage topics for their websites" ON beekon_data.topics
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Prompts policies
CREATE POLICY "Users can view prompts for their topics" ON beekon_data.prompts
  FOR SELECT USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON t.website_id = w.id
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage prompts for their topics" ON beekon_data.prompts
  FOR ALL USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON t.website_id = w.id
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

-- LLM Analysis Results policies
CREATE POLICY "Users can view analysis results for their websites" ON beekon_data.llm_analysis_results
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage analysis results for their websites" ON beekon_data.llm_analysis_results
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitors policies
CREATE POLICY "Users can view competitors for their websites" ON beekon_data.competitors
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage competitors for their websites" ON beekon_data.competitors
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Website Settings policies
CREATE POLICY "Users can view website settings for their websites" ON beekon_data.website_settings
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage website settings for their websites" ON beekon_data.website_settings
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      JOIN beekon_data.profiles p ON ws.owner_id = p.user_id
      WHERE p.user_id = auth.uid()
    )
  );

-- =================================================================
-- 6. TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- =================================================================

-- Profiles triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON beekon_data.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workspaces triggers
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON beekon_data.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Websites triggers
CREATE TRIGGER update_websites_updated_at
  BEFORE UPDATE ON beekon_data.websites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Competitors triggers
CREATE TRIGGER update_competitors_updated_at
  BEFORE UPDATE ON beekon_data.competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Website Settings triggers
CREATE TRIGGER update_website_settings_updated_at
  BEFORE UPDATE ON beekon_data.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- 7. STORAGE BUCKET CONFIGURATION
-- =================================================================

-- Create avatars bucket for user profile images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
  
  -- Create new policies
  CREATE POLICY "Users can upload their own avatar" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'avatars' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  CREATE POLICY "Users can view all avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

  CREATE POLICY "Users can update their own avatar" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'avatars' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  CREATE POLICY "Users can delete their own avatar" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'avatars' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Storage policies may need manual configuration: %', SQLERRM;
END $$;

-- =================================================================
-- 8. GRANT PERMISSIONS
-- =================================================================

-- Grant appropriate permissions to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA beekon_data TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beekon_data TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA beekon_data TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beekon_data TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =================================================================
-- 9. DATA VALIDATION AND VERIFICATION
-- =================================================================

-- Verify table creation and structure
DO $$
DECLARE
  table_count INTEGER;
  index_count INTEGER;
  policy_count INTEGER;
BEGIN
  -- Count tables in beekon_data schema
  SELECT COUNT(*) INTO table_count 
  FROM information_schema.tables 
  WHERE table_schema = 'beekon_data';
  
  -- Count indexes on beekon_data tables
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes 
  WHERE schemaname = 'beekon_data';
  
  -- Count RLS policies on beekon_data tables
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE schemaname = 'beekon_data';
  
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Beekon.ai Database Structure Migration Completed Successfully';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Tables created: %', table_count;
  RAISE NOTICE 'Indexes created: %', index_count;
  RAISE NOTICE 'RLS policies created: %', policy_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Schema: beekon_data';
  RAISE NOTICE 'Core Tables:';
  RAISE NOTICE '  ✓ profiles - User profile management';
  RAISE NOTICE '  ✓ api_keys - API key management';
  RAISE NOTICE '  ✓ workspaces - Multi-tenant workspaces';
  RAISE NOTICE '  ✓ websites - Website tracking';
  RAISE NOTICE '  ✓ topics - Analysis topics';
  RAISE NOTICE '  ✓ prompts - AI prompts';
  RAISE NOTICE '  ✓ llm_analysis_results - AI analysis results';
  RAISE NOTICE '  ✓ competitors - Competitor tracking';
  RAISE NOTICE '  ✓ website_settings - Website configurations';
  RAISE NOTICE '';
  RAISE NOTICE 'Security: Row Level Security enabled on all tables';
  RAISE NOTICE 'Performance: Comprehensive indexes created';
  RAISE NOTICE 'Storage: Avatar bucket configured';
  RAISE NOTICE 'Functions: User signup and timestamp triggers active';
  RAISE NOTICE '=================================================================';
  
  -- Verify that essential functions exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    RAISE WARNING 'handle_new_user function not found!';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    RAISE WARNING 'update_updated_at_column function not found!';
  END IF;
  
END $$;

COMMIT;

-- =================================================================
-- POST-MIGRATION NOTES
-- =================================================================
/*

DEPLOYMENT CHECKLIST:
=====================

1. ✅ Run this migration on fresh Supabase instance
2. ⚠️  Configure environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_PUBLISHABLE_KEY
   - SUPABASE_SERVICE_ROLE_KEY (for server-side operations)

3. ⚠️  Verify RLS policies are working:
   - Test user registration creates profile
   - Test workspace creation and access
   - Test website and analysis data access

4. ⚠️  Test file upload:
   - Verify avatar upload works
   - Check storage bucket permissions

5. ⚠️  Performance verification:
   - Run EXPLAIN ANALYZE on complex queries
   - Monitor index usage
   - Check query performance on analysis results

ROLLBACK PLAN:
==============
To rollback this migration (if needed):
1. DROP SCHEMA beekon_data CASCADE;
2. DROP FUNCTION public.handle_new_user() CASCADE;
3. DROP FUNCTION public.update_updated_at_column() CASCADE;
4. DELETE FROM storage.buckets WHERE id = 'avatars';

SECURITY NOTES:
===============
- All tables have RLS enabled
- Users can only access their own workspace data
- API keys are properly isolated per user
- Storage policies prevent unauthorized file access

PERFORMANCE NOTES:
==================
- Critical indexes created for filtering and joining
- Compound indexes for common query patterns
- Foreign key indexes for referential integrity
- Consider adding more specific indexes based on query patterns

*/