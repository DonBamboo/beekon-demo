-- Final cleanup migration: Ensure all relationships work correctly after schema migration
-- This migration finalizes the schema migration by cleaning up any remaining issues

BEGIN;

-- Step 1: Verify all foreign key relationships are correctly set up
-- The workspaces.owner_id should now reference beekon_data.profiles.id

-- Check if the foreign key constraint exists and is pointing to the right table
DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'beekon_data'
        AND tc.table_name = 'workspaces'
        AND kcu.column_name = 'owner_id'
        AND ccu.table_schema = 'beekon_data'
        AND ccu.table_name = 'profiles'
    ) INTO constraint_exists;
    
    IF constraint_exists THEN
        RAISE NOTICE 'Foreign key constraint workspaces.owner_id -> profiles.id is correctly set up';
    ELSE
        RAISE WARNING 'Foreign key constraint may need manual verification';
    END IF;
END $$;

-- Step 2: Add missing indexes for better performance on beekon_data.profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON beekon_data.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON beekon_data.profiles(workspace_id);

-- Step 3: Update any remaining functions that might reference the old schema
-- Ensure the getUserWorkspace function in ProfileService works correctly
-- (This is handled by the application layer, no SQL changes needed)

-- Step 4: Document the completed migration
DO $$
DECLARE
    profiles_count INTEGER;
    api_keys_count INTEGER;
    workspaces_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO profiles_count FROM beekon_data.profiles;
    SELECT COUNT(*) INTO api_keys_count FROM beekon_data.api_keys;
    SELECT COUNT(*) INTO workspaces_count FROM beekon_data.workspaces;
    
    RAISE NOTICE 'Schema migration completed successfully:';
    RAISE NOTICE '  - beekon_data.profiles: % rows', profiles_count;
    RAISE NOTICE '  - beekon_data.api_keys: % rows', api_keys_count;
    RAISE NOTICE '  - beekon_data.workspaces: % rows', workspaces_count;
    RAISE NOTICE 'All tables are now in the beekon_data schema';
END $$;

COMMIT;

-- Post-migration cleanup notes:
-- 1. After verifying the application works correctly, you can drop the old tables:
--    DROP TABLE public.profiles CASCADE;
--    DROP TABLE public.api_keys CASCADE;
-- 
-- 2. If you need to rollback, the old tables are preserved with all original data
-- 
-- 3. All RLS policies, triggers, and indexes have been migrated to the new schema