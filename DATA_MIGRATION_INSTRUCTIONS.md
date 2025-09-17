# Data Migration Instructions

## Migrating All Data Including LLM Analysis Results and Auth Users

The current migration files successfully recreate the database schema and foundation data (workspaces, profiles, websites), but are missing:
1. **Auth Users** - Required for login functionality
2. **LLM Analysis Results** - The actual analysis data
3. **Competitor Analysis Results** - Competitive analysis data

## Step 1: Export Data from Remote Database

Use the provided export script to extract data from your remote/source database:

```bash
# No additional dependencies needed (@supabase/supabase-js is already installed)

# Run the export script
node export_remote_data.js https://apzyfnqlajvbgaejfzfm.supabase.co <YOUR_SERVICE_ROLE_KEY>
```

This will create:
- `auth_users_export.sql` - All user authentication data
- `llm_analysis_results_export.sql` - All analysis results data

## Step 2: Add Exported Data to Migration Files

### Option A: Add to Existing Migration File (Recommended)

Edit `supabase/migrations/002_recreate_all_data.sql`:

1. **Add auth.users data FIRST** (before profiles):
```sql
-- Add this section after line 27 (before profiles section)
-- =============================================
-- AUTH USERS DATA (Required for profiles FK)
-- =============================================
\echo 'Loading auth.users data...'

-- Disable RLS and foreign key checks for auth schema
SET session_replication_role = replica;

-- Insert auth.users data here
-- (Copy content from auth_users_export.sql)

-- Re-enable checks
SET session_replication_role = DEFAULT;
```

2. **Add llm_analysis_results data** (after websites section):
```sql
-- Add this section after line 200+ (after websites section)
-- =============================================
-- LLM ANALYSIS RESULTS DATA
-- =============================================
\echo 'Loading llm_analysis_results data...'

-- Insert llm_analysis_results data here
-- (Copy content from llm_analysis_results_export.sql)
```

### Option B: Create New Migration File

Create `supabase/migrations/004_import_analysis_data.sql`:

```sql
-- =============================================
-- IMPORT ALL ANALYSIS AND USER DATA
-- =============================================

-- Set replica mode to avoid constraint issues
SET session_replication_role = replica;

-- Import auth.users (required for profile foreign keys)
\echo 'Importing auth.users data...'
-- (Insert auth_users_export.sql content here)

-- Import llm_analysis_results
\echo 'Importing llm_analysis_results data...'
-- (Insert llm_analysis_results_export.sql content here)

-- Reset session mode
SET session_replication_role = DEFAULT;

\echo 'Data import completed successfully!'
```

## Step 3: Test Migration

```bash
# Reset and test the complete migration
npx supabase db reset

# Check that all data is present
npx supabase db inspect
```

## Important Notes

1. **Order Matters**: Auth users must be imported before profiles due to foreign key constraints
2. **RLS Disabled**: Use `session_replication_role = replica` to bypass security policies during import
3. **Constraints**: The migration already handles check constraints properly
4. **Service Role**: You need the service role key (not anon key) to access auth.users data

## Verification Commands

After migration, verify data:

```sql
-- Check user count
SELECT COUNT(*) FROM auth.users;

-- Check analysis results count
SELECT COUNT(*) FROM beekon_data.llm_analysis_results;

-- Check profiles are linked to users
SELECT COUNT(*) FROM beekon_data.profiles p
JOIN auth.users u ON p.user_id = u.id;
```

## Files Created

- ✅ `export_remote_data.js` - Export script (ES module format)
- ✅ `DATA_MIGRATION_INSTRUCTIONS.md` - This instruction file
- 📝 `auth_users_export.sql` - Generated after running export script
- 📝 `llm_analysis_results_export.sql` - Generated after running export script

## Technical Notes

- **ES Module Support**: The script uses modern ES module syntax (`import/export`) to match the project configuration
- **No Additional Dependencies**: Uses existing `@supabase/supabase-js` dependency from package.json
- **Service Role Required**: Admin access needed to read `auth.users` table

## Next Steps

1. Run the export script to generate the SQL files
2. Add the exported data to migration file 002 or create new migration 004
3. Test the complete migration with `npx supabase db reset`
4. Verify all users can log in and all analysis data is available