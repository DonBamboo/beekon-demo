-- Fixed Migration: Move profiles table from public schema to beekon_data schema
-- This migration includes proper data validation and cleanup for foreign key constraints

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

-- Step 3: Handle orphaned workspace records BEFORE applying foreign key constraint
-- First, identify and create profiles for workspace owners that exist in auth.users
-- DO $$
-- DECLARE
--     missing_profile_record RECORD;
--     created_profiles INTEGER := 0;
-- BEGIN
--     RAISE NOTICE 'Creating missing profiles for workspace owners...';
    
--     FOR missing_profile_record IN 
--         SELECT DISTINCT w.owner_id, u.email, u.raw_user_meta_data
--         FROM beekon_data.workspaces w
--         JOIN auth.users u ON w.owner_id = u.id
--         WHERE w.owner_id IS NOT NULL
--         AND w.owner_id NOT IN (SELECT id FROM beekon_data.profiles)
--     LOOP
--         -- Create missing profile for this user
--         INSERT INTO beekon_data.profiles (
--             id,
--             user_id, 
--             email,
--             full_name,
--             first_name,
--             last_name,
--             company,
--             created_at,
--             updated_at
--         ) VALUES (
--             missing_profile_record.owner_id,
--             missing_profile_record.owner_id,
--             missing_profile_record.email,
--             COALESCE(
--                 missing_profile_record.raw_user_meta_data->>'full_name', 
--                 missing_profile_record.raw_user_meta_data->>'name', 
--                 split_part(missing_profile_record.email, '@', 1)
--             ),
--             missing_profile_record.raw_user_meta_data->>'first_name',
--             missing_profile_record.raw_user_meta_data->>'last_name',
--             missing_profile_record.raw_user_meta_data->>'company',
--             now(),
--             now()
--         );
        
--         created_profiles := created_profiles + 1;
--     END LOOP;
    
--     RAISE NOTICE 'Created % missing profiles for existing auth users', created_profiles;
-- END $$;

-- Step 3: Handle orphaned workspace records BEFORE applying foreign key constraint
-- First, identify and create profiles for workspace owners that exist in auth.users but not in beekon_data.profiles by user_id
DO $$
DECLARE
    missing_profile_record RECORD;
    created_profiles INTEGER := 0;
BEGIN
    RAISE NOTICE 'Creating missing profiles for workspace owners...';
    
    FOR missing_profile_record IN 
        SELECT DISTINCT w.owner_id, u.email, u.raw_user_meta_data
        FROM beekon_data.workspaces w
        JOIN auth.users u ON w.owner_id = u.id
        WHERE w.owner_id IS NOT NULL
        AND w.owner_id NOT IN (
            SELECT user_id FROM beekon_data.profiles
        )
    LOOP
        INSERT INTO beekon_data.profiles (
            user_id,
            email,
            full_name,
            first_name,
            last_name,
            company,
            created_at,
            updated_at
        ) VALUES (
            missing_profile_record.owner_id,
            missing_profile_record.email,
            COALESCE(
                missing_profile_record.raw_user_meta_data->>'full_name', 
                missing_profile_record.raw_user_meta_data->>'name', 
                split_part(missing_profile_record.email, '@', 1)
            ),
            missing_profile_record.raw_user_meta_data->>'first_name',
            missing_profile_record.raw_user_meta_data->>'last_name',
            missing_profile_record.raw_user_meta_data->>'company',
            now(),
            now()
        );
        
        created_profiles := created_profiles + 1;
    END LOOP;
    
    RAISE NOTICE 'Created % missing profiles for existing auth users', created_profiles;
END $$;


-- Step 4: Clean up workspace records that reference completely missing users
-- Set owner_id to NULL for workspaces whose owners don't exist in auth.users
DO $$
DECLARE
    orphaned_count INTEGER;
BEGIN
    UPDATE beekon_data.workspaces 
    SET owner_id = NULL 
    WHERE owner_id IS NOT NULL 
    AND owner_id NOT IN (SELECT id FROM auth.users);
    
    GET DIAGNOSTICS orphaned_count = ROW_COUNT;
    
    IF orphaned_count > 0 THEN
        RAISE NOTICE 'Set owner_id to NULL for % workspaces with missing auth users', orphaned_count;
    ELSE
        RAISE NOTICE 'No orphaned workspace records found';
    END IF;
END $$;

-- Step 5: Validate data integrity before applying foreign key constraint
DO $$ 
DECLARE 
    orphan_count INTEGER;
    total_workspaces_with_owner INTEGER;
BEGIN
    -- Count remaining orphaned workspaces
    SELECT COUNT(*) INTO orphan_count
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM beekon_data.profiles);
    
    -- Count total workspaces with owner_id
    SELECT COUNT(*) INTO total_workspaces_with_owner
    FROM beekon_data.workspaces
    WHERE owner_id IS NOT NULL;
    
    RAISE NOTICE 'Data validation: % workspaces with owner_id, % orphaned records', 
        total_workspaces_with_owner, orphan_count;
    
    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Cannot proceed: % orphaned workspace records remain', orphan_count;
    ELSE
        RAISE NOTICE 'Data validation passed: Ready to apply foreign key constraint';
    END IF;
END $$;

-- Step 6: Enable RLS on the new table
ALTER TABLE beekon_data.profiles ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for beekon_data.profiles
CREATE POLICY "Users can view their own profile" ON beekon_data.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON beekon_data.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON beekon_data.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Step 8: Create updated_at trigger for the new table
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON beekon_data.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 9: Update the handle_new_user function to use beekon_data.profiles
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

-- Step 10: Now safely update workspaces table foreign key constraint
-- Drop the existing foreign key constraint (if it exists)
ALTER TABLE beekon_data.workspaces 
DROP CONSTRAINT IF EXISTS workspaces_owner_id_fkey;

-- Add the new foreign key constraint pointing to beekon_data.profiles
ALTER TABLE beekon_data.workspaces
ADD CONSTRAINT workspaces_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES beekon_data.profiles(id) ON DELETE SET NULL;

-- Step 11: Create performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON beekon_data.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON beekon_data.profiles(workspace_id);

-- Step 12: Final verification
DO $$
DECLARE
    old_count INTEGER;
    new_count INTEGER;
    constraint_valid BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO old_count FROM public.profiles;
    SELECT COUNT(*) INTO new_count FROM beekon_data.profiles;
    
    -- Check if foreign key constraint is valid
    SELECT COUNT(*) = 0 INTO constraint_valid
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM beekon_data.profiles);
    
    RAISE NOTICE '=== MIGRATION COMPLETE ===';
    RAISE NOTICE 'Original profiles: %', old_count;
    RAISE NOTICE 'Migrated profiles: %', new_count;
    RAISE NOTICE 'Foreign key constraint valid: %', constraint_valid;
    
    IF NOT constraint_valid THEN
        RAISE EXCEPTION 'Foreign key constraint validation failed';
    END IF;
    
    RAISE NOTICE 'Profiles migration completed successfully!';
END $$;

COMMIT;

-- Note: The old public.profiles table is preserved for rollback purposes
-- After confirming the migration works correctly, you can manually drop it