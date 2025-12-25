-- Direct fix for storage buckets UNION type mismatch
-- Drop the problematic view and recreate with proper type casting

DO $$
BEGIN
    -- Drop any existing problematic views
    DROP VIEW IF EXISTS storage.all_buckets CASCADE;
    
    -- Check if buckets_analytics table exists and has the problematic structure
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'buckets_analytics'
    ) THEN
        -- Create a fixed view with proper type casting
        CREATE VIEW storage.all_buckets AS
        SELECT 
            id::text,
            name::text,
            public,
            owner,
            created_at,
            updated_at,
            file_size_limit,
            allowed_mime_types,
            'bucket'::text as type
        FROM storage.buckets
        UNION ALL
        SELECT 
            id::text,
            id::text as name,
            null::boolean as public,
            null::uuid as owner,
            created_at,
            updated_at,
            null::bigint as file_size_limit,
            null::text[] as allowed_mime_types,
            'analytics'::text as type
        FROM storage.buckets_analytics;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    -- If we can't fix it, just ensure the problematic view doesn't exist
    DROP VIEW IF EXISTS storage.all_buckets CASCADE;
    RAISE NOTICE 'Removed problematic storage view: %', SQLERRM;
END $$;
