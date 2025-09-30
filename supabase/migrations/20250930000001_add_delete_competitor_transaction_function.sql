-- Migration: Add transaction-safe competitor deletion stored procedure
-- This function ensures atomic deletion of competitors and all related data
-- Date: 2025-09-30
-- Description: Implements robust, transaction-safe competitor deletion with CASCADE cleanup and audit logging

-- Create the transaction-safe deletion function
CREATE OR REPLACE FUNCTION beekon_data.delete_competitor_with_transaction(
  competitor_id_param UUID
) RETURNS JSONB AS $$
DECLARE
  competitor_info RECORD;
  deleted_analysis_count INTEGER;
  deleted_status_log_count INTEGER;
  result JSONB;
BEGIN
  -- Fetch competitor information before deletion (for logging/audit)
  SELECT
    id,
    competitor_name,
    competitor_domain,
    website_id,
    is_active
  INTO competitor_info
  FROM beekon_data.competitors
  WHERE id = competitor_id_param;

  -- Check if competitor exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Competitor not found with id: %', competitor_id_param;
  END IF;

  -- Log the deletion operation to system_logs
  INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source)
  VALUES (
    'INFO',
    'Starting competitor deletion',
    jsonb_build_object(
      'competitor_id', competitor_id_param,
      'competitor_name', competitor_info.competitor_name,
      'competitor_domain', competitor_info.competitor_domain,
      'website_id', competitor_info.website_id,
      'was_active', competitor_info.is_active
    ),
    'delete_competitor_transaction'
  );

  -- Step 1: Delete all competitor analysis results
  -- This will automatically cascade due to FK constraint: ON DELETE CASCADE
  DELETE FROM beekon_data.competitor_analysis_results
  WHERE competitor_id = competitor_id_param;

  GET DIAGNOSTICS deleted_analysis_count = ROW_COUNT;

  -- Step 2: Delete all competitor status logs
  -- This will automatically cascade due to FK constraint: ON DELETE CASCADE
  DELETE FROM beekon_data.competitor_status_log
  WHERE competitor_id = competitor_id_param;

  GET DIAGNOSTICS deleted_status_log_count = ROW_COUNT;

  -- Step 3: Hard delete the competitor record
  -- This is a permanent deletion (not soft delete)
  DELETE FROM beekon_data.competitors
  WHERE id = competitor_id_param;

  -- Build result summary
  result := jsonb_build_object(
    'success', true,
    'competitor_id', competitor_id_param,
    'competitor_name', competitor_info.competitor_name,
    'competitor_domain', competitor_info.competitor_domain,
    'website_id', competitor_info.website_id,
    'deleted_analysis_results', deleted_analysis_count,
    'deleted_status_logs', deleted_status_log_count,
    'timestamp', NOW()
  );

  -- Log successful deletion
  INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source)
  VALUES (
    'INFO',
    'Competitor deletion completed successfully',
    result,
    'delete_competitor_transaction'
  );

  -- Return the result summary
  RETURN result;

EXCEPTION WHEN OTHERS THEN
  -- Log the error
  INSERT INTO beekon_data.system_logs (log_level, message, additional_data, source)
  VALUES (
    'ERROR',
    'Competitor deletion failed: ' || SQLERRM,
    jsonb_build_object(
      'competitor_id', competitor_id_param,
      'error_message', SQLERRM,
      'error_detail', SQLSTATE
    ),
    'delete_competitor_transaction'
  );

  -- Re-raise the exception to trigger rollback
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the function
COMMENT ON FUNCTION beekon_data.delete_competitor_with_transaction IS
'Transaction-safe competitor deletion that ensures atomic removal of competitor and all related data.
Includes audit logging and comprehensive error handling. All deletions are wrapped in a transaction
that will rollback if any step fails.';

-- Grant execute permission to authenticated users (adjust as needed for your RLS policies)
GRANT EXECUTE ON FUNCTION beekon_data.delete_competitor_with_transaction TO authenticated;