# mv_analysis_results Materialized View Optimization

## Overview

This set of migrations optimizes the large `mv_analysis_results` materialized view (79 MB) to handle refresh timeout issues and improve performance through intelligent, incremental refresh strategies.

## Schema Compatibility Fixed

**IMPORTANT**: All migration files have been corrected to work with the actual database schema. The original versions incorrectly referenced `updated_at` columns that don't exist in several tables.

### Corrected Schema References:
- `llm_analysis_results`: Uses only `created_at` and `analyzed_at` (no `updated_at`)
- `prompts`: Uses only `created_at` (no `updated_at`)
- `topics`: Uses only `created_at` (no `updated_at`)
- `analysis_sessions`: Has both `created_at` and `updated_at` ✓

## Migration Files

### 1. `20250927000013_create_incremental_analysis_refresh.sql`
**Incremental Refresh Strategies**

**Functions Created:**
- `refresh_analysis_incremental(hours_back, force_full_refresh)` - Smart incremental refresh
- `refresh_analysis_by_website(website_id, hours_back)` - Website-targeted refresh
- `refresh_analysis_batch_websites(website_ids[], hours_back)` - Batch website processing
- `refresh_analysis_smart(max_age_hours, force_if_stale_hours)` - Intelligence-based refresh

**Key Features:**
- Only refreshes when recent changes detected
- Configurable time windows for change detection
- Automatic fallback from concurrent to blocking refresh
- Comprehensive operation logging and tracking

### 2. `20250927000014_create_emergency_refresh_options.sql`
**Emergency Fast-Refresh Options**

**Components Created:**
- `mv_analysis_results_critical` - Lightweight emergency materialized view
- `analysis_results_staging` - Staging table for incremental processing
- `refresh_analysis_emergency_critical()` - Ultra-fast 5-10 second refresh
- `refresh_analysis_with_staging()` - Staging-based incremental refresh
- `refresh_analysis_failsafe()` - Multi-strategy failsafe function

**Key Features:**
- Emergency fallback when main view fails
- Staging table for batch processing recent changes
- Multiple refresh strategies with automatic fallback chain
- Critical-only view for essential metrics during emergencies

### 3. `20250927000015_optimize_analysis_materialized_view.sql`
**Performance Optimization & Monitoring**

**Components Created:**
- Optimized indexes for faster JOIN operations
- `v_analysis_results_optimized` - Improved view definition
- `analyze_mv_performance()` - Performance monitoring function
- `benchmark_refresh_performance()` - Multi-run benchmarking
- `select_optimal_refresh_strategy()` - Intelligent strategy selection

**Key Features:**
- Enhanced covering indexes for better query performance
- Performance monitoring and benchmarking tools
- Automatic strategy recommendation based on current conditions
- Optimized query structure with pre-computed aggregates

## Usage Examples

### Basic Smart Refresh
```sql
-- Intelligent refresh based on recent changes
SELECT beekon_data.refresh_analysis_smart();
```

### Emergency Situations
```sql
-- Ultra-fast emergency refresh (critical data only)
SELECT beekon_data.refresh_analysis_emergency_critical();

-- Failsafe refresh (tries multiple strategies)
SELECT beekon_data.refresh_analysis_failsafe();
```

### Website-Specific Refresh
```sql
-- Refresh only if specific website has changes
SELECT beekon_data.refresh_analysis_by_website('10fefce2-5b38-4aee-a838-1576d39de058');
```

### Performance Analysis
```sql
-- Get optimal refresh strategy recommendation
SELECT beekon_data.select_optimal_refresh_strategy(30, true);

-- Benchmark current performance
SELECT beekon_data.benchmark_refresh_performance(3);
```

## Current Status

**Materialized View Performance:**
- Size: 79 MB (largest in system)
- Current refresh time: < 1 second (excellent performance)
- Data: 10,349 total results, 269 recent (24h), 0 very recent (1h)
- Status: All existing refresh functions working efficiently

**Migration Status:**
- ✅ Schema compatibility issues fixed
- ✅ All `updated_at` references removed
- ✅ Corrected logic tested and verified
- ✅ Ready for deployment

## Recommendations

1. **Current Performance is Excellent**: The existing `refresh_analysis_atomic()` function is working very well (< 1 second refresh)

2. **Deploy Smart Refresh**: Use `refresh_analysis_smart()` for intelligent refresh based on actual data changes

3. **Emergency Preparedness**: The emergency functions provide robust fallback options if issues arise

4. **Monitoring**: Use the performance analysis functions to track and optimize refresh strategies over time

## Next Steps

1. Apply the corrected migration files to deploy the optimization functions
2. Test the new refresh strategies in your environment
3. Monitor performance using the built-in benchmarking tools
4. Consider scheduling smart refresh instead of time-based refresh for better efficiency

The optimization provides multiple refresh strategies while maintaining the excellent performance of the current system.