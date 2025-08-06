import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting materialized view refresh...");

    // Refresh all competitor materialized views
    // Method 1: Using schema-specific RPC call
    const { data, error } = await supabase
      .schema("beekon_data")
      .rpc("refresh_competitor_performance_views");

    // Alternative Method 2: Direct SQL execution (uncomment if RPC doesn't work)
    // const { data, error } = await supabase.sql`SELECT beekon_data.refresh_competitor_performance_views();`

    if (error) {
      console.error("Error refreshing materialized views:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Materialized views refreshed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Materialized views refreshed successfully",
        timestamp: new Date().toISOString(),
        views_refreshed: [
          "mv_competitor_performance",
          "mv_competitor_daily_metrics",
          "mv_competitor_share_of_voice",
          "mv_competitive_gap_analysis",
        ],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error in refresh function:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
