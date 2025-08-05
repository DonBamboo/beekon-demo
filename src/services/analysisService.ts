import { supabase } from "@/integrations/supabase/client";
import { sendN8nWebhook } from "@/lib/http-request";
import { AnalysisResult, LLMResult, UIAnalysisResult } from "@/types/database";

export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

export interface PaginatedAnalysisResults {
  results: UIAnalysisResult[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount?: number;
}

export interface AnalysisConfig {
  analysisName: string;
  websiteId: string;
  topics: string[];
  customPrompts: string[];
  llmModels: string[];
  priority: "high" | "medium" | "low";
  analysisType: "comprehensive" | "focused" | "competitive";
  includeCompetitors: boolean;
  generateReport: boolean;
  scheduleAnalysis: boolean;
}

export interface AnalysisSession {
  id: string;
  analysis_name: string;
  website_id: string;
  user_id: string;
  workspace_id: string;
  status: AnalysisStatus;
  configuration: AnalysisConfig;
  progress_data: AnalysisProgress | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Re-export for backward compatibility
export type { AnalysisResult, LLMResult };

export interface AnalysisProgress {
  analysisId: string;
  status: AnalysisStatus;
  progress: number;
  currentStep: string;
  completedSteps: number;
  totalSteps: number;
  error?: string;
}

export class AnalysisService {
  private static instance: AnalysisService;
  private progressCallbacks: Map<string, (progress: AnalysisProgress) => void> =
    new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  public static getInstance(): AnalysisService {
    if (!AnalysisService.instance) {
      AnalysisService.instance = new AnalysisService();
    }
    return AnalysisService.instance;
  }

  async createAnalysis(
    config: AnalysisConfig,
    userId?: string,
    workspaceId?: string
  ): Promise<string> {
    try {
      // Get current user if not provided
      if (!userId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user)
          throw new Error("User must be authenticated to create analysis");
        userId = user.id;
      }

      // Get workspace ID from website if not provided
      if (!workspaceId) {
        const { data: website } = await supabase
          .schema("beekon_data")
          .from("websites")
          .select("workspace_id")
          .eq("id", config.websiteId)
          .single();

        if (!website) throw new Error("Website not found");
        workspaceId = website.workspace_id;
      }

      // Create analysis session first
      const analysisSession = await this.createAnalysisSession(
        config,
        userId,
        workspaceId
      );

      // First, create topics if they don't exist
      const topicIds = await this.ensureTopicsExist(
        config.websiteId,
        config.topics
      );

      // Create prompts for each topic
      const prompts = await this.createPrompts(config.customPrompts, topicIds);

      const promptIds = [];

      for (const prompt of prompts) {
        if (prompt.id) {
          promptIds.push(prompt.id);
        }
      }

      // Start the analysis process
      await this.startAnalysis(analysisSession.id, config, promptIds);

      // Trigger N8N webhook for actual analysis
      await this.triggerAnalysisWebhook(
        analysisSession.id,
        config,
        prompts,
        topicIds,
        workspaceId
      );

      return analysisSession.id;
    } catch (error) {
      console.error("Failed to create analysis:", error);

      // Clean up any polling intervals that might have been started
      if (analysisSession?.id) {
        this.unsubscribeFromProgress(analysisSession.id);
      }

      throw error;
    }
  }

  private async ensureTopicsExist(
    websiteId: string,
    topics: string[]
  ): Promise<string[]> {
    const topicIds: string[] = [];

    for (const topicName of topics) {
      // Check if topic already exists
      const { data: existingTopic } = await supabase
        .schema("beekon_data")
        .from("topics")
        .select("id")
        .eq("website_id", websiteId)
        .eq("topic_name", topicName)
        .single();

      if (existingTopic) {
        topicIds.push(existingTopic.id);
      } else {
        // Create new topic
        const { data: newTopic, error } = await supabase
          .schema("beekon_data")
          .from("topics")
          .insert({
            website_id: websiteId,
            topic_name: topicName,
            is_active: true,
          })
          .select("id")
          .single();

        if (error) throw error;
        topicIds.push(newTopic.id);
      }
    }

    return topicIds;
  }

  private async createPrompts(
    customPrompts: string[],
    topicIds: string[]
  ): Promise<{ id: string; prompt_text: string }[]> {
    const prompts: { id: string; prompt_text: string }[] = [];

    // Ensure we have exactly one topic (enforced by new constraint)
    if (topicIds.length !== 1) {
      throw new Error("Exactly one topic is required per analysis");
    }

    const topicId = topicIds[0]; // Single topic per analysis

    for (const prompt of customPrompts) {
      const { data: newPrompt, error } = await supabase
        .schema("beekon_data")
        .from("prompts")
        .insert({
          prompt_text: prompt,
          topic_id: topicId,
          is_active: true,
          priority: 1,
          prompt_type: "custom",
        })
        .select("id")
        .single();

      if (error) throw error;
      prompts.push({ id: newPrompt.id, prompt_text: prompt });
    }

    return prompts;
  }

  private async createAnalysisSession(
    config: AnalysisConfig,
    userId: string,
    workspaceId: string
  ): Promise<AnalysisSession> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("analysis_sessions")
      .insert({
        analysis_name: config.analysisName,
        website_id: config.websiteId,
        user_id: userId,
        workspace_id: workspaceId,
        status: "pending",
        configuration: config,
        progress_data: {
          analysisId: "", // Will be set to session ID
          status: "pending",
          progress: 0,
          currentStep: "Initializing analysis...",
          completedSteps: 0,
          totalSteps: config.customPrompts.length * config.llmModels.length,
        },
      })
      .select()
      .single();

    if (error) throw error;

    return data as unknown as AnalysisSession;
  }

  private async startAnalysis(
    sessionId: string,
    config: AnalysisConfig,
    promptIds: string[]
  ): Promise<void> {
    // Calculate total steps, ensuring minimum of 1 to avoid division by zero
    const totalSteps = Math.max(
      1,
      config.customPrompts.length > 0
        ? config.customPrompts.length * config.llmModels.length
        : config.llmModels.length // Default to one step per LLM when no custom prompts
    );

    // Update analysis session status and progress
    await this.updateAnalysisSession(sessionId, {
      status: "pending",
      started_at: new Date().toISOString(),
      progress_data: {
        analysisId: sessionId,
        status: "pending",
        progress: 0,
        currentStep: "Initializing analysis...",
        completedSteps: 0,
        totalSteps,
      },
    });

    // Initialize progress tracking
    this.updateProgress(sessionId, {
      analysisId: sessionId,
      status: "pending",
      progress: 0,
      currentStep: "Initializing analysis...",
      completedSteps: 0,
      totalSteps,
    });
  }

  private async triggerAnalysisWebhook(
    sessionId: string,
    config: AnalysisConfig,
    prompts: object[],
    topicId: string[],
    workspaceId: string
  ) {
    try {
      // Calculate total steps first, before using in webhook payload
      const totalSteps = Math.max(
        1,
        config.customPrompts.length > 0
          ? config.customPrompts.length * config.llmModels.length
          : config.llmModels.length // Default to one step per LLM when no custom prompts
      );

      const webhookPayload = {
        sessionId,
        config: {
          websiteId: config.websiteId,
          workspaceId: workspaceId,
          topic: {
            topicId: topicId[0],
            topic: config.topics[0],
          },
          prompts: prompts,
          autoGeneratePrompts: prompts.length === 0, // Flag to tell N8N to generate prompts
          expectedSteps: totalSteps, // Help N8N understand expected progress steps
          priority: config.priority,
          generateReport: config.generateReport,
          includeCompetitors: config.includeCompetitors,
          llmModels: config.llmModels,
          scheduleAnalysis: config.scheduleAnalysis,
        },
        timestamp: new Date().toISOString(),
      };

      const progressData = {
        analysisId: sessionId,
        status: "running" as AnalysisStatus,
        progress: 10,
        currentStep:
          config.customPrompts.length > 0
            ? "Starting LLM analysis with custom prompts..."
            : "Starting LLM analysis with auto-generated prompts...",
        completedSteps: 0,
        totalSteps,
      };

      await this.updateAnalysisSession(sessionId, {
        status: "running",
        progress_data: progressData,
      });

      this.updateProgress(sessionId, progressData);

      // Debug logging for progress tracking
      console.log("Analysis webhook triggered:", {
        sessionId,
        hasCustomPrompts: config.customPrompts.length > 0,
        customPromptsCount: config.customPrompts.length,
        llmModelsCount: config.llmModels.length,
        totalSteps,
        autoGeneratePrompts: prompts.length === 0,
      });

      const response = await sendN8nWebhook(
        "webhook/manually-added-analysis",
        webhookPayload
      );

      if (!response.success) {
        console.error("An error occurred" + response.messages);
      }

      console.log("response", response);

      // Start polling for progress updates from N8N
      this.startProgressPolling(sessionId);
    } catch (error) {
      const errorProgressData = {
        analysisId: sessionId,
        status: "failed" as AnalysisStatus,
        progress: 0,
        currentStep: "Failed to start analysis",
        completedSteps: 0,
        totalSteps: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };

      await this.updateAnalysisSession(sessionId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        progress_data: errorProgressData,
      });

      this.updateProgress(sessionId, errorProgressData);
      throw error;
    }
  }

  // Shared data transformation function to standardize logic
  private transformAnalysisData(
    data: Record<string, unknown>[],
    websiteId?: string
  ): UIAnalysisResult[] {
    const resultsMap = new Map<string, UIAnalysisResult>();

    data?.forEach((row, index) => {
      const promptId = row.prompt_id as string;
      if (!promptId) {
        // Skip rows with null prompt_id
        return;
      }

      // Handle different data structures (with joins vs without)
      let promptText: string;
      let topicName: string;
      let resultWebsiteId: string;
      let reportingText: string | null = null;
      let recommendationText: string | null = null;
      let promptStrengths: string[] | null = null;
      let promptOpportunities: string[] | null = null;

      // Extract analysis session information
      const analysisSessionId = row.analysis_session_id as string | null;
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
        // Data from joined query with nested topics
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
        // Data from direct query (export function)
        const prompts = row.prompts as Record<string, unknown>;
        promptText = (prompts?.prompt_text as string) || "Unknown prompt";
        reportingText = (prompts?.reporting_text as string) || null;
        recommendationText = (prompts?.recommendation_text as string) || null;
        promptStrengths = (prompts?.strengths as string[]) || null;
        promptOpportunities = (prompts?.opportunities as string[]) || null;
        topicName =
          ((prompts?.topics as Record<string, unknown>)
            ?.topic_name as string) || "Unknown topic";
        resultWebsiteId = row.website_id as string;
      }

      if (!resultsMap.has(promptId)) {
        resultsMap.set(promptId, {
          id: promptId,
          prompt: promptText,
          website_id: resultWebsiteId,
          topic: topicName,
          status: "completed" as AnalysisStatus,
          confidence: (row.confidence_score as number) || 0,
          created_at:
            (row.analyzed_at as string) ||
            (row.created_at as string) ||
            new Date().toISOString(),
          updated_at: (row.created_at as string) || new Date().toISOString(),
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
        llm_provider: row.llm_provider as string,
        is_mentioned: (row.is_mentioned as boolean) || false,
        rank_position: row.rank_position as number,
        confidence_score: row.confidence_score as number,
        sentiment_score: row.sentiment_score as number,
        summary_text: row.summary_text as string,
        response_text: row.response_text as string,
        analyzed_at:
          (row.analyzed_at as string) ||
          (row.created_at as string) ||
          new Date().toISOString(),
      });
    });

    return Array.from(resultsMap.values());
  }

  async getAnalysisResultsPaginated(
    websiteId: string,
    options: {
      cursor?: string;
      limit?: number;
      filters?: {
        topic?: string;
        llmProvider?: string;
        status?: AnalysisStatus;
        dateRange?: { start: string; end: string };
        searchQuery?: string;
        mentionStatus?: string;
        confidenceRange?: [number, number];
        sentiment?: string;
        analysisSession?: string;
      };
    } = {}
  ): Promise<PaginatedAnalysisResults> {
    const { cursor, limit = 20, filters } = options;

    try {
      // Step 1: Get unique prompt IDs with pagination
      // This ensures we get complete prompt data, not partial LLM responses
      let promptQuery = supabase
        .schema("beekon_data")
        .from("prompts")
        .select(
          `
          id,
          created_at,
          topics!inner (
            website_id
          )
        `
        )
        .eq("topics.website_id", websiteId)
        .order("created_at", { ascending: false });

      // Apply cursor-based pagination to prompts
      if (cursor) {
        promptQuery = promptQuery.lt("created_at", cursor);
      }

      // Get one extra prompt to determine if there are more results
      const { data: promptsData, error: promptsError } = await promptQuery.limit(limit + 1);

      if (promptsError) throw promptsError;

      // Determine if there are more results and get actual prompt IDs
      const hasMore = promptsData.length > limit;
      const selectedPrompts = hasMore ? promptsData.slice(0, limit) : promptsData;
      const promptIds = selectedPrompts.map(p => p.id);

      if (promptIds.length === 0) {
        return {
          results: [],
          hasMore: false,
          nextCursor: null,
          totalCount: 0,
        };
      }

      // Step 2: Get ALL llm_analysis_results for the selected prompts
      // This ensures each prompt has complete LLM response data
      let llmResultsQuery = supabase
        .schema("beekon_data")
        .from("llm_analysis_results")
        .select(
          `
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
        `
        )
        .in("prompt_id", promptIds);

      // Apply server-side filters for better performance
      if (filters?.dateRange) {
        llmResultsQuery = llmResultsQuery
          .gte("created_at", filters.dateRange.start)
          .lte("created_at", filters.dateRange.end);
      }

      const { data, error } = await llmResultsQuery;

      if (error) throw error;

      // Transform the data using the existing transformation function
      const transformedResults = this.transformAnalysisData(data, websiteId);
      
      // Log for debugging - ensure each prompt has complete LLM data
      if (process.env.NODE_ENV === 'development' && transformedResults.length > 0) {
        console.log('🔍 Prompt-based pagination results:', {
          promptCount: promptIds.length,
          llmRecordsCount: data.length,
          transformedResultsCount: transformedResults.length,
          firstResult: {
            id: transformedResults[0]?.id,
            prompt: transformedResults[0]?.prompt?.substring(0, 50) + '...',
            llmResultsCount: transformedResults[0]?.llm_results?.length || 0,
            llmProviders: transformedResults[0]?.llm_results?.map(r => r.llm_provider) || []
          }
        });
      }

      // Apply client-side filtering for complex filters
      let filteredResults = transformedResults;

      // Apply topic filter
      if (filters?.topic && filters.topic !== "all") {
        filteredResults = filteredResults.filter(
          (result) => result.topic === filters.topic
        );
      }

      // Apply LLM provider filter
      if (filters?.llmProvider && filters.llmProvider !== "all") {
        filteredResults = filteredResults
          .filter((result) =>
            result.llm_results.some(
              (llm) => llm.llm_provider === filters.llmProvider
            )
          )
          .map((result) => ({
            ...result,
            llm_results: result.llm_results.map((llm) => ({
              ...llm,
              isFiltered: llm.llm_provider === filters.llmProvider,
            })),
          }));
      }

      // Apply search query filter
      if (filters?.searchQuery && filters.searchQuery.trim()) {
        const searchTerm = filters.searchQuery.toLowerCase().trim();
        filteredResults = filteredResults.filter(
          (result) =>
            result.prompt.toLowerCase().includes(searchTerm) ||
            result.topic.toLowerCase().includes(searchTerm) ||
            (result.analysis_name &&
              result.analysis_name.toLowerCase().includes(searchTerm)) ||
            result.llm_results.some((llm) =>
              llm.response_text?.toLowerCase().includes(searchTerm)
            )
        );
      }

      // Apply mention status filter
      if (filters?.mentionStatus && filters.mentionStatus !== "all") {
        if (filters.mentionStatus === "mentioned") {
          filteredResults = filteredResults.filter((result) =>
            result.llm_results.some((llm) => llm.is_mentioned)
          );
        } else if (filters.mentionStatus === "not_mentioned") {
          filteredResults = filteredResults.filter(
            (result) => !result.llm_results.some((llm) => llm.is_mentioned)
          );
        }
      }

      // Apply confidence range filter
      if (filters?.confidenceRange) {
        const [minConfidence, maxConfidence] = filters.confidenceRange;
        // Convert percentage range to decimal range for comparison
        const minDecimal = minConfidence / 100; // Convert 4 → 0.04
        const maxDecimal = maxConfidence / 100; // Convert 100 → 1.0

        filteredResults = filteredResults.filter(
          (result) =>
            result.confidence >= minDecimal && result.confidence <= maxDecimal
        );
      }

      // Apply sentiment filter
      if (filters?.sentiment && filters.sentiment !== "all") {
        filteredResults = filteredResults.filter((result) =>
          result.llm_results.some((llm) => {
            if (!llm.sentiment_score) return false;

            if (filters.sentiment === "positive") {
              return llm.sentiment_score > 0.1;
            } else if (filters.sentiment === "negative") {
              return llm.sentiment_score < -0.1;
            } else if (filters.sentiment === "neutral") {
              return llm.sentiment_score >= -0.1 && llm.sentiment_score <= 0.1;
            }
            return false;
          })
        );
      }

      // Apply analysis session filter
      if (filters?.analysisSession && filters.analysisSession !== "all") {
        filteredResults = filteredResults.filter(
          (result) => result.analysis_session_id === filters.analysisSession
        );
      }

      // Get the next cursor from the last selected prompt
      const nextCursor =
        selectedPrompts.length > 0 ? selectedPrompts[selectedPrompts.length - 1]?.created_at : null;

      return {
        results: filteredResults,
        hasMore,
        nextCursor,
        totalCount: undefined, // We don't calculate total count for performance reasons
      };
    } catch (error) {
      console.error("Failed to get paginated analysis results:", error);
      throw error;
    }
  }

  async getAnalysisResults(
    websiteId: string,
    filters?: {
      topic?: string;
      llmProvider?: string;
      status?: AnalysisStatus;
      dateRange?: { start: string; end: string };
      searchQuery?: string;
      mentionStatus?: string;
      confidenceRange?: [number, number];
      sentiment?: string;
      analysisSession?: string;
    }
  ): Promise<UIAnalysisResult[]> {
    const { analysisResultsLoader } = await import("./dataLoaders");

    try {
      // Use data loader for efficient batching and caching
      const results = await analysisResultsLoader.load({
        websiteId,
        dateRange: filters?.dateRange,
      });

      // Apply client-side filtering for better performance
      let filteredResults = results;

      // Apply topic filter
      if (filters?.topic && filters.topic !== "all") {
        filteredResults = filteredResults.filter(
          (result) => result.topic === filters.topic
        );
      }

      // Apply LLM provider filter
      if (filters?.llmProvider && filters.llmProvider !== "all") {
        filteredResults = filteredResults
          .filter((result) =>
            result.llm_results.some(
              (llm) => llm.llm_provider === filters.llmProvider
            )
          )
          .map((result) => ({
            ...result,
            llm_results: result.llm_results.map((llm) => ({
              ...llm,
              isFiltered: llm.llm_provider === filters.llmProvider,
            })),
          }));
      }

      // Apply search query filter
      if (filters?.searchQuery && filters.searchQuery.trim()) {
        const searchTerm = filters.searchQuery.toLowerCase().trim();
        filteredResults = filteredResults.filter(
          (result) =>
            result.prompt.toLowerCase().includes(searchTerm) ||
            result.topic.toLowerCase().includes(searchTerm) ||
            (result.analysis_name &&
              result.analysis_name.toLowerCase().includes(searchTerm)) ||
            result.llm_results.some((llm) =>
              llm.response_text?.toLowerCase().includes(searchTerm)
            )
        );
      }

      // Apply mention status filter
      if (filters?.mentionStatus && filters.mentionStatus !== "all") {
        if (filters.mentionStatus === "mentioned") {
          filteredResults = filteredResults.filter((result) =>
            result.llm_results.some((llm) => llm.is_mentioned)
          );
        } else if (filters.mentionStatus === "not_mentioned") {
          filteredResults = filteredResults.filter(
            (result) => !result.llm_results.some((llm) => llm.is_mentioned)
          );
        }
      }

      // Apply confidence range filter
      if (filters?.confidenceRange) {
        const [minConfidence, maxConfidence] = filters.confidenceRange;
        // Convert percentage range to decimal range for comparison
        const minDecimal = minConfidence / 100; // Convert 4 → 0.04
        const maxDecimal = maxConfidence / 100; // Convert 100 → 1.0

        filteredResults = filteredResults.filter(
          (result) =>
            result.confidence >= minDecimal && result.confidence <= maxDecimal
        );
      }

      // Apply sentiment filter
      if (filters?.sentiment && filters.sentiment !== "all") {
        filteredResults = filteredResults.filter((result) =>
          result.llm_results.some((llm) => {
            if (!llm.sentiment_score) return false;

            if (filters.sentiment === "positive") {
              return llm.sentiment_score > 0.1;
            } else if (filters.sentiment === "negative") {
              return llm.sentiment_score < -0.1;
            } else if (filters.sentiment === "neutral") {
              return llm.sentiment_score >= -0.1 && llm.sentiment_score <= 0.1;
            }
            return false;
          })
        );
      }

      // Apply analysis session filter
      if (filters?.analysisSession && filters.analysisSession !== "all") {
        filteredResults = filteredResults.filter(
          (result) => result.analysis_session_id === filters.analysisSession
        );
      }

      return filteredResults;
    } catch (error) {
      console.error("Failed to get analysis results:", error);
      throw error;
    }
  }

  async getTopicsForWebsite(
    websiteId: string
  ): Promise<Array<{ id: string; name: string; resultCount: number }>> {
    try {
      const { topicInfoLoader } = await import("./dataLoaders");
      const topics = await topicInfoLoader.load(websiteId);
      return topics;
    } catch (error) {
      console.error("Failed to get topics:", error);
      // Fallback to direct database query if data loader fails
      try {
        const { data, error: dbError } = await supabase
          .schema("beekon_data")
          .from("topics")
          .select(
            `
            id, 
            topic_name,
            prompts!inner (
              id,
              llm_analysis_results (
                id
              )
            )
          `
          )
          .eq("website_id", websiteId)
          .eq("is_active", true)
          .order("topic_name");

        if (dbError) throw dbError;

        return (
          data?.map((topic) => {
            const resultCount =
              topic.prompts?.reduce((total, prompt) => {
                return total + (prompt.llm_analysis_results?.length || 0);
              }, 0) || 0;

            return {
              id: topic.id,
              name: topic.topic_name,
              resultCount,
            };
          }) || []
        );
      } catch (fallbackError) {
        console.error("Fallback topics query also failed:", fallbackError);
        return [];
      }
    }
  }

  async getAvailableLLMProviders(
    websiteId: string
  ): Promise<Array<{ id: string; name: string; resultCount: number }>> {
    try {
      const { llmProviderLoader } = await import("./dataLoaders");
      const providers = await llmProviderLoader.load(websiteId);
      return providers;
    } catch (error) {
      console.error("Failed to get LLM providers:", error);
      // Fallback to direct database query if data loader fails
      try {
        const { data, error: dbError } = await supabase
          .schema("beekon_data")
          .from("llm_analysis_results")
          .select(
            `
            llm_provider,
            prompts!inner (
              topics!inner (
                website_id
              )
            )
          `
          )
          .eq("prompts.topics.website_id", websiteId);

        if (dbError) throw dbError;

        // Count results by LLM provider
        const providerCounts = new Map<string, number>();
        data?.forEach((result) => {
          const provider = result.llm_provider;
          providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
        });

        // Map to display format with proper names
        const providerNames = {
          chatgpt: "ChatGPT",
          claude: "Claude",
          gemini: "Gemini",
          perplexity: "Perplexity",
        };

        return Array.from(providerCounts.entries()).map(([id, count]) => ({
          id,
          name: providerNames[id as keyof typeof providerNames] || id,
          resultCount: count,
        }));
      } catch (fallbackError) {
        console.error(
          "Fallback LLM providers query also failed:",
          fallbackError
        );
        return [];
      }
    }
  }

  subscribeToProgress(
    analysisId: string,
    callback: (progress: AnalysisProgress) => void
  ) {
    this.progressCallbacks.set(analysisId, callback);
  }

  unsubscribeFromProgress(analysisId: string) {
    this.progressCallbacks.delete(analysisId);
    // Clean up polling interval if it exists
    const interval = this.pollingIntervals.get(analysisId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(analysisId);
    }
  }

  private updateProgress(analysisId: string, progress: AnalysisProgress) {
    // Validate and sanitize progress data to prevent NaN issues
    const safeProgress: AnalysisProgress = {
      ...progress,
      progress: Math.max(
        0,
        Math.min(100, isNaN(progress.progress) ? 0 : progress.progress)
      ),
      completedSteps: Math.max(
        0,
        isNaN(progress.completedSteps) ? 0 : progress.completedSteps
      ),
      totalSteps: Math.max(
        1,
        isNaN(progress.totalSteps) ? 1 : progress.totalSteps
      ),
    };

    // Recalculate progress percentage if needed
    if (safeProgress.totalSteps > 0) {
      const calculatedProgress = Math.round(
        (safeProgress.completedSteps / safeProgress.totalSteps) * 100
      );
      // Use calculated progress if current progress seems invalid
      if (isNaN(progress.progress) || progress.progress === 0) {
        safeProgress.progress = Math.min(calculatedProgress, 100);
      }
    }

    const callback = this.progressCallbacks.get(analysisId);
    if (callback) {
      callback(safeProgress);
    }
  }

  private startProgressPolling(sessionId: string) {
    // Clear any existing polling interval for this session
    const existingInterval = this.pollingIntervals.get(sessionId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const pollInterval = setInterval(async () => {
      try {
        const session = await this.getAnalysisSession(sessionId);
        console.log("Progress polling update:", {
          sessionId: sessionId.slice(0, 8),
          status: session?.status,
          progress: session?.progress_data?.progress,
          currentStep: session?.progress_data?.currentStep,
          completedSteps: session?.progress_data?.completedSteps,
          totalSteps: session?.progress_data?.totalSteps,
        });

        if (session?.progress_data) {
          this.updateProgress(sessionId, session.progress_data);
        }

        // Stop polling if analysis is completed or failed
        if (session?.status === "completed" || session?.status === "failed") {
          console.log("Progress polling stopped:", {
            sessionId: sessionId.slice(0, 8),
            finalStatus: session.status,
          });

          // Create corrected progress data that matches the actual session status
          const finalProgressData: AnalysisProgress = {
            analysisId: sessionId,
            status: session.status, // Use actual session status, not outdated progress_data.status
            progress: session.status === "completed" ? 100 : 0,
            currentStep:
              session.status === "completed"
                ? "Analysis completed successfully!"
                : session.error_message || "Analysis failed",
            completedSteps: session.progress_data?.totalSteps || 1,
            totalSteps: session.progress_data?.totalSteps || 1,
            ...(session.status === "failed" &&
              session.error_message && {
                error: session.error_message,
              }),
          };

          console.log("Sending final progress update to UI:", {
            sessionId: sessionId.slice(0, 8),
            finalStatus: session.status,
            correctedStatus: finalProgressData.status,
            progress: finalProgressData.progress,
            currentStep: finalProgressData.currentStep,
          });

          // Send corrected progress data to UI
          this.updateProgress(sessionId, finalProgressData);

          clearInterval(pollInterval);
          this.pollingIntervals.delete(sessionId);
        }
      } catch (error) {
        console.error("Progress polling error:", error);
      }
    }, 2000); // Poll every 2 seconds

    // Store interval for cleanup
    this.pollingIntervals.set(sessionId, pollInterval);

    // 10-minute timeout protection
    setTimeout(() => {
      const interval = this.pollingIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.pollingIntervals.delete(sessionId);
        this.handleAnalysisTimeout(sessionId);
      }
    }, 1200000); // 20 minutes
  }

  private async handleAnalysisTimeout(sessionId: string) {
    try {
      // Mark analysis as failed due to timeout
      await this.updateAnalysisSession(sessionId, {
        status: "failed",
        error_message: "Analysis timed out after 10 minutes",
        completed_at: new Date().toISOString(),
        progress_data: {
          analysisId: sessionId,
          status: "failed",
          progress: 0,
          currentStep: "Analysis timed out",
          completedSteps: 0,
          totalSteps: 1,
          error: "Analysis timed out after 10 minutes. Please try again.",
        },
      });

      // Update progress callback
      this.updateProgress(sessionId, {
        analysisId: sessionId,
        status: "failed",
        progress: 0,
        currentStep: "Analysis timed out",
        completedSteps: 0,
        totalSteps: 1,
        error: "Analysis timed out after 10 minutes. Please try again.",
      });
    } catch (error) {
      console.error("Failed to handle analysis timeout:", error);
    }
  }

  private async updateAnalysisSession(
    sessionId: string,
    updates: Partial<{
      status: AnalysisStatus;
      progress_data: AnalysisProgress;
      error_message: string;
      started_at: string;
      completed_at: string;
    }>
  ): Promise<void> {
    const { error } = await supabase
      .schema("beekon_data")
      .from("analysis_sessions")
      .update(updates)
      .eq("id", sessionId);

    if (error) {
      console.error("Failed to update analysis session:", error);
      throw error;
    }
  }

  async getAnalysisSession(sessionId: string): Promise<AnalysisSession | null> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("analysis_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error) {
      console.error("Failed to get analysis session:", error);
      return null;
    }

    return data as unknown as AnalysisSession;
  }

  async getAnalysisSessionsForWebsite(
    websiteId: string
  ): Promise<AnalysisSession[]> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("analysis_sessions")
      .select("*")
      .eq("website_id", websiteId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to get analysis sessions:", error);
      return [];
    }

    return data as unknown as AnalysisSession[];
  }

  // This method would be called by webhook handlers or polling
  async handleAnalysisUpdate(
    sessionId: string,
    update: Partial<AnalysisProgress>
  ) {
    // Update the analysis session in the database
    const progressData = {
      ...update,
      analysisId: sessionId,
    };

    await this.updateAnalysisSession(sessionId, {
      progress_data: progressData as AnalysisProgress,
      ...(update.status === "completed" && {
        status: "completed",
        completed_at: new Date().toISOString(),
      }),
      ...(update.status === "failed" && {
        status: "failed",
        error_message: update.error,
      }),
    });

    // Update in-memory progress callbacks
    const callback = this.progressCallbacks.get(sessionId);
    if (callback) {
      const currentProgress = await this.getCurrentProgress(sessionId);
      callback({ ...currentProgress, ...update });
    }
  }

  private async getCurrentProgress(
    sessionId: string
  ): Promise<AnalysisProgress> {
    const session = await this.getAnalysisSession(sessionId);

    if (session && session.progress_data) {
      return session.progress_data;
    }

    // Fallback if no progress data is found
    return {
      analysisId: sessionId,
      status: "running",
      progress: 0,
      currentStep: "Processing...",
      completedSteps: 0,
      totalSteps: 1,
    };
  }

  async saveAnalysisResult(result: {
    promptId: string;
    llmProvider: string;
    websiteId: string;
    isMentioned: boolean;
    rankPosition?: number;
    sentimentScore?: number;
    responseText?: string;
    confidenceScore?: number;
    analysisSessionId?: string;
  }) {
    const { error } = await supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .insert({
        prompt_id: result.promptId,
        llm_provider: result.llmProvider,
        website_id: result.websiteId,
        is_mentioned: result.isMentioned,
        rank_position: result.rankPosition,
        sentiment_score: result.sentimentScore,
        response_text: result.responseText,
        confidence_score: result.confidenceScore,
        analysis_session_id: result.analysisSessionId,
        analyzed_at: new Date().toISOString(),
      });

    if (error) throw error;
  }

  // Transform analysis results into clean, flattened export format
  private transformAnalysisForExport(
    results: UIAnalysisResult[]
  ): Record<string, unknown>[] {
    return results.flatMap((result) => {
      const exportRows: Record<string, unknown>[] = [];

      // Analysis Information Section
      exportRows.push(
        {
          category: "Analysis Info",
          metric: "Topic",
          value: result.topic,
          unit: "text",
        },
        {
          category: "Analysis Info",
          metric: "Prompt",
          value: result.prompt,
          unit: "text",
        },
        {
          category: "Analysis Info",
          metric: "Status",
          value: result.status,
          unit: "status",
        },
        {
          category: "Analysis Info",
          metric: "Analysis Date",
          value: new Date(result.created_at).toLocaleDateString(),
          unit: "date",
        },
        {
          category: "Analysis Info",
          metric: "Last Updated",
          value: new Date(result.updated_at).toLocaleDateString(),
          unit: "date",
        }
      );

      // Add analysis session info if available
      if (result.analysis_name) {
        exportRows.push({
          category: "Analysis Info",
          metric: "Analysis Session",
          value: result.analysis_name,
          unit: "text",
        });
      }

      // Performance Metrics Section
      const mentionedCount = result.llm_results.filter(
        (llm) => llm.is_mentioned
      ).length;
      const totalProviders = result.llm_results.length;
      const averageConfidence =
        result.llm_results.length > 0
          ? (result.llm_results.reduce(
              (sum, llm) => sum + (llm.confidence_score || 0),
              0
            ) /
              result.llm_results.length) *
            100
          : 0;
      const averageRank =
        result.llm_results.filter((llm) => llm.rank_position !== null).length >
        0
          ? result.llm_results
              .filter((llm) => llm.rank_position !== null)
              .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) /
            result.llm_results.filter((llm) => llm.rank_position !== null)
              .length
          : 0;
      const averageSentiment =
        result.llm_results.length > 0
          ? (result.llm_results.reduce(
              (sum, llm) => sum + (llm.sentiment_score || 0),
              0
            ) /
              result.llm_results.length) *
            100
          : 0;

      exportRows.push(
        {
          category: "Performance",
          metric: "Overall Confidence",
          value: `${averageConfidence.toFixed(1)}%`,
          unit: "percentage",
        },
        {
          category: "Performance",
          metric: "Mention Rate",
          value: `${mentionedCount} of ${totalProviders} providers`,
          unit: "ratio",
        },
        {
          category: "Performance",
          metric: "Average Ranking",
          value: averageRank > 0 ? averageRank.toFixed(1) : "N/A",
          unit: "position",
        },
        {
          category: "Performance",
          metric: "Average Sentiment",
          value: `${averageSentiment.toFixed(1)}%`,
          unit: "percentage",
        }
      );

      // LLM Results Section
      result.llm_results.forEach((llmResult, index) => {
        const mentionStatus = llmResult.is_mentioned
          ? "Mentioned"
          : "Not Mentioned";
        const rankText = llmResult.rank_position
          ? `Rank ${llmResult.rank_position}`
          : "No ranking";
        const confidenceText = `${(
          (llmResult.confidence_score || 0) * 100
        ).toFixed(1)}%`;
        const sentimentText = `${(
          (llmResult.sentiment_score || 0) * 100
        ).toFixed(1)}%`;

        exportRows.push(
          {
            category: "LLM Results",
            metric: `${llmResult.llm_provider} - Status`,
            value: mentionStatus,
            unit: "status",
          },
          {
            category: "LLM Results",
            metric: `${llmResult.llm_provider} - Ranking`,
            value: rankText,
            unit: "position",
          },
          {
            category: "LLM Results",
            metric: `${llmResult.llm_provider} - Confidence`,
            value: confidenceText,
            unit: "percentage",
          },
          {
            category: "LLM Results",
            metric: `${llmResult.llm_provider} - Sentiment`,
            value: sentimentText,
            unit: "percentage",
          }
        );

        // Add summary text if available (truncated for readability)
        if (llmResult.summary_text) {
          const truncatedSummary =
            llmResult.summary_text.length > 100
              ? llmResult.summary_text.substring(0, 100) + "..."
              : llmResult.summary_text;
          exportRows.push({
            category: "LLM Results",
            metric: `${llmResult.llm_provider} - Summary`,
            value: truncatedSummary,
            unit: "text",
          });
        }
      });

      // Insights Section
      if (result.prompt_strengths && result.prompt_strengths.length > 0) {
        result.prompt_strengths.forEach((strength, index) => {
          exportRows.push({
            category: "Insights",
            metric: `Strength #${index + 1}`,
            value: strength,
            unit: "text",
          });
        });
      }

      if (
        result.prompt_opportunities &&
        result.prompt_opportunities.length > 0
      ) {
        result.prompt_opportunities.forEach((opportunity, index) => {
          exportRows.push({
            category: "Insights",
            metric: `Opportunity #${index + 1}`,
            value: opportunity,
            unit: "text",
          });
        });
      }

      if (result.recommendation_text) {
        exportRows.push({
          category: "Insights",
          metric: "Recommendation",
          value: result.recommendation_text,
          unit: "text",
        });
      }

      return exportRows;
    });
  }

  async exportAnalysisResults(
    analysisIds: string[],
    format: "pdf" | "csv" | "json" | "word"
  ): Promise<Blob> {
    try {
      // Fetch all analysis results for the given IDs
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("llm_analysis_results")
        .select(
          `
          *,
          prompts (
            id,
            prompt_text,
            reporting_text,
            recommendation_text,
            strengths,
            opportunities,
            topics (
              topic_name,
              topic_keywords
            )
          )
        `
        )
        .in("prompt_id", analysisIds);

      if (error) throw error;

      // Transform data using the shared transformation function
      const results = this.transformAnalysisData(data);

      // Transform to clean, flattened export format
      const exportFormattedData = this.transformAnalysisForExport(results);

      // Use enhanced export service for all formats
      const { exportService } = await import("./exportService");
      const exportData = {
        title: "Analysis Results Export",
        data: exportFormattedData,
        exportedAt: new Date().toISOString(),
        totalRecords: results.length,
        metadata: {
          exportType: "analysis_results",
          generatedBy: "Beekon AI Analysis Service",
          originalResultCount: results.length,
          exportRowCount: exportFormattedData.length,
        },
      };

      return await exportService.exportData(exportData, format, {
        exportType: "analysis",
        customFilename: `analysis_results_${results.length}_items`,
      });
    } catch (error) {
      console.error("Failed to export analysis results:", error);
      throw error;
    }
  }

  private generateJsonExport(results: UIAnalysisResult[]): Blob {
    const exportData = {
      analysisResults: results,
      exportedAt: new Date().toISOString(),
      totalResults: results.length,
      totalLLMResults: results.reduce(
        (sum, r) => sum + r.llm_results.length,
        0
      ),
    };

    return new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
  }

  private generateCsvExport(results: UIAnalysisResult[]): Blob {
    const headers = [
      "Analysis ID",
      "Prompt",
      "Topic",
      "Website ID",
      "Status",
      "Confidence",
      "Created At",
      "LLM Provider",
      "Mentioned",
      "Rank Position",
      "Confidence Score",
      "Sentiment Score",
      "Response Text",
      "Analyzed At",
    ];

    let csvContent = headers.join(",") + "\n";

    results.forEach((result) => {
      result.llm_results.forEach((llmResult) => {
        const row = [
          result.id,
          `"${result.prompt.replace(/"/g, '""')}"`, // Escape quotes
          result.topic,
          result.website_id,
          result.status,
          result.confidence,
          result.created_at,
          llmResult.llm_provider,
          llmResult.is_mentioned ? "Yes" : "No",
          llmResult.rank_position || "",
          llmResult.confidence_score || "",
          llmResult.sentiment_score || "",
          `"${(llmResult.response_text || "").replace(/"/g, '""')}"`, // Escape quotes
          llmResult.analyzed_at,
        ];
        csvContent += row.join(",") + "\n";
      });
    });

    return new Blob([csvContent], { type: "text/csv" });
  }

  private generatePdfExport(results: UIAnalysisResult[]): Blob {
    // For now, generate a structured text document that can be saved as PDF
    // In a production environment, you would use a PDF library like jsPDF or Puppeteer

    let pdfContent = "ANALYSIS RESULTS EXPORT\n";
    pdfContent += "========================\n\n";
    pdfContent += `Exported on: ${new Date().toLocaleString()}\n`;
    pdfContent += `Total Analysis Results: ${results.length}\n`;
    pdfContent += `Total LLM Results: ${results.reduce(
      (sum, r) => sum + r.llm_results.length,
      0
    )}\n\n`;

    results.forEach((result, index) => {
      pdfContent += `${index + 1}. ANALYSIS RESULT\n`;
      pdfContent += `-`.repeat(50) + "\n";
      pdfContent += `ID: ${result.id}\n`;
      pdfContent += `Prompt: ${result.prompt}\n`;
      pdfContent += `Topic: ${result.topic}\n`;
      pdfContent += `Confidence: ${result.confidence}%\n`;
      pdfContent += `Created: ${new Date(
        result.created_at
      ).toLocaleString()}\n\n`;

      pdfContent += "LLM RESULTS:\n";
      result.llm_results.forEach((llm, llmIndex) => {
        pdfContent += `  ${llmIndex + 1}. ${llm.llm_provider.toUpperCase()}\n`;
        pdfContent += `     Mentioned: ${llm.is_mentioned ? "Yes" : "No"}\n`;
        if (llm.rank_position) {
          pdfContent += `     Rank: ${llm.rank_position}\n`;
        }
        if (llm.sentiment_score !== null) {
          pdfContent += `     Sentiment: ${
            llm.sentiment_score > 0.1
              ? "Positive"
              : llm.sentiment_score < -0.1
              ? "Negative"
              : "Neutral"
          }\n`;
        }
        if (llm.response_text) {
          pdfContent += `     Response: ${llm.response_text}\n`;
        }
        pdfContent += "\n";
      });

      pdfContent += "\n";
    });

    return new Blob([pdfContent], { type: "text/plain" });
  }
}

export const analysisService = AnalysisService.getInstance();
