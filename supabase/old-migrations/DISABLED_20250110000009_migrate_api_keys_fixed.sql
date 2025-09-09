-- Fixed Migration: Move api_keys table from public schema to beekon_data schema
-- This migration includes proper data validation for foreign key constraints

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

-- Step 2: Validate that all api_keys reference existing auth.users before migration
DO $$
DECLARE
    orphaned_api_keys INTEGER;
    total_api_keys INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_api_keys FROM public.api_keys;
    
    SELECT COUNT(*) INTO orphaned_api_keys
    FROM public.api_keys ak
    WHERE ak.user_id NOT IN (SELECT id FROM auth.users);
    
    RAISE NOTICE 'API Keys validation: total=%, orphaned=%', total_api_keys, orphaned_api_keys;
    
    IF orphaned_api_keys > 0 THEN
        RAISE NOTICE 'WARNING: % API keys reference non-existent auth users', orphaned_api_keys;
        RAISE NOTICE 'These will be skipped during migration to maintain referential integrity';
    ELSE
        RAISE NOTICE 'All API keys reference valid auth users - safe to migrate';
    END IF;
END $$;

-- Step 3: Copy data from public.api_keys to beekon_data.api_keys
-- Only migrate API keys that reference existing auth.users
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
  ak.id,
  ak.user_id,
  ak.name,
  ak.key_hash,
  ak.key_prefix,
  ak.created_at,
  ak.last_used_at,
  ak.is_active,
  ak.usage_count
FROM public.api_keys ak
WHERE ak.user_id IN (SELECT id FROM auth.users);

-- Step 4: Report on migration results
DO $$
DECLARE
    old_count INTEGER;
    new_count INTEGER;
    skipped_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO old_count FROM public.api_keys;
    SELECT COUNT(*) INTO new_count FROM beekon_data.api_keys;
    skipped_count := old_count - new_count;
    
    RAISE NOTICE 'API Keys migration: original=%, migrated=%, skipped=%', 
        old_count, new_count, skipped_count;
    
    IF skipped_count > 0 THEN
        RAISE NOTICE 'Skipped % API keys that referenced non-existent auth users', skipped_count;
    END IF;
END $$;

-- Step 5: Enable RLS on the new table
ALTER TABLE beekon_data.api_keys ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for beekon_data.api_keys
CREATE POLICY "Users can view their own API keys" ON beekon_data.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys" ON beekon_data.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" ON beekon_data.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON beekon_data.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Step 7: Create updated_at trigger for the new table
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON beekon_data.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 8: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON beekon_data.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON beekon_data.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON beekon_data.api_keys(user_id, is_active);

-- Step 9: Final validation - ensure all foreign key constraints will work
DO $$
DECLARE
    constraint_violations INTEGER;
BEGIN
    SELECT COUNT(*) INTO constraint_violations
    FROM beekon_data.api_keys ak
    WHERE ak.user_id NOT IN (SELECT id FROM auth.users);
    
    IF constraint_violations > 0 THEN
        RAISE EXCEPTION 'Foreign key constraint validation failed: % violations', constraint_violations;
    ELSE
        RAISE NOTICE 'Foreign key constraint validation passed - all API keys reference valid auth users';
    END IF;
    
    RAISE NOTICE 'API keys migration completed successfully!';
END $$;

COMMIT;

-- Note: The old public.api_keys table is preserved for rollback purposes
-- Any API keys that referenced non-existent auth users were not migrated
-- After confirming the migration works correctly, you can manually drop the old table