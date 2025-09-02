-- =================================================================
-- Add Country Fields to Website Settings JSONB Defaults
-- =================================================================
-- This migration adds country_code and country_name fields to the 
-- default JSONB structure in the website_settings table and updates
-- existing records to include these fields.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. UPDATE DEFAULT JSONB STRUCTURE
-- =================================================================

-- Update the default JSONB structure to include country fields
ALTER TABLE beekon_data.website_settings 
ALTER COLUMN settings SET DEFAULT '{
  "analysis_frequency": "weekly",
  "auto_analysis": true,
  "notifications": true,
  "competitor_tracking": false,
  "weekly_reports": true,
  "show_in_dashboard": true,
  "priority_level": "medium",
  "api_access": false,
  "data_retention": "90",
  "export_enabled": true,
  "country_code": null,
  "country_name": null
}';

-- =================================================================
-- 2. UPDATE EXISTING RECORDS
-- =================================================================

-- Update existing website_settings records to include country fields
-- if they don't already have them
UPDATE beekon_data.website_settings 
SET settings = settings || '{"country_code": null, "country_name": null}'::jsonb
WHERE NOT (settings ? 'country_code') OR NOT (settings ? 'country_name');

-- =================================================================
-- 3. VERIFICATION
-- =================================================================

-- Verify the changes
DO $$
DECLARE
  updated_count INTEGER;
  total_count INTEGER;
BEGIN
  -- Count total records
  SELECT COUNT(*) INTO total_count 
  FROM beekon_data.website_settings;
  
  -- Count records with country fields
  SELECT COUNT(*) INTO updated_count 
  FROM beekon_data.website_settings 
  WHERE (settings ? 'country_code') AND (settings ? 'country_name');
  
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Website Settings Country Fields Migration Completed';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Total website_settings records: %', total_count;
  RAISE NOTICE 'Records with country fields: %', updated_count;
  
  IF updated_count = total_count THEN
    RAISE NOTICE '✓ All records successfully updated with country fields';
  ELSE
    RAISE WARNING '⚠ Some records may not have been updated properly';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Default JSONB structure now includes:';
  RAISE NOTICE '  ✓ country_code (ISO 3166-1 alpha-3)';
  RAISE NOTICE '  ✓ country_name (full country name)';
  RAISE NOTICE '=================================================================';
END $$;

COMMIT;

-- =================================================================
-- MIGRATION NOTES
-- =================================================================
/*

WHAT THIS MIGRATION DOES:
==========================
1. Updates the default JSONB structure for new website_settings records
   to include country_code and country_name fields
2. Updates all existing website_settings records to include these fields
   with null values if they don't already exist
3. Provides verification output to confirm successful migration

ROLLBACK PLAN:
==============
To rollback this migration (if needed):

-- Remove country fields from existing records
UPDATE beekon_data.website_settings 
SET settings = settings - 'country_code' - 'country_name';

-- Restore original default JSONB structure
ALTER TABLE beekon_data.website_settings 
ALTER COLUMN settings SET DEFAULT '{
  "analysis_frequency": "weekly",
  "auto_analysis": true,
  "notifications": true,
  "competitor_tracking": false,
  "weekly_reports": true,
  "show_in_dashboard": true,
  "priority_level": "medium",
  "api_access": false,
  "data_retention": "90",
  "export_enabled": true
}';

USAGE:
======
After this migration, the CountrySelect component will be able to:
- Save country_code and country_name to website_settings.settings JSONB
- Retrieve country information from existing website settings
- Handle both new and existing websites consistently

The websiteSettingsService.ts functions have been updated to properly
handle these fields in the JSONB column.

*/