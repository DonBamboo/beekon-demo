const { createClient } = require("@supabase/supabase-js");

// Local Supabase configuration
const supabaseUrl = "http://127.0.0.1:54331";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testMaterializedViewOptimization() {
  try {
    // Test 1: Check if materialized views exist
    const { data: mvData, error: mvError } = await supabase.rpc("execute_sql", {
      query: `
                    SELECT schemaname, matviewname, ispopulated
                    FROM pg_matviews
                    WHERE schemaname = 'beekon_data'
                    ORDER BY matviewname
                `,
    });

    // Test 2: Check if optimized functions exist
    const { data: funcData, error: funcError } = await supabase.rpc(
      "execute_sql",
      {
        query: `
                    SELECT proname, prosrc LIKE '%mv_%' as uses_materialized_views
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = 'beekon_data'
                    AND proname IN (
                        'get_dashboard_metrics',
                        'get_dashboard_metrics_optimized',
                        'get_competitor_performance',
                        'get_competitor_share_of_voice'
                    )
                    ORDER BY proname
                `,
      }
    );

    // Test 3: Performance test if we have the test function
    const { data: perfData, error: perfError } = await supabase.rpc(
      "test_optimization_performance"
    );

    // Get sample website IDs
    const { data: websites, error: websiteError } = await supabase
      .from("websites")
      .select("id")
      .eq("is_active", true)
      .limit(3);

    if (websiteError) {
      return;
    }

    if (!websites || websites.length === 0) {
      return;
    }

    const websiteIds = websites.map((w) => w.id);

    // Test optimized function if it exists
    const { data: optimizedResult, error: optimizedError } = await supabase.rpc(
      "get_dashboard_metrics_optimized",
      {
        p_website_ids: websiteIds,
        p_date_start: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
        p_date_end: new Date().toISOString(),
      }
    );
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
}

// Custom SQL execution function for testing
async function testDirectSQL() {
  try {
    // Test materialized view query directly
    const { data, error } = await supabase
      .from("mv_website_dashboard_summary")
      .select("*")
      .limit(5);
  } catch (error) {
    console.error("❌ Direct SQL test failed:", error.message);
  }
}

// Run all tests
async function runAllTests() {
  await testMaterializedViewOptimization();
  await testDirectSQL();
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testMaterializedViewOptimization, testDirectSQL };
