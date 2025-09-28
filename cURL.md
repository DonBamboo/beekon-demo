Complete List of Refresh Functions with cURL Examples

1. Main Refresh Functions (Recommended)

refresh_all_materialized_views (Primary)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_all_materialized_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{
"force_sequential": false,
"priority": 5,
"requested_by": "api_user"
}'

refresh_all_materialized_views_fast (Timeout-resistant)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_all_materialized_views_fast' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{
"timeout_seconds": 90,
"force_sequential": false,
"priority_only": false
}'

2. Atomic Category-Specific Functions (Ultra-fast)

refresh_dashboard_atomic (~5-10 seconds)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_dashboard_atomic' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_topics_atomic (~5-10 seconds)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_topics_atomic' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_llm_atomic (~5-10 seconds)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_llm_atomic' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_competitors_atomic (~10-20 seconds)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_competitors_atomic' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_analysis_atomic (~20-40 seconds)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_analysis_atomic' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

3. Fast Category Functions

refresh_critical_only (Dashboard + Topics only)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_critical_only' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_critical_views (30s timeout)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_critical_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_dashboard_and_analysis

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_dashboard_and_analysis' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

4. Enhanced Category Functions

refresh_dashboard_performance_views

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_dashboard_performance_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_competitor_views

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_competitor_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_competitor_performance_views

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_competitor_performance_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_competitor_analysis_views

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_competitor_analysis_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

refresh_analysis_performance_views

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_analysis_performance_views' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{}'

5. Single View Refresh Function

refresh_single_view (For individual views)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_single_view' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{
"view_name": "beekon_data.mv_website_dashboard_summary",
"use_concurrent": true
}'

6. Universal Refresh Function

refresh_materialized_view_concurrent (With retry logic)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/refresh_materialized_view_concurrent' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{
"view_name": "beekon_data.mv_analysis_results",
"max_retries": 3,
"retry_delay_seconds": 5
}'

7. Smart Scheduling Functions

schedule_smart_refresh (Intelligent scheduling)

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/schedule_smart_refresh' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{
"refresh_category": "critical",
"delay_seconds": 0,
"requested_by": "api_scheduler"
}'

process_refresh_queue

curl -X POST 'https://your-project-ref.supabase.co/rest/v1/rpc/process_refresh_queue' \
 -H "apikey: your-anon-key" \
 -H "Authorization: Bearer your-anon-key" \
 -H "Content-Type: application/json" \
 -d '{
"max_operations": 5
}'
