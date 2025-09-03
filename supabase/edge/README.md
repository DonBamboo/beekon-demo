# Supabase Edge Functions - Competitor Views Refresh

This directory contains the configuration and documentation for Supabase Edge Functions that handle automated competitor analysis data refresh.

## Overview

The `refresh-competitor-views` Edge Function runs on a scheduled basis to refresh materialized views that power the competitive analysis dashboard. This ensures that competitor data remains fresh without requiring expensive real-time refreshes.

## Functions

### `refresh-competitor-views`

**Purpose**: Refreshes all competitor-related materialized views every hour to ensure data freshness.

**Materialized Views Refreshed**:
- `mv_competitor_performance` - Competitor performance metrics
- `mv_competitor_daily_metrics` - Daily time series data
- `mv_competitor_share_of_voice` - Share of voice calculations
- `mv_competitive_gap_analysis` - Competitive gap analysis

**Schedule**: Recommended to run every hour (`0 * * * *`)

## Setup Instructions

### 1. Deploy the Edge Function

```bash
# Make sure you have Supabase CLI installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (replace with your project reference)
supabase link --project-ref YOUR_PROJECT_REF

# Apply the permissions migration first
supabase db push

# Deploy the function
supabase functions deploy refresh-competitor-views
```

### 2. Set Up Environment Variables

The function requires the following environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

These are automatically available in Supabase Edge Functions.

### 3. Configure Cron Schedule

1. **Via Supabase Dashboard:**
   - Go to your Supabase project dashboard
   - Navigate to "Edge Functions" → "Cron Jobs"
   - Click "Create a new cron job"
   - Set the following:
     - **Function**: `refresh-competitor-views`
     - **Schedule**: `0 * * * *` (every hour at minute 0)
     - **Timezone**: UTC (recommended)
   - Click "Create"

2. **Via SQL (Alternative):**
   ```sql
   -- If pg_cron is available
   SELECT cron.schedule(
     'refresh-competitor-views-hourly',
     '0 * * * *',
     'SELECT net.http_post(
       url := ''https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-competitor-views'',
       headers := ''{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}''::jsonb
     );'
   );
   ```

## Testing

### Manual Testing

You can test the function manually using curl:

```bash
# Replace YOUR_PROJECT_REF with your actual project reference
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/refresh-competitor-views' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Expected Response

**Success Response:**
```json
{
  "success": true,
  "message": "Materialized views refreshed successfully",
  "timestamp": "2025-01-18T12:00:00.000Z",
  "views_refreshed": [
    "mv_competitor_performance",
    "mv_competitor_daily_metrics", 
    "mv_competitor_share_of_voice",
    "mv_competitive_gap_analysis"
  ]
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message details",
  "timestamp": "2025-01-18T12:00:00.000Z"
}
```

## Monitoring

### Logs

Monitor function execution in the Supabase dashboard:
1. Go to "Edge Functions" → "Logs"
2. Filter by function name: `refresh-competitor-views`
3. Check for any errors or performance issues

### Health Check

You can create a simple health check by calling the function manually and verifying the response.

## Troubleshooting

### Common Issues

1. **Function deployment fails**
   - Ensure you're logged in: `supabase login`
   - Verify project is linked: `supabase link --project-ref YOUR_PROJECT_REF`
   - Check function syntax in `index.ts`

2. **Function runs but returns errors**
   - **Schema Error**: If you get "function not found" error, ensure the function uses the correct schema:
     ```typescript
     await supabase.schema('beekon_data').rpc('refresh_competitor_performance_views')
     ```
   - **Permissions Error**: Ensure the service role has execute permissions:
     ```sql
     GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO service_role;
     ```
   - Verify the database function exists: `SELECT beekon_data.refresh_competitor_performance_views();`
   - Review function logs in Supabase dashboard

3. **Cron job not running**
   - Verify cron schedule syntax
   - Check timezone settings
   - Ensure function is deployed and accessible

4. **Performance issues**
   - Monitor function execution time
   - Check database load during refresh
   - Consider adjusting schedule frequency if needed

### Debug Mode

To enable more verbose logging, modify the function to include debug statements:

```typescript
// Debug: Environment check - console removed for security
// Use proper logging service instead of console for production
const debugInfo = {
  hasUrl: !!Deno.env.get('SUPABASE_URL'),
  hasKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}
```

## Cost Considerations

- **Edge Function**: ~$0.000001 per request (very minimal)
- **Database**: Materialized view refresh uses database compute
- **Frequency**: Hourly refresh (24 times/day) is cost-effective vs. real-time refresh

## Security

- Function uses service role key for database access
- CORS headers are configured for security
- No sensitive data is logged
- Authentication is handled by Supabase

## Maintenance

### Regular Tasks

1. **Monitor function logs** weekly for errors
2. **Review execution time** monthly to detect performance degradation
3. **Update dependencies** when new versions are available
4. **Test function** after database schema changes

### Updates

To update the function:
1. Modify the `index.ts` file
2. Redeploy: `supabase functions deploy refresh-competitor-views`
3. Test manually to verify changes

## Related Documentation

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Cron Jobs](https://supabase.com/docs/guides/functions/cron)
- [PostgreSQL Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html)