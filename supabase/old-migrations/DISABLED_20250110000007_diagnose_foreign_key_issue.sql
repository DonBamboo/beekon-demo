-- Diagnostic migration: Identify and analyze foreign key constraint issues
-- This migration helps understand the data integrity problems before fixing them

BEGIN;

-- Step 1: Analyze current data state
DO $$
DECLARE
    total_workspaces INTEGER;
    workspaces_with_owner INTEGER;
    total_profiles INTEGER;
    orphaned_workspaces INTEGER;
    missing_profiles_count INTEGER;
BEGIN
    -- Count total workspaces
    SELECT COUNT(*) INTO total_workspaces FROM beekon_data.workspaces;
    
    -- Count workspaces with owner_id set
    SELECT COUNT(*) INTO workspaces_with_owner 
    FROM beekon_data.workspaces 
    WHERE owner_id IS NOT NULL;
    
    -- Count total profiles  
    SELECT COUNT(*) INTO total_profiles FROM public.profiles;
    
    -- Count orphaned workspaces (owner_id not in profiles)
    SELECT COUNT(*) INTO orphaned_workspaces
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM public.profiles);
    
    -- Count missing profiles (workspace owners without profile records)
    SELECT COUNT(DISTINCT w.owner_id) INTO missing_profiles_count
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM public.profiles);
    
    RAISE NOTICE '=== DATA ANALYSIS RESULTS ===';
    RAISE NOTICE 'Total workspaces: %', total_workspaces;
    RAISE NOTICE 'Workspaces with owner_id: %', workspaces_with_owner;
    RAISE NOTICE 'Total profiles: %', total_profiles;
    RAISE NOTICE 'Orphaned workspaces: %', orphaned_workspaces;
    RAISE NOTICE 'Missing profile records: %', missing_profiles_count;
    
    IF orphaned_workspaces > 0 THEN
        RAISE NOTICE 'ACTION REQUIRED: % workspace records reference non-existent profiles', orphaned_workspaces;
    ELSE
        RAISE NOTICE 'DATA INTEGRITY: All workspace owner_id values have corresponding profiles';
    END IF;
END $$;

-- Step 2: List specific orphaned workspace records for investigation
DO $$
DECLARE
    workspace_record RECORD;
    count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== ORPHANED WORKSPACE DETAILS ===';
    
    FOR workspace_record IN 
        SELECT w.id, w.name, w.owner_id, w.created_at
        FROM beekon_data.workspaces w
        WHERE w.owner_id IS NOT NULL
        AND w.owner_id NOT IN (SELECT id FROM public.profiles)
        ORDER BY w.created_at
        LIMIT 10  -- Limit to first 10 for readability
    LOOP
        count := count + 1;
        RAISE NOTICE 'Orphaned workspace %: id=%, name=%, owner_id=%, created=%', 
            count, workspace_record.id, workspace_record.name, workspace_record.owner_id, workspace_record.created_at;
    END LOOP;
    
    IF count = 0 THEN
        RAISE NOTICE 'No orphaned workspace records found';
    ELSIF count = 10 THEN
        RAISE NOTICE '... (showing first 10 records only)';
    END IF;
END $$;

-- Step 3: Check if owner_id values exist in auth.users table
DO $$
DECLARE
    auth_users_exist INTEGER;
    orphaned_in_auth INTEGER;
BEGIN
    -- Count how many orphaned workspace owners exist in auth.users
    SELECT COUNT(DISTINCT w.owner_id) INTO auth_users_exist
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM public.profiles)
    AND w.owner_id IN (SELECT id FROM auth.users);
    
    -- Count how many are completely missing from auth.users
    SELECT COUNT(DISTINCT w.owner_id) INTO orphaned_in_auth
    FROM beekon_data.workspaces w
    WHERE w.owner_id IS NOT NULL
    AND w.owner_id NOT IN (SELECT id FROM public.profiles)
    AND w.owner_id NOT IN (SELECT id FROM auth.users);
    
    RAISE NOTICE '=== AUTH.USERS ANALYSIS ===';
    RAISE NOTICE 'Workspace owners that exist in auth.users: %', auth_users_exist;
    RAISE NOTICE 'Workspace owners missing from auth.users: %', orphaned_in_auth;
    
    IF auth_users_exist > 0 THEN
        RAISE NOTICE 'SOLUTION: Create profiles for % existing auth users', auth_users_exist;
    END IF;
    
    IF orphaned_in_auth > 0 THEN
        RAISE NOTICE 'ISSUE: % workspace owners do not exist in auth.users', orphaned_in_auth;
    END IF;
END $$;

-- Step 4: Provide recommended fix strategy
DO $$
BEGIN
    RAISE NOTICE '=== RECOMMENDED FIX STRATEGY ===';
    RAISE NOTICE '1. Create missing profiles for workspace owners that exist in auth.users';
    RAISE NOTICE '2. Set owner_id to NULL for workspaces with completely missing users';
    RAISE NOTICE '3. Apply foreign key constraint after data cleanup';
    RAISE NOTICE '4. Monitor for future data integrity issues';
END $$;

COMMIT;

-- This diagnostic migration is safe and read-only
-- Use the output to determine the appropriate fix strategy