import { supabase } from "@/integrations/supabase/client";
import { DataLoader } from "@/lib/request-batching";
import { AnalysisResult, UIAnalysisResult, LLMResult } from "@/types/database";

// Helper functions for safe type extraction
function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function safeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// Data loader for analysis results
export const analysisResultsLoader = new DataLoader<
  { websiteId: string; dateRange?: { start: string; end: string } },
  UIAnalysisResult[]
>(
  async (keys) => {
    const results = new Map<{ websiteId: string; dateRange?: { start: string; end: string } }, UIAnalysisResult[]>();

    // Group keys by websiteId to batch queries efficiently
    const websiteGroups = new Map<string, { websiteId: string; dateRange?: { start: string; end: string } }[]>();
    
    keys.forEach(key => {
      const group = websiteGroups.get(key.websiteId) || [];
      group.push(key);
      websiteGroups.set(key.websiteId, group);
    });

    // Execute queries in parallel for each website
    const websitePromises = Array.from(websiteGroups.entries()).map(async ([websiteId, websiteKeys]) => {
      // For each website, we need to handle different date ranges
      const dateRangePromises = websiteKeys.map(async (key) => {
        let query = supabase
          .schema("beekon_data")
          .from("llm_analysis_results")
          .select(`
            *,
            prompts!inner (
              id,
              prompt_text,
              reporting_text,
              recommendation_text,
              strengths,
              opportunities,
              topic_id,
              topics!inner (
                id,
                topic_name,
                website_id
              )
            ),
            analysis_sessions (
              id,
              analysis_name,
              status
            )
          `)
          .eq("prompts.topics.website_id", websiteId)
          .order("created_at", { ascending: false });

        // Apply date range filter if specified
        if (key.dateRange) {
          query = query
            .gte("created_at", key.dateRange.start)
            .lte("created_at", key.dateRange.end);
        }

        const { data, error } = await query;
        if (error) throw error;

        const transformed = transformAnalysisData(data || [], websiteId);
        results.set(key, transformed);
      });

      await Promise.all(dateRangePromises);
    });

    await Promise.all(websitePromises);
    return results;
  },
  {
    maxBatchSize: 50,
    maxWaitTime: 20,
    cacheTTL: 2 * 60 * 1000, // 2 minutes cache
  }
);

// Data loader for website information
export const websiteInfoLoader = new DataLoader<
  string,
  { domain: string; display_name: string }
>(
  async (websiteIds) => {
    const results = new Map<string, { domain: string; display_name: string }>();

    if (websiteIds.length === 0) return results;

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("websites")
      .select("id, domain, display_name")
      .in("id", websiteIds);

    if (error) throw error;

    data?.forEach(website => {
      results.set(website.id, {
        domain: website.domain,
        display_name: website.display_name,
      });
    });

    return results;
  },
  {
    maxBatchSize: 100,
    maxWaitTime: 16,
    cacheTTL: 10 * 60 * 1000, // 10 minutes cache for website info
  }
);

// Data loader for topic information
export const topicInfoLoader = new DataLoader<
  string,
  { id: string; name: string; resultCount: number }[]
>(
  async (websiteIds) => {
    const results = new Map<string, { id: string; name: string; resultCount: number }[]>();

    if (websiteIds.length === 0) return results;

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("topics")
      .select(`
        id, 
        topic_name,
        website_id,
        prompts!inner (
          id,
          llm_analysis_results (
            id
          )
        )
      `)
      .in("website_id", websiteIds)
      .eq("is_active", true)
      .order("topic_name");

    if (error) throw error;

    // Group by website_id and calculate result counts
    const websiteTopics = new Map<string, { id: string; name: string; resultCount: number }[]>();

    data?.forEach(topic => {
      const websiteId = topic.website_id;
      const topics = websiteTopics.get(websiteId) || [];
      
      const resultCount = topic.prompts?.reduce((total, prompt) => {
        return total + (prompt.llm_analysis_results?.length || 0);
      }, 0) || 0;

      topics.push({
        id: topic.id,
        name: topic.topic_name,
        resultCount,
      });

      websiteTopics.set(websiteId, topics);
    });

    // Set results for each website
    websiteIds.forEach(websiteId => {
      const topics = websiteTopics.get(websiteId) || [];
      results.set(websiteId, topics);
    });

    return results;
  },
  {
    maxBatchSize: 50,
    maxWaitTime: 20,
    cacheTTL: 10 * 60 * 1000, // 10 minutes cache
  }
);

// Data loader for LLM provider information
export const llmProviderLoader = new DataLoader<
  string,
  { id: string; name: string; resultCount: number }[]
>(
  async (websiteIds) => {
    const results = new Map<string, { id: string; name: string; resultCount: number }[]>();

    if (websiteIds.length === 0) return results;

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .select(`
        llm_provider,
        prompts!inner (
          topics!inner (
            website_id
          )
        )
      `)
      .in("prompts.topics.website_id", websiteIds);

    if (error) throw error;

    // Group by website_id and count by LLM provider
    const websiteProviders = new Map<string, Map<string, number>>();

    data?.forEach(result => {
      const websiteId = result.prompts.topics.website_id;
      const provider = result.llm_provider;
      
      if (!websiteProviders.has(websiteId)) {
        websiteProviders.set(websiteId, new Map());
      }
      
      const providerCounts = websiteProviders.get(websiteId)!;
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    });

    // Provider name mapping
    const providerNames = {
      chatgpt: "ChatGPT",
      claude: "Claude",
      gemini: "Gemini",
      perplexity: "Perplexity",
    };

    // Convert to result format
    websiteIds.forEach(websiteId => {
      const providerCounts = websiteProviders.get(websiteId) || new Map();
      const providers = Array.from(providerCounts.entries()).map(([id, count]) => ({
        id,
        name: providerNames[id as keyof typeof providerNames] || id,
        resultCount: count,
      }));

      results.set(websiteId, providers);
    });

    return results;
  },
  {
    maxBatchSize: 50,
    maxWaitTime: 20,
    cacheTTL: 10 * 60 * 1000, // 10 minutes cache
  }
);

// Shared data transformation function
function transformAnalysisData(
  data: Record<string, unknown>[],
  websiteId?: string
): UIAnalysisResult[] {
  const resultsMap = new Map<string, UIAnalysisResult>();

  data?.forEach((row) => {
    const promptId = safeString(row.prompt_id);
    if (!promptId) return;

    let promptText: string;
    let topicName: string;
    let resultWebsiteId: string;
    let reportingText: string | null = null;
    let recommendationText: string | null = null;
    let promptStrengths: string[] | null = null;
    let promptOpportunities: string[] | null = null;
    
    // Extract analysis session information
    const analysisSessionId = safeString(row.analysis_session_id) || null;
    let analysisName: string | null = null;
    let analysisSessionStatus: string | null = null;
    
    // Check if we have analysis session data from joins
    if (row.analysis_sessions) {
      const session = row.analysis_sessions as {
        id: string;
        analysis_name: string;
        status: string;
      };
      analysisName = session.analysis_name;
      analysisSessionStatus = session.status;
    }

    if (row.prompts) {
      const prompt = row.prompts as {
        id: string;
        prompt_text: string;
        reporting_text: string | null;
        recommendation_text: string | null;
        strengths: string[] | null;
        opportunities: string[] | null;
        topic_id: string;
        topics: { id: string; topic_name: string; website_id: string };
      };
      
      promptText = prompt.prompt_text;
      topicName = prompt.topics.topic_name;
      resultWebsiteId = websiteId || prompt.topics.website_id;
      reportingText = prompt.reporting_text;
      recommendationText = prompt.recommendation_text;
      promptStrengths = prompt.strengths;
      promptOpportunities = prompt.opportunities;
    } else {
      promptText = "Unknown prompt";
      topicName = "Unknown topic";
      resultWebsiteId = websiteId || "";
    }

    if (!resultsMap.has(promptId)) {
      resultsMap.set(promptId, {
        id: promptId,
        prompt: promptText,
        website_id: resultWebsiteId,
        topic: topicName,
        status: "completed",
        confidence: safeNumber(row.confidence_score),
        created_at: safeString(row.analyzed_at) || safeString(row.created_at) || new Date().toISOString(),
        updated_at: safeString(row.created_at) || new Date().toISOString(),
        reporting_text: reportingText,
        recommendation_text: recommendationText,
        prompt_strengths: promptStrengths,
        prompt_opportunities: promptOpportunities,
        llm_results: [],
        // Include analysis session information
        analysis_session_id: analysisSessionId,
        analysis_name: analysisName,
        analysis_session_status: analysisSessionStatus,
      });
    }

    const result = resultsMap.get(promptId)!;
    result.llm_results.push({
      llm_provider: safeString(row.llm_provider),
      is_mentioned: safeBoolean(row.is_mentioned),
      rank_position: safeNumber(row.rank_position),
      confidence_score: safeNumber(row.confidence_score),
      sentiment_score: safeNumber(row.sentiment_score),
      summary_text: safeString(row.summary_text),
      response_text: safeString(row.response_text),
      analyzed_at: safeString(row.analyzed_at) || safeString(row.created_at) || new Date().toISOString(),
    });
  });

  return Array.from(resultsMap.values());
}

// Utility function to clear all data loaders
export function clearAllDataLoaders(): void {
  analysisResultsLoader.clear();
  websiteInfoLoader.clear();
  topicInfoLoader.clear();
  llmProviderLoader.clear();
}