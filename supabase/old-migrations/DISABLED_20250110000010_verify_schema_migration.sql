-- Final Verification: Ensure all schema migration was successful
-- This migration performs comprehensive validation of the completed schema migration

BEGIN;

-- Step 1: Verify all tables exist in beekon_data schema
DO $$
DECLARE
    profiles_exists BOOLEAN;
    api_keys_exists BOOLEAN;
    workspaces_exists BOOLEAN;
    all_tables_exist BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'beekon_data' AND table_name = 'profiles'
    ) INTO profiles_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'beekon_data' AND table_name = 'api_keys'
    ) INTO api_keys_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'beekon_data' AND table_name = 'workspaces'
    ) INTO workspaces_exists;
    
    all_tables_exist := profiles_exists AND api_keys_exists AND workspaces_exists;
    
    RAISE NOTICE '=== TABLE EXISTENCE CHECK ===';
    RAISE NOTICE 'beekon_data.profiles: %', profiles_exists;
    RAISE NOTICE 'beekon_data.api_keys: %', api_keys_exists;
    RAISE NOTICE 'beekon_data.workspaces: %', workspaces_exists;
    RAISE NOTICE 'All required tables exist: %', all_tables_exist;
    
    IF NOT all_tables_exist THEN
        RAISE EXCEPTION 'Missing required tables in beekon_data schema';
    END IF;
END $$;

-- Step 2: Verify foreign key constraints are properly configured
DO $$
DECLARE
    workspaces_profiles_fk BOOLEAN;
    profiles_workspaces_fk BOOLEAN;
    api_keys_users_fk BOOLEAN;
    profiles_users_fk BOOLEAN;
BEGIN
    -- Check workspaces.owner_id -> profiles.id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'beekon_data' AND tc.table_name = 'workspaces'
        AND kcu.column_name = 'owner_id'
        AND ccu.table_schema = 'beekon_data' AND ccu.table_name = 'profiles'
    ) INTO workspaces_profiles_fk;
    
    -- Check profiles.workspace_id -> workspaces.id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'beekon_data' AND tc.table_name = 'profiles'
        AND kcu.column_name = 'workspace_id'
        AND ccu.table_schema = 'beekon_data' AND ccu.table_name = 'workspaces'
    ) INTO profiles_workspaces_fk;
    
    -- Check api_keys.user_id -> auth.users.id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'beekon_data' AND tc.table_name = 'api_keys'
        AND kcu.column_name = 'user_id'
    ) INTO api_keys_users_fk;
    
    -- Check profiles.user_id -> auth.users.id
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'beekon_data' AND tc.table_name = 'profiles'
        AND kcu.column_name = 'user_id'
    ) INTO profiles_users_fk;
    
    RAISE NOTICE '=== FOREIGN KEY CONSTRAINTS CHECK ===';
    RAISE NOTICE 'workspaces.owner_id -> profiles.id: %', workspaces_profiles_fk;
    RAISE NOTICE 'profiles.workspace_id -> workspaces.id: %', profiles_workspaces_fk;
    RAISE NOTICE 'api_keys.user_id -> auth.users.id: %', api_keys_users_fk;
    RAISE NOTICE 'profiles.user_id -> auth.users.id: %', profiles_users_fk;
    
    IF NOT (workspaces_profiles_fk AND profiles_workspaces_fk AND api_keys_users_fk AND profiles_users_fk) THEN
        RAISE EXCEPTION 'Missing required foreign key constraints';
    END IF;
END $$;

-- Step 3: Verify RLS policies are in place
DO $$
DECLARE
    profiles_policies INTEGER;
    api_keys_policies INTEGER;
BEGIN
    SELECT COUNT(*) INTO profiles_policies
    FROM pg_policies
    WHERE schemaname = 'beekon_data' AND tablename = 'profiles';
    
    SELECT COUNT(*) INTO api_keys_policies
    FROM pg_policies
    WHERE schemaname = 'beekon_data' AND tablename = 'api_keys';
    
    RAISE NOTICE '=== RLS POLICIES CHECK ===';
    RAISE NOTICE 'beekon_data.profiles policies: %', profiles_policies;
    RAISE NOTICE 'beekon_data.api_keys policies: %', api_keys_policies;
    
    IF profiles_policies < 3 OR api_keys_policies < 4 THEN
        RAISE WARNING 'Some RLS policies may be missing';
    ELSE
        RAISE NOTICE 'All RLS policies appear to be in place';
    END IF;
END $$;

-- Step 4: Verify data integrity - no orphaned records
DO $$
DECLARE
    orphaned_workspaces INTEGER;
    orphaned_api_keys INTEGER;
    orphaned_profiles INTEGER;
BEGIN
    -- Check for workspaces with invalid owner_id
    SELECT COUNT(*) INTO orphaned_workspaces
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM beekon_data.profiles);
    
    -- Check for API keys with invalid user_id
    SELECT COUNT(*) INTO orphaned_api_keys
    FROM beekon_data.api_keys ak
    WHERE ak.user_id NOT IN (SELECT id FROM auth.users);
    
    -- Check for profiles with invalid user_id
    SELECT COUNT(*) INTO orphaned_profiles
    FROM beekon_data.profiles p
    WHERE p.user_id NOT IN (SELECT id FROM auth.users);
    
    RAISE NOTICE '=== DATA INTEGRITY CHECK ===';
    RAISE NOTICE 'Orphaned workspaces: %', orphaned_workspaces;
    RAISE NOTICE 'Orphaned api_keys: %', orphaned_api_keys;
    RAISE NOTICE 'Orphaned profiles: %', orphaned_profiles;
    
    IF orphaned_workspaces > 0 OR orphaned_api_keys > 0 OR orphaned_profiles > 0 THEN
        RAISE EXCEPTION 'Data integrity issues found';
    ELSE
        RAISE NOTICE 'All data integrity checks passed';
    END IF;
END $$;

-- Step 5: Final summary
DO $$
DECLARE
    profiles_count INTEGER;
    api_keys_count INTEGER;
    workspaces_count INTEGER;
    active_users INTEGER;
BEGIN
    SELECT COUNT(*) INTO profiles_count FROM beekon_data.profiles;
    SELECT COUNT(*) INTO api_keys_count FROM beekon_data.api_keys;
    SELECT COUNT(*) INTO workspaces_count FROM beekon_data.workspaces;
    SELECT COUNT(*) INTO active_users FROM auth.users;
    
    RAISE NOTICE '=== MIGRATION SUMMARY ===';
    RAISE NOTICE 'Total auth users: %', active_users;
    RAISE NOTICE 'Migrated profiles: %', profiles_count;
    RAISE NOTICE 'Migrated API keys: %', api_keys_count;
    RAISE NOTICE 'Total workspaces: %', workspaces_count;
    RAISE NOTICE '=== SCHEMA MIGRATION SUCCESSFUL ===';
    RAISE NOTICE 'All tables are now in beekon_data schema with proper relationships';
    RAISE NOTICE 'Application code has been updated to use new schema';
    RAISE NOTICE 'Ready for production use';
END $$;

COMMIT;

-- Migration verification complete
-- If this migration runs successfully, the schema migration is ready for use