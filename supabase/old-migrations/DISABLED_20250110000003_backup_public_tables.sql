-- Backup migration: Document current state of public.profiles and public.api_keys
-- This migration serves as a rollback reference point before moving tables to beekon_data schema

-- Current public.profiles table structure (for reference)
/*
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  avatar_url TEXT,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE SET NULL,
  notification_settings JSONB DEFAULT '{"email_notifications": true, "weekly_reports": true, "competitor_alerts": false, "analysis_complete": true}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

RLS Policies:
- "Users can view their own profile" FOR SELECT USING (auth.uid() = user_id)
- "Users can update their own profile" FOR UPDATE USING (auth.uid() = user_id)  
- "Users can insert their own profile" FOR INSERT WITH CHECK (auth.uid() = user_id)

Triggers:
- update_profiles_updated_at BEFORE UPDATE
- on_auth_user_created AFTER INSERT ON auth.users (calls handle_new_user())
*/

-- Current public.api_keys table structure (for reference)
/*
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  UNIQUE(user_id, name)
);

RLS Policies:
- "Users can view their own API keys" FOR SELECT USING (auth.uid() = user_id)
- "Users can insert their own API keys" FOR INSERT WITH CHECK (auth.uid() = user_id)
- "Users can update their own API keys" FOR UPDATE USING (auth.uid() = user_id)
- "Users can delete their own API keys" FOR DELETE USING (auth.uid() = user_id)

Triggers:
- update_api_keys_updated_at BEFORE UPDATE

Indexes:
- idx_api_keys_user_id ON (user_id)
- idx_api_keys_key_hash ON (key_hash)  
- idx_api_keys_active ON (user_id, is_active)
*/

-- Create backup tables for rollback purposes (optional)
-- These will be created only if they don't exist and will be dropped after successful migration

CREATE TABLE IF NOT EXISTS public.profiles_backup AS 
SELECT * FROM public.profiles WHERE false; -- Empty table with same structure

CREATE TABLE IF NOT EXISTS public.api_keys_backup AS
SELECT * FROM public.api_keys WHERE false; -- Empty table with same structure

-- Document current row counts for verification
DO $$
DECLARE
    profile_count INTEGER;
    api_key_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO profile_count FROM public.profiles;
    SELECT COUNT(*) INTO api_key_count FROM public.api_keys;
    
    RAISE NOTICE 'Pre-migration counts: profiles=%, api_keys=%', profile_count, api_key_count;
END $$;