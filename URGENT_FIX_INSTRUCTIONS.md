# URGENT: Fix Dashboard 400 Bad Request Error

## Problem Identified ✅

The dashboard `get_dashboard_metrics` function has a **type mismatch error**:
- Function expects `INTEGER` in column 6
- Function returns `BIGINT` instead
- This causes the 400 Bad Request error in your browser console

## Root Cause
```
ERROR: structure of query does not match function result type
DETAIL: Returned type bigint does not match expected type integer in column 6
```

## Solution: Apply This Migration

**File:** `supabase/migrations/20250917000005_fix_dashboard_function_type_mismatch.sql`

### How to Apply:

1. **Via Supabase Dashboard:**
   - Go to your Supabase project → SQL Editor
   - Copy the contents of `20250917000005_fix_dashboard_function_type_mismatch.sql`
   - Paste and run the SQL

2. **Via Supabase CLI:**
   ```bash
   npx supabase db push
   ```

## What This Fixes:

✅ **Dashboard Metrics Function**: Changes return types from `INTEGER` to `BIGINT`
✅ **400 Bad Request Error**: Resolves type mismatch causing the error
✅ **Function Compatibility**: Ensures all COUNT() operations return consistent types

## Verification:

After applying the migration, test in SQL Editor:
```sql
SELECT * FROM beekon_data.get_dashboard_metrics(
    ARRAY['1fda486d-6e9e-408d-9f89-1ce66bd729d9']::UUID[],
    NOW() - INTERVAL '30 days',
    NOW()
);
```

Should return data without errors.

## Status of Other Issues:

✅ **JavaScript Scoping**: Fixed in `competitorAnalysisService.ts`
✅ **Missing Functions**: All required functions exist
✅ **Competitor Data**: `get_competitor_performance` function works correctly
❌ **Dashboard Function**: Needs this migration to fix type mismatch

## Expected Result:

After applying this migration:
- Dashboard page will load without 400 Bad Request errors
- All metrics will display correctly
- JavaScript errors in `competitorAnalysisService.ts` are already resolved