/**
 * Batch API service for optimizing network requests
 * Combines related data fetching into single requests to reduce network overhead
 */

import { analysisService } from "./analysisService";
import { competitorService } from "./competitorService";
import { competitorAnalysisService } from "./competitorAnalysisService";
import { dashboardService } from "./dashboardService";
import type {
  Topic,
  LLMProvider,
  WebsiteMetadata,
  CompetitorFilters,
  DashboardFilters,
} from "@/contexts/AppStateContext";
import type { AnalysisFilters } from "@/hooks/useAnalysisQuery";
import { normalizeCompetitorStatus } from "@/utils/competitorStatusUtils";
import { sanitizeChartNumber, sanitizeSentimentScore } from "@/utils/chartDataValidation";

// Batch request types
export interface BatchRequest {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  _resolve?: (value: unknown) => void;
  _reject?: (error: unknown) => void;
}

export interface BatchResponse<T = unknown> {
  id: string;
  data: T;
  error?: string;
  timestamp: number;
}

// Define analysis result type for better type safety
export interface AnalysisResult {
  id: string;
  topic: string;
  llmProvider: string;
  score: number;
  createdAt: string;
  isMentioned: boolean;
  summary?: string;
}

// Website initialization data (everything needed for website switching)
export interface WebsiteInitData {
  metadata: WebsiteMetadata;
  topics: Topic[];
  llmProviders: LLMProvider[];
  recentAnalyses: AnalysisResult[];
  basicMetrics: {
    totalAnalyses: number;
    lastAnalysisDate: string | null;
    averageScore: number;
  };
}

// Define competitor types for better type safety
export interface CompetitorData {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
  lastAnalyzed?: string;
  addedAt: string;
}

export interface BatchCompetitorPerformance {
  competitorId: string;
  shareOfVoice: number;
  mentionCount: number;
  averageRank: number;
  sentimentScore: number;
  trend: "up" | "down" | "stable";
}

export interface DashboardMetrics {
  totalAnalyses: number;
  averageVisibility: number;
  competitorCount: number;
  lastAnalysisDate?: string;
  growthRate: number;
}

export interface TimeSeriesData {
  date: string;
  value: number;
  label: string;
}

export interface PerformanceMetrics {
  id: string;
  name: string;
  value: number;
  change: number;
  trend: "up" | "down" | "stable";
}

// Page-specific batch data structures
export interface AnalysisPageData {
  topics: Topic[];
  llmProviders: LLMProvider[];
  analysisSessions: Array<{ id: string; name: string; resultCount: number }>;
  recentResults: AnalysisResult[];
  metadata: WebsiteMetadata;
}

export interface CompetitorsPageData {
  competitors: CompetitorData[];
  performance: BatchCompetitorPerformance[];
  analytics: Record<string, unknown>; // Full CompetitorAnalytics structure
  topics: Topic[]; // Shared with analysis page
}

export interface DashboardPageData {
  metrics: DashboardMetrics;
  timeSeriesData: TimeSeriesData[];
  topicPerformance: PerformanceMetrics[];
  llmPerformance: PerformanceMetrics[];
  websitePerformance: PerformanceMetrics[];
}

class BatchService {
  private batchQueue: Map<string, BatchRequest[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // 50ms batch window

  /**
   * Get complete initialization data for a website
   * Combines all necessary data for instant website switching
   */
  async getWebsiteInitData(websiteId: string): Promise<WebsiteInitData> {
    try {
      // Fetch all data in parallel for maximum speed
      const [metadata, topics, llmProviders, recentAnalyses, basicMetrics] =
        await Promise.all([
          analysisService.getWebsiteMetadata(websiteId),
          analysisService.getTopicsForWebsite(websiteId),
          analysisService.getAvailableLLMProviders(websiteId),
          this.getRecentAnalyses(websiteId, 5), // Last 5 analyses for quick context
          this.getBasicMetrics(websiteId),
        ]);

      // Transform topics to include "All Topics" option
      const topicsWithAll: Topic[] = [
        {
          id: "all",
          name: "All Topics",
          resultCount: topics.reduce(
            (sum, topic) => sum + topic.resultCount,
            0
          ),
        },
        ...topics,
      ];

      // Transform LLM providers to include "All LLMs" option
      const llmProvidersWithAll: LLMProvider[] = [
        {
          id: "all",
          name: "All LLMs",
          description: "All available LLM providers",
          resultCount: llmProviders.reduce(
            (sum, provider) => sum + provider.resultCount,
            0
          ),
        },
        ...llmProviders,
      ];

      return {
        metadata,
        topics: topicsWithAll,
        llmProviders: llmProvidersWithAll,
        recentAnalyses,
        basicMetrics,
      };
    } catch (error) {
      // Error handling - console removed for security
      throw new Error(`Failed to initialize data for website ${websiteId}`);
    }
  }

  /**
   * Get all data needed for the Analysis page
   */
  async getAnalysisPageData(
    websiteId: string,
    filters?: Partial<AnalysisFilters>
  ): Promise<AnalysisPageData> {
    try {
      const [topics, llmProviders, analysisSessions, recentResults, metadata] =
        await Promise.all([
          analysisService.getTopicsForWebsite(websiteId),
          analysisService.getAvailableLLMProviders(websiteId),
          this.getAnalysisSessions(websiteId),
          analysisService.getAnalysisResultsPaginated(websiteId, {
            limit: 20,
            filters: filters || {},
          }),
          analysisService.getWebsiteMetadata(websiteId),
        ]);

      // Transform data with "All" options
      const topicsWithAll: Topic[] = [
        {
          id: "all",
          name: "All Topics",
          resultCount: topics.reduce((s, t) => s + t.resultCount, 0),
        },
        ...topics,
      ];

      const llmProvidersWithAll: LLMProvider[] = [
        {
          id: "all",
          name: "All LLMs",
          description: "All LLM providers",
          resultCount: llmProviders.reduce((s, p) => s + p.resultCount, 0),
        },
        ...llmProviders,
      ];

      // Transform UIAnalysisResult[] to AnalysisResult[]
      const transformedResults: AnalysisResult[] = recentResults.results.map(
        (result) => ({
          id: result.id,
          topic: result.topic,
          llmProvider: result.llm_results[0]?.llm_provider || "Unknown",
          score: result.confidence,
          createdAt: result.created_at,
          isMentioned: result.status === "mentioned",
          summary: result.reporting_text || undefined,
        })
      );

      return {
        topics: topicsWithAll,
        llmProviders: llmProvidersWithAll,
        analysisSessions,
        recentResults: transformedResults,
        metadata,
      };
    } catch (error) {
      // Error handling - console removed for security
      throw new Error(`Failed to load analysis data for website ${websiteId}`);
    }
  }

  /**
   * Get all data needed for the Competitors page
   */
  async getCompetitorsPageData(
    websiteId: string,
    filters?: Partial<CompetitorFilters>
  ): Promise<CompetitorsPageData> {
    try {
      console.log(`🏆 BatchService: Loading competitors page data for website ${websiteId}`, { filters });

      // IMPROVED: Use Promise.allSettled for resilient parallel loading
      // Core data (essential) - if these fail, the whole request fails
      const coreDataPromises = [
        competitorService.getCompetitors(websiteId).catch(error => {
          console.error('❌ Failed to load competitors:', error);
          throw error; // Critical - must succeed
        }),
        competitorAnalysisService.getCompetitorShareOfVoice(
          websiteId,
          filters?.dateRange as { start: string; end: string } | undefined
        ).catch(error => {
          console.error('❌ Failed to load share of voice:', error);
          return []; // Fallback to empty array instead of failing entire request
        })
      ];

      // Optional data (nice-to-have) - if these fail, continue with core data
      const optionalDataPromises = [
        competitorAnalysisService.getCompetitiveGapAnalysis(
          websiteId,
          filters?.dateRange as { start: string; end: string } | undefined
        ).catch(error => {
          console.warn('⚠️ Failed to load gap analysis (non-critical):', error);
          return []; // Fallback
        }),
        competitorAnalysisService.getCompetitorInsights(
          websiteId,
          filters?.dateRange as { start: string; end: string } | undefined
        ).catch(error => {
          console.warn('⚠️ Failed to load competitor insights (non-critical):', error);
          return []; // Fallback
        }),
        analysisService.getTopicsForWebsite(websiteId).catch(error => {
          console.warn('⚠️ Failed to load topics (non-critical):', error);
          return []; // Fallback
        }),
        competitorService.getCompetitorTimeSeriesData(
          websiteId,
          undefined, // all competitors
          this.calculateDaysFromDateRange(filters?.dateRange as { start: string; end: string } | undefined)
        ).catch(error => {
          console.warn('⚠️ Failed to load time series data (non-critical):', error);
          return []; // Fallback
        })
      ];

      // Load core data first, then optional data
      const [competitors, shareOfVoice] = await Promise.all(coreDataPromises);
      const [gapAnalysis, insights, topics, timeSeriesData] = await Promise.all(optionalDataPromises);

      console.log(`✅ BatchService: Data loaded successfully`, {
        competitors: competitors?.length || 0,
        shareOfVoice: shareOfVoice?.length || 0,
        gapAnalysis: gapAnalysis?.length || 0,
        insights: insights?.length || 0,
        topics: topics?.length || 0,
        timeSeriesData: timeSeriesData?.length || 0
      });

      // Transform shareOfVoice data to match expected performance interface with NaN protection
      const performance = (shareOfVoice || []).map((competitor: any) => {
        // Sanitize all numeric values to prevent NaN propagation to charts
        const sanitizedShareOfVoice = sanitizeChartNumber(competitor.shareOfVoice, 0);
        const rankPosition = competitor.avgRankPosition || competitor.avg_rank || 0;
        const sanitizedRankPosition = sanitizeChartNumber(rankPosition, 0);
        const totalMentions = competitor.totalMentions || competitor.total_mentions || 0;
        const sanitizedTotalMentions = sanitizeChartNumber(totalMentions, 0);
        const sentimentScore = competitor.avgSentimentScore || competitor.sentiment_score || 0;
        const sanitizedSentimentScore = sanitizeSentimentScore(sentimentScore);

        return {
          competitorId: competitor.competitorId || competitor.id,
          domain: competitor.competitorDomain || competitor.competitor_domain,
          name: competitor.competitorName || competitor.competitor_name || competitor.name,
          shareOfVoice: sanitizedShareOfVoice,
          averageRank: sanitizedRankPosition,
          mentionCount: sanitizedTotalMentions,
          sentimentScore: sanitizedSentimentScore,
          visibilityScore: sanitizedShareOfVoice, // Use sanitized value
          trend: "stable" as const, // Default trend
          trendPercentage: 0,
          lastAnalyzed: competitor.lastAnalyzedAt || competitor.analysis_completed_at || new Date().toISOString(),
          isActive: competitor.is_active !== undefined ? competitor.is_active : true,
          // FIXED: Use normalized status mapping with proper fallback
          analysisStatus: normalizeCompetitorStatus(
            competitor.analysisStatus || competitor.analysis_status
          ),
        };
      });

      // Create comprehensive analytics object
      const analytics = {
        totalCompetitors: competitors?.length || 0,
        activeCompetitors: competitors?.filter((c: any) => c.is_active)?.length || 0,
        averageCompetitorRank: shareOfVoice && shareOfVoice.length > 0
          ? shareOfVoice.reduce((sum, c: any) => {
              const rank = sanitizeChartNumber(c.avgRankPosition || c.avg_rank, 0);
              return sum + rank;
            }, 0) / shareOfVoice.length
          : 0,
        shareOfVoiceData: (shareOfVoice || []).map((competitor: any) => ({
          name: competitor.competitorName || competitor.competitor_name || competitor.competitorDomain || competitor.competitor_domain,
          shareOfVoice: sanitizeChartNumber(competitor.shareOfVoice, 0),
          totalMentions: sanitizeChartNumber(competitor.totalMentions || competitor.total_mentions, 0),
          totalAnalyses: sanitizeChartNumber(competitor.totalAnalyses || competitor.total_analyses, 0),
          competitorId: competitor.competitorId || competitor.id,
          avgRank: sanitizeChartNumber(competitor.avgRankPosition || competitor.avg_rank, 0),
          dataType: "share_of_voice" as const,
        })),
        gapAnalysis,
        insights,
        marketShareData: [], // Will be populated by UI if needed
        timeSeriesData: timeSeriesData || [], // FIXED: Now populated with actual data from competitorService
        competitiveGaps: [], // Will be populated by UI if needed
      };

      return {
        competitors: competitors as unknown as CompetitorData[],
        performance: performance as unknown as BatchCompetitorPerformance[],
        analytics: analytics as unknown as Record<string, unknown>,
        topics: (topics as Topic[]) || [],
      };
    } catch (error) {
      console.error('BatchService competitors page data error:', error);
      throw new Error(
        `Failed to load competitors data for website ${websiteId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get all data needed for the Dashboard page
   */
  async getDashboardPageData(
    websiteIds: string[],
    filters?: Partial<DashboardFilters>
  ): Promise<DashboardPageData> {
    try {
      const [
        metrics,
        timeSeriesData,
        topicPerformance,
        llmPerformance,
        websitePerformance,
      ] = await Promise.all([
        dashboardService.getDashboardMetrics(
          websiteIds,
          filters?.dateRange as { start: string; end: string } | undefined
        ),
        dashboardService.getTimeSeriesData(
          websiteIds,
          filters?.dateRange as "7d" | "30d" | "90d" | undefined
        ),
        dashboardService.getTopicPerformance(websiteIds),
        dashboardService.getLLMPerformance(websiteIds),
        dashboardService.getWebsitePerformance(websiteIds),
      ]);

      return {
        metrics: {
          totalAnalyses: metrics.totalAnalyses,
          averageVisibility:
            ((metrics as unknown as Record<string, unknown>)
              ?.averageVisibility as number) || 0,
          competitorCount:
            ((metrics as unknown as Record<string, unknown>)
              ?.competitorCount as number) || 0,
          lastAnalysisDate: (metrics as unknown as Record<string, unknown>)
            ?.lastAnalysisDate as string,
          growthRate:
            ((metrics as unknown as Record<string, unknown>)
              ?.growthRate as number) || 0,
        },
        timeSeriesData: timeSeriesData.map((item: Record<string, unknown>) => ({
          date: item.date as string,
          value: (item.value as number) || 0,
          label: (item.label as string) || "",
        })),
        topicPerformance: topicPerformance.map(
          (item: Record<string, unknown>) => ({
            id: (item.id as string) || "",
            name: (item.name as string) || "",
            value: (item.value as number) || 0,
            change: (item.change as number) || 0,
            trend:
              (item.trend as "up" | "down" | "stable") || ("stable" as const),
          })
        ),
        llmPerformance: (llmPerformance as unknown[]).map((item: unknown) => ({
          id: ((item as Record<string, unknown>).id as string) || "",
          name: ((item as Record<string, unknown>).name as string) || "",
          value: ((item as Record<string, unknown>).value as number) || 0,
          change: ((item as Record<string, unknown>).change as number) || 0,
          trend:
            ((item as Record<string, unknown>).trend as
              | "up"
              | "down"
              | "stable") || ("stable" as const),
        })),
        websitePerformance: (websitePerformance as unknown[]).map(
          (item: unknown) => ({
            id: ((item as Record<string, unknown>).id as string) || "",
            name: ((item as Record<string, unknown>).name as string) || "",
            value: ((item as Record<string, unknown>).value as number) || 0,
            change: ((item as Record<string, unknown>).change as number) || 0,
            trend:
              ((item as Record<string, unknown>).trend as
                | "up"
                | "down"
                | "stable") || ("stable" as const),
          })
        ),
      };
    } catch (error) {
      // Error handling - console removed for security
      throw new Error("Failed to load dashboard data");
    }
  }

  /**
   * Batch multiple API requests together
   */
  async batchRequests<T>(
    requests: BatchRequest[]
  ): Promise<BatchResponse<T>[]> {
    const responses: BatchResponse<T>[] = [];

    console.log("requests", requests);

    // Process requests in parallel
    const promises = requests.map(async (request) => {
      try {
        let data: T;

        switch (request.type) {
          case "website_init":
            data = (await this.getWebsiteInitData(
              request.payload.websiteId as string
            )) as T;
            break;

          case "analysis_page":
            data = (await this.getAnalysisPageData(
              request.payload.websiteId as string,
              request.payload.filters as Partial<AnalysisFilters>
            )) as T;
            break;

          case "competitors_page":
            data = (await this.getCompetitorsPageData(
              request.payload.websiteId as string,
              request.payload.filters as Partial<CompetitorFilters>
            )) as T;
            break;

          case "dashboard_page":
            data = (await this.getDashboardPageData(
              request.payload.websiteIds as string[],
              request.payload.filters as Partial<DashboardFilters>
            )) as T;
            break;

          default:
            throw new Error(`Unknown batch request type: ${request.type}`);
        }

        return {
          id: request.id,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          id: request.id,
          data: null as T,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        };
      }
    });

    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        responses.push({
          id: requests[index]?.id || "",
          data: null as T,
          error: result.reason?.message || "Request failed",
          timestamp: Date.now(),
        });
      }
    });

    return responses;
  }

  /**
   * Queue a request for batching
   */
  queueRequest(request: BatchRequest): Promise<BatchResponse> {
    return new Promise((resolve, reject) => {
      // Add to appropriate batch queue
      const queueKey = this.getBatchQueueKey(request);
      if (!this.batchQueue.has(queueKey)) {
        this.batchQueue.set(queueKey, []);
      }

      this.batchQueue.get(queueKey)!.push(request);

      // Store resolve/reject for this specific request
      request._resolve = resolve as (value: unknown) => void;
      request._reject = reject;

      // Start batch timer if not already running
      this.scheduleBatch();
    });
  }

  private getBatchQueueKey(request: BatchRequest): string {
    // Group similar requests for batching
    switch (request.type) {
      case "website_init":
      case "analysis_page":
      case "competitors_page":
        return `website_${request.payload.websiteId}`;
      case "dashboard_page":
        return "dashboard";
      default:
        return "general";
    }
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(async () => {
      await this.processBatches();
      this.batchTimer = null;
    }, this.BATCH_DELAY);
  }

  private async processBatches(): Promise<void> {
    const batches = Array.from(this.batchQueue.entries());
    this.batchQueue.clear();

    // Process each batch
    for (const [_queueKey, requests] of batches) {
      if (requests.length === 0) continue;

      try {
        const responses = await this.batchRequests(requests);

        // Resolve individual request promises
        responses.forEach((response) => {
          const originalRequest = requests.find(
            (req) => req.id === response.id
          );
          if (originalRequest) {
            if (response.error) {
              originalRequest._reject?.(new Error(response.error));
            } else {
              originalRequest._resolve?.(response);
            }
          }
        });
      } catch (error) {
        // Reject all requests in this batch
        requests.forEach((request) => {
          request._reject?.(error);
        });
      }
    }
  }

  // Helper methods
  private calculateDaysFromDateRange(dateRange?: { start: string; end: string }): number {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      return 30; // Default to 30 days
    }

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const timeDiff = endDate.getTime() - startDate.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // Ensure reasonable bounds
    return Math.max(1, Math.min(365, daysDiff));
  }

  private async getRecentAnalyses(
    websiteId: string,
    limit: number = 5
  ): Promise<AnalysisResult[]> {
    try {
      const result = await analysisService.getAnalysisResultsPaginated(
        websiteId,
        {
          limit,
          filters: {},
        }
      );
      // Transform UIAnalysisResult[] to AnalysisResult[]
      return result.results.map((result) => ({
        id: result.id,
        topic: result.topic,
        llmProvider: result.llm_results[0]?.llm_provider || "Unknown",
        score: result.confidence,
        createdAt: result.created_at,
        isMentioned: result.status === "mentioned",
        summary: result.reporting_text || undefined,
      }));
    } catch (error) {
      // Error handling - console removed for security
      return [];
    }
  }

  private async getBasicMetrics(
    websiteId: string
  ): Promise<WebsiteInitData["basicMetrics"]> {
    try {
      // This would be a simplified metrics call
      const results = await analysisService.getAnalysisResultsPaginated(
        websiteId,
        {
          limit: 1,
          filters: {},
        }
      );

      return {
        totalAnalyses: results.results.length > 0 ? 100 : 0, // Placeholder
        lastAnalysisDate: results.results[0]?.created_at || null,
        averageScore: results.results.length > 0 ? 85 : 0, // Placeholder
      };
    } catch (error) {
      return {
        totalAnalyses: 0,
        lastAnalysisDate: null,
        averageScore: 0,
      };
    }
  }

  private async getAnalysisSessions(
    _websiteId: string
  ): Promise<Array<{ id: string; name: string; resultCount: number }>> {
    try {
      // This would fetch available analysis sessions
      // For now, return a default "All" option
      return [{ id: "all", name: "All Sessions", resultCount: 0 }];
    } catch (error) {
      return [{ id: "all", name: "All Sessions", resultCount: 0 }];
    }
  }
}

// Export singleton instance
export const batchService = new BatchService();

// Convenience functions for common batch operations
export const batchAPI = {
  /**
   * Initialize website data for instant switching
   */
  initializeWebsite: (websiteId: string) =>
    batchService.queueRequest({
      id: `init_${websiteId}_${Date.now()}`,
      type: "website_init",
      payload: { websiteId },
      timestamp: Date.now(),
    }),

  /**
   * Load complete analysis page data
   */
  loadAnalysisPage: (websiteId: string, filters?: Partial<AnalysisFilters>) =>
    batchService.queueRequest({
      id: `analysis_${websiteId}_${Date.now()}`,
      type: "analysis_page",
      payload: { websiteId, filters },
      timestamp: Date.now(),
    }),

  /**
   * Load complete competitors page data
   */
  loadCompetitorsPage: (
    websiteId: string,
    filters?: Partial<CompetitorFilters>
  ) =>
    batchService.queueRequest({
      id: `competitors_${websiteId}_${Date.now()}`,
      type: "competitors_page",
      payload: { websiteId, filters },
      timestamp: Date.now(),
    }),

  /**
   * Load complete dashboard page data
   */
  loadDashboardPage: (
    websiteIds: string[],
    filters?: Partial<DashboardFilters>
  ) =>
    batchService.queueRequest({
      id: `dashboard_${websiteIds.join(",")}_${Date.now()}`,
      type: "dashboard_page",
      payload: { websiteIds, filters },
      timestamp: Date.now(),
    }),
};
