import { supabase } from "@/integrations/supabase/client";
import { sendN8nWebhook } from "@/lib/http-request";
import { AnalysisResult, LLMResult, UIAnalysisResult } from "@/types/database";

export type AnalysisStatus = "pending" | "running" | "completed" | "failed";

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
      const promptIds = await this.createPrompts(
        config.customPrompts,
        topicIds
      );

      // Start the analysis process
      await this.startAnalysis(analysisSession.id, config, promptIds);

      // Trigger N8N webhook for actual analysis
      await this.triggerAnalysisWebhook(analysisSession.id, config);

      return analysisSession.id;
    } catch (error) {
      console.error("Failed to create analysis:", error);
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
  ): Promise<string[]> {
    const promptIds: string[] = [];

    for (let i = 0; i < customPrompts.length; i++) {
      const prompt = customPrompts[i];
      const topicId = topicIds[i % topicIds.length]; // Cycle through topics

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
      promptIds.push(newPrompt.id);
    }

    return promptIds;
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

    console.log("config", config);
    console.log("workspaceId", workspaceId);

    const response = await sendN8nWebhook("webhook/manually-added-analysis", {
      workspaceId,
      config,
      userId,
    });

    if (!response.success) {
      console.error("An error occurred" + response.messages);
    }

    return data as unknown as AnalysisSession;
  }

  private async startAnalysis(
    sessionId: string,
    config: AnalysisConfig,
    promptIds: string[]
  ): Promise<void> {
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
        totalSteps: promptIds.length * config.llmModels.length,
      },
    });

    // Initialize progress tracking
    this.updateProgress(sessionId, {
      analysisId: sessionId,
      status: "pending",
      progress: 0,
      currentStep: "Initializing analysis...",
      completedSteps: 0,
      totalSteps: promptIds.length * config.llmModels.length,
    });
  }

  private async triggerAnalysisWebhook(
    sessionId: string,
    config: AnalysisConfig
  ) {
    try {
      const webhookPayload = {
        analysisId: sessionId,
        sessionId,
        config,
        timestamp: new Date().toISOString(),
      };

      await sendN8nWebhook("analysis/start", webhookPayload);

      const progressData = {
        analysisId: sessionId,
        status: "running" as AnalysisStatus,
        progress: 10,
        currentStep: "Starting LLM analysis...",
        completedSteps: 0,
        totalSteps: config.llmModels.length * config.customPrompts.length,
      };

      await this.updateAnalysisSession(sessionId, {
        status: "running",
        progress_data: progressData,
      });

      this.updateProgress(sessionId, progressData);
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

    data?.forEach((row) => {
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

  async getAnalysisResults(
    websiteId: string,
    filters?: {
      topic?: string;
      llmProvider?: string;
      status?: AnalysisStatus;
      dateRange?: { start: string; end: string };
      searchQuery?: string;
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
  }

  private updateProgress(analysisId: string, progress: AnalysisProgress) {
    const callback = this.progressCallbacks.get(analysisId);
    if (callback) {
      callback(progress);
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

    return data as AnalysisSession;
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

  async exportAnalysisResults(
    analysisIds: string[],
    format: "pdf" | "csv" | "json" | "excel" | "word"
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

      // Use enhanced export service for all formats
      const { exportService } = await import("./exportService");
      const exportData = {
        title: "Analysis Results Export",
        data: results,
        exportedAt: new Date().toISOString(),
        totalRecords: results.length,
        metadata: {
          exportType: "analysis_results",
          generatedBy: "Beekon AI Analysis Service",
          analysisIds: analysisIds,
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
