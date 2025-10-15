-- =========================================================================
-- ADD topic_id COLUMN TO analysis_sessions TABLE
-- =========================================================================
--
-- Problem: Currently topic information is stored in the configuration JSONB field,
-- which makes querying inefficient and doesn't provide referential integrity.
--
-- Solution: Add a proper topic_id foreign key column to establish a normalized
-- relationship with the topics table.
--
-- Benefits:
-- - Direct foreign key relationship for efficient JOINs and indexes
-- - Referential integrity with CASCADE delete
-- - Type-safe access without JSONB extraction
-- - Simplified queries and better performance
-- =========================================================================

-- =========================================================================
-- STEP 1: ADD topic_id COLUMN
-- =========================================================================

ALTER TABLE beekon_data.analysis_sessions
ADD COLUMN topic_id UUID REFERENCES beekon_data.topics(id) ON DELETE CASCADE;

-- =========================================================================
-- STEP 2: POPULATE topic_id FROM EXISTING configuration JSONB
-- =========================================================================

-- Extract topic_id from configuration.topic.topicId and populate the new column
UPDATE beekon_data.analysis_sessions
SET topic_id = (configuration->'topic'->>'topicId')::UUID
WHERE configuration->'topic'->>'topicId' IS NOT NULL
  AND configuration->'topic'->>'topicId' != 'null'
  AND configuration->'topic'->>'topicId' != '';

-- =========================================================================
-- STEP 3: CREATE INDEX FOR PERFORMANCE
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_analysis_sessions_topic_id
ON beekon_data.analysis_sessions(topic_id);

-- Create composite index for common queries (website + topic)
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_website_topic
ON beekon_data.analysis_sessions(website_id, topic_id);

-- =========================================================================
-- STEP 4: VALIDATE DATA MIGRATION
-- =========================================================================

-- Check how many sessions have topic_id populated
DO $$
DECLARE
  total_sessions INTEGER;
  sessions_with_topic INTEGER;
  sessions_without_topic INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_sessions
  FROM beekon_data.analysis_sessions;

  SELECT COUNT(*) INTO sessions_with_topic
  FROM beekon_data.analysis_sessions
  WHERE topic_id IS NOT NULL;

  SELECT COUNT(*) INTO sessions_without_topic
  FROM beekon_data.analysis_sessions
  WHERE topic_id IS NULL;

  -- Log the results
  INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source, created_at)
  VALUES (
    'INFO',
    format('Migration complete: %s total sessions, %s with topic_id, %s without',
      total_sessions, sessions_with_topic, sessions_without_topic),
    jsonb_build_object(
      'total_sessions', total_sessions,
      'sessions_with_topic', sessions_with_topic,
      'sessions_without_topic', sessions_without_topic,
      'migration_success_rate',
        CASE WHEN total_sessions > 0
          THEN ROUND((sessions_with_topic::NUMERIC / total_sessions) * 100, 2)
          ELSE 100
        END
    ),
    'migration_20251016000001',
    NOW()
  );
END $$;

-- =========================================================================
-- STEP 5: ADD COMMENT
-- =========================================================================

COMMENT ON COLUMN beekon_data.analysis_sessions.topic_id IS
'Foreign key to topics table. Each analysis session is associated with exactly one topic. Extracted from configuration JSONB for better performance and referential integrity.';

-- =========================================================================
-- LOG COMPLETION
-- =========================================================================

INSERT INTO beekon_data.system_logs (log_level, message, source, created_at)
VALUES (
  'INFO',
  'Successfully added topic_id column to analysis_sessions table with foreign key constraint and indexes',
  'migration_20251016000001',
  NOW()
)
ON CONFLICT DO NOTHING;
