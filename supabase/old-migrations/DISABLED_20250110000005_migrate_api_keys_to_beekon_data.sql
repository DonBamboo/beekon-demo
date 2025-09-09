-- Migration: Move api_keys table from public schema to beekon_data schema
-- This migration preserves all data, relationships, RLS policies, triggers, and indexes

BEGIN;

-- Step 1: Create the api_keys table in beekon_data schema
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
  UNIQUE(user_id, name)
);

-- Step 2: Copy all data from public.api_keys to beekon_data.api_keys
INSERT INTO beekon_data.api_keys (
  id,
  user_id,
  name,
  key_hash,
  key_prefix,
  created_at,
  last_used_at,
  is_active,
  usage_count
)
SELECT 
  id,
  user_id,
  name,
  key_hash,
  key_prefix,
  created_at,
  last_used_at,
  is_active,
  usage_count
FROM public.api_keys;

-- Step 3: Enable RLS on the new table
ALTER TABLE beekon_data.api_keys ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for beekon_data.api_keys
CREATE POLICY "Users can view their own API keys" ON beekon_data.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys" ON beekon_data.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" ON beekon_data.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON beekon_data.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Step 5: Create updated_at trigger for the new table
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON beekon_data.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 6: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON beekon_data.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON beekon_data.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON beekon_data.api_keys(user_id, is_active);

-- Step 7: Verify data migration
DO $$
DECLARE
    old_count INTEGER;
    new_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_count FROM public.api_keys;
    SELECT COUNT(*) INTO new_count FROM beekon_data.api_keys;
    
    IF old_count != new_count THEN
        RAISE EXCEPTION 'Data migration failed: old_count=%, new_count=%', old_count, new_count;
    END IF;
    
    RAISE NOTICE 'API keys migration successful: % rows migrated', new_count;
END $$;

-- Step 8: Drop the old public.api_keys table (commented out for safety)
-- Uncomment the following lines after verifying the migration is successful:
-- DROP TRIGGER IF EXISTS update_api_keys_updated_at ON public.api_keys;
-- DROP TABLE public.api_keys CASCADE;

COMMIT;

-- Note: The old public.api_keys table is preserved for rollback purposes
-- After confirming the migration works correctly, you can manually drop it with:
-- DROP TABLE public.api_keys CASCADE;