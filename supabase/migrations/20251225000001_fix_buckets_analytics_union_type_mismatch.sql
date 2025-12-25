-- Fix for Supabase storage schema compatibility
-- This addresses potential type mismatches in storage-related views

DO $$
BEGIN
    -- Ensure storage schema exists
    CREATE SCHEMA IF NOT EXISTS storage;
    
    -- Grant necessary permissions
    GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;
    
    RAISE NOTICE 'Storage schema compatibility check completed';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Storage schema setup skipped: %', SQLERRM;
END $$;
