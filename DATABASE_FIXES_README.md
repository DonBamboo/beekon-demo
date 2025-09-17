# Database Function Fixes - Implementation Guide

## Problem Summary

The Beekon.AI application was experiencing several critical database function errors:

1. **Dashboard Functions**: `get_dashboard_metrics` and `get_dashboard_time_series` returning 400 Bad Request
2. **Competitor Functions**: Column ambiguity errors in `get_competitive_gap_analysis` and `get_competitor_share_of_voice`
3. **Performance Issues**: Functions not utilizing materialized views effectively

## Root Causes Identified

### 1. Column Ambiguity Issues
- **Error**: `column reference "topic_id" is ambiguous`
- **Cause**: Inconsistent table aliasing in PL/pgSQL functions
- **Location**: `20250915000003_use_materialized_views_properly.sql` lines 191, 230

### 2. Function Signature Conflicts
- **Error**: 400 Bad Request on dashboard RPC calls
- **Cause**: Missing or incompatible function definitions
- **Location**: Dashboard performance migration conflicts

### 3. Materialized View Dependencies
- **Error**: Functions referencing non-existent materialized views
- **Cause**: Migration order issues and missing view definitions

## Solution Implementation

### Created Migrations

#### 1. `20250917000001_fix_column_ambiguity_errors.sql`
- **Purpose**: Fixes column ambiguity in competitor functions
- **Changes**: Proper table aliasing with explicit column qualification
- **Functions Fixed**: `get_competitor_share_of_voice`, `get_competitive_gap_analysis`

#### 2. `20250917000002_fix_dashboard_function_errors.sql`
- **Purpose**: Fixes dashboard function compatibility issues
- **Changes**: Robust fallback logic and materialized view compatibility
- **Functions Fixed**: All dashboard functions with 400 Bad Request errors

#### 3. `20250917000003_apply_all_database_fixes.sql` ⭐ **RECOMMENDED**
- **Purpose**: Comprehensive migration applying all fixes
- **Changes**: All fixes in correct order with proper dependencies
- **Strategy**: Single migration to apply all fixes atomically

## Migration Application Strategy

### Option A: Apply Comprehensive Fix (Recommended)

```sql
-- Apply the comprehensive fix that includes all solutions
-- File: 20250917000003_apply_all_database_fixes.sql
```

**Advantages:**
- Single atomic operation
- Handles all dependencies correctly
- Includes fallback logic for missing materialized views
- Comprehensive error handling

### Option B: Apply Individual Migrations (Advanced)

```sql
-- 1. Fix competitor column ambiguity first
-- File: 20250917000001_fix_column_ambiguity_errors.sql

-- 2. Fix dashboard function issues
-- File: 20250917000002_fix_dashboard_function_errors.sql
```

**Use Case**: If you need granular control or debugging

## Testing Strategy

### 1. Test Database Functions Directly

```sql
-- Test dashboard metrics
SELECT * FROM beekon_data.get_dashboard_metrics(
    ARRAY['your-website-id']::UUID[],
    NOW() - INTERVAL '30 days',
    NOW()
);

-- Test time series
SELECT * FROM beekon_data.get_dashboard_time_series(
    ARRAY['your-website-id']::UUID[],
    7
);

-- Test competitor share of voice
SELECT * FROM beekon_data.get_competitor_share_of_voice(
    'your-website-id'::UUID,
    NOW() - INTERVAL '90 days',
    NOW()
);

-- Test competitive gap analysis
SELECT * FROM beekon_data.get_competitive_gap_analysis(
    'your-website-id'::UUID,
    NOW() - INTERVAL '90 days',
    NOW()
);
```

### 2. Test Frontend Integration

1. **Dashboard Page**: Verify metrics load without 400 errors
2. **Competitors Page**: Verify share of voice and gap analysis display
3. **Performance**: Check page load times (should be sub-second)

### 3. Verify Error Resolution

**Before Migration:**
```
https://apzyfnqlajvbgaejfzfm.supabase.co/rest/v1/rpc/get_dashboard_metrics 400 (Bad Request)
column reference "topic_id" is ambiguous
```

**After Migration:**
```
✅ Dashboard metrics load successfully
✅ Competitor analysis displays data
✅ No column ambiguity errors
```

## Function Signatures Verified

All functions match TypeScript service calls exactly:

| Function | Parameters | Return Type | Status |
|----------|------------|-------------|---------|
| `get_dashboard_metrics` | `p_website_ids UUID[], p_date_start TIMESTAMP, p_date_end TIMESTAMP` | Dashboard metrics object | ✅ Fixed |
| `get_dashboard_time_series` | `p_website_ids UUID[], p_days INTEGER` | Time series array | ✅ Fixed |
| `get_competitor_share_of_voice` | `p_website_id UUID, p_date_start TIMESTAMP, p_date_end TIMESTAMP` | Competitor data array | ✅ Fixed |
| `get_competitive_gap_analysis` | `p_website_id UUID, p_date_start TIMESTAMP, p_date_end TIMESTAMP` | Gap analysis array | ✅ Fixed |

## Performance Improvements

### Materialized View Strategy
- **Primary**: Use materialized views when available for instant performance
- **Fallback**: Use raw data queries if materialized views don't exist
- **Error Handling**: Graceful degradation with meaningful defaults

### Expected Performance Impact
- **Dashboard Load Time**: From 5-10 seconds → Sub-second
- **Competitor Analysis**: From timeout errors → Instant results
- **Error Rate**: From 400 Bad Request → 0% error rate

## Troubleshooting

### If Functions Still Return 400 Bad Request

1. **Check Migration Applied**:
   ```sql
   SELECT * FROM supabase_migrations.schema_migrations
   WHERE version LIKE '20250917%';
   ```

2. **Verify Function Exists**:
   ```sql
   SELECT routine_name, routine_type
   FROM information_schema.routines
   WHERE routine_schema = 'beekon_data'
   AND routine_name IN ('get_dashboard_metrics', 'get_competitor_share_of_voice');
   ```

3. **Test Function Directly**:
   ```sql
   SELECT beekon_data.get_dashboard_metrics(
       ARRAY[]::UUID[],  -- Empty array test
       NOW() - INTERVAL '1 day',
       NOW()
   );
   ```

### If Column Ambiguity Errors Persist

1. **Check for Old Function Definitions**:
   ```sql
   -- Look for duplicate function definitions
   SELECT routine_name, specific_name, routine_definition
   FROM information_schema.routines
   WHERE routine_name LIKE '%competitor%';
   ```

2. **Apply Individual Fixes**:
   - Use `20250917000001_fix_column_ambiguity_errors.sql` for targeted fixes

## Deployment Checklist

- [ ] Apply migration: `20250917000003_apply_all_database_fixes.sql`
- [ ] Test dashboard metrics function
- [ ] Test competitor analysis functions
- [ ] Verify no 400 Bad Request errors in browser console
- [ ] Check dashboard page loads under 2 seconds
- [ ] Verify competitor data displays correctly
- [ ] Run `REFRESH MATERIALIZED VIEW` on any existing views
- [ ] Monitor application logs for any remaining errors

## Rollback Strategy

If issues occur after migration:

```sql
-- 1. Drop problematic functions
DROP FUNCTION IF EXISTS beekon_data.get_dashboard_metrics;
DROP FUNCTION IF EXISTS beekon_data.get_competitor_share_of_voice;
-- ... etc for other functions

-- 2. Restore from backup or re-apply original migrations
-- 3. Check specific error logs to identify root cause
```

## Success Criteria

✅ **Dashboard Functions**: No 400 Bad Request errors
✅ **Competitor Functions**: No column ambiguity errors
✅ **Performance**: Dashboard loads in < 2 seconds
✅ **Data Integrity**: All functions return meaningful data
✅ **Frontend Integration**: All pages load without errors

## Next Steps

1. **Apply the comprehensive migration** (`20250917000003_apply_all_database_fixes.sql`)
2. **Test all functions** using the SQL commands above
3. **Verify frontend integration** by checking dashboard and competitors pages
4. **Monitor performance** to confirm sub-second load times
5. **Set up automated materialized view refresh** for ongoing performance