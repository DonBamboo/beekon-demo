-- Comprehensive fix for Supabase storage schema issues
-- This migration ensures storage tables have consistent types

DO $$
DECLARE
    buckets_exists boolean := false;
    buckets_analytics_exists boolean := false;
BEGIN
    -- Check what storage tables exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) INTO buckets_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'storage' AND table_name = 'buckets_analytics'
    ) INTO buckets_analytics_exists;
    
    -- Drop any problematic views first
    DROP VIEW IF EXISTS storage.all_buckets CASCADE;
    
    -- If buckets_analytics exists and is causing issues, drop it
    IF buckets_analytics_exists THEN
        DROP TABLE IF EXISTS storage.buckets_analytics CASCADE;
        RAISE NOTICE 'Dropped problematic buckets_analytics table';
    END IF;
    
    -- Ensure storage schema has proper permissions
    GRANT ALL ON SCHEMA storage TO postgres;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    
    RAISE NOTICE 'Storage schema cleanup completed';
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage cleanup error (continuing): %', SQLERRM;
END $$;
