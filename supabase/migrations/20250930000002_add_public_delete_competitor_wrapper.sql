-- Create a public schema wrapper for the delete_competitor_with_transaction function
-- This allows the Supabase JavaScript client to call the function via RPC
-- The actual implementation remains in beekon_data schema

CREATE OR REPLACE FUNCTION public.delete_competitor_with_transaction(
  competitor_id_param UUID
) RETURNS JSONB AS $$
BEGIN
  -- Call the actual implementation in beekon_data schema
  RETURN beekon_data.delete_competitor_with_transaction(competitor_id_param);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the wrapper
COMMENT ON FUNCTION public.delete_competitor_with_transaction IS
'Public schema wrapper for beekon_data.delete_competitor_with_transaction.
Allows Supabase JavaScript client to call the function via RPC, since the JS client
only searches for RPC functions in the public schema.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_competitor_with_transaction TO authenticated;