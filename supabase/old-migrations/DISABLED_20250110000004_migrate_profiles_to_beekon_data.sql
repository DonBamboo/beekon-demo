-- Migration: Move profiles table from public schema to beekon_data schema
-- This migration preserves all data, relationships, RLS policies, and triggers

BEGIN;

-- Step 1: Create the profiles table in beekon_data schema
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
  notification_settings JSONB DEFAULT '{"email_notifications": true, "weekly_reports": true, "competitor_alerts": false, "analysis_complete": true}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Step 2: Copy all data from public.profiles to beekon_data.profiles
INSERT INTO beekon_data.profiles (
  id,
  user_id,
  email,
  full_name,
  first_name,
  last_name,
  company,
  avatar_url,
  workspace_id,
  notification_settings,
  created_at,
  updated_at
)
SELECT 
  id,
  user_id,
  email,
  full_name,
  first_name,
  last_name,
  company,
  avatar_url,
  workspace_id,
  notification_settings,
  created_at,
  updated_at
FROM public.profiles;

-- Step 3: Enable RLS on the new table
ALTER TABLE beekon_data.profiles ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for beekon_data.profiles
CREATE POLICY "Users can view their own profile" ON beekon_data.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON beekon_data.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON beekon_data.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Step 5: Create updated_at trigger for the new table
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON beekon_data.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 6: Update the handle_new_user function to use beekon_data.profiles
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

-- Step 7: Update workspaces table owner_id foreign key to reference beekon_data.profiles
-- First, drop the existing foreign key constraint (if it exists)
ALTER TABLE beekon_data.workspaces 
DROP CONSTRAINT IF EXISTS workspaces_owner_id_fkey;

-- Add the new foreign key constraint pointing to beekon_data.profiles
ALTER TABLE beekon_data.workspaces
ADD CONSTRAINT workspaces_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES beekon_data.profiles(id) ON DELETE SET NULL;

-- Step 8: Verify data migration
DO $$
DECLARE
    old_count INTEGER;
    new_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_count FROM public.profiles;
    SELECT COUNT(*) INTO new_count FROM beekon_data.profiles;
    
    IF old_count != new_count THEN
        RAISE EXCEPTION 'Data migration failed: old_count=%, new_count=%', old_count, new_count;
    END IF;
    
    RAISE NOTICE 'Profiles migration successful: % rows migrated', new_count;
END $$;

-- Step 9: Drop the old public.profiles table (commented out for safety)
-- Uncomment the following lines after verifying the migration is successful:
-- DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
-- DROP TABLE public.profiles CASCADE;

COMMIT;

-- Note: The old public.profiles table is preserved for rollback purposes
-- After confirming the migration works correctly, you can manually drop it with:
-- DROP TABLE public.profiles CASCADE;