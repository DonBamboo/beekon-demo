/**
 * Batch API service for optimizing network requests
 * Combines related data fetching into single requests to reduce network overhead
 */

import { analysisService } from './analysisService';
import { competitorService } from './competitorService';
import { dashboardService } from './dashboardService';
import type { Topic, LLMProvider, WebsiteMetadata, AnalysisFilters, CompetitorFilters, DashboardFilters } from '@/contexts/AppStateContext';

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

export interface CompetitorPerformance {
  competitorId: string;
  shareOfVoice: number;
  mentionCount: number;
  averageRank: number;
  sentimentScore: number;
  trend: 'up' | 'down' | 'stable';
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
  trend: 'up' | 'down' | 'stable';
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
  performance: CompetitorPerformance[];
  analytics: {
    totalCompetitors: number;
    averageShareOfVoice: number;
    topCompetitor: string;
    competitiveGaps: Array<{ topic: string; gap: number }>;
  };
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
      const [
        metadata,
        topics,
        llmProviders,
        recentAnalyses,
        basicMetrics,
      ] = await Promise.all([
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
          resultCount: topics.reduce((sum, topic) => sum + topic.resultCount, 0),
        },
        ...topics,
      ];

      // Transform LLM providers to include "All LLMs" option
      const llmProvidersWithAll: LLMProvider[] = [
        {
          id: "all",
          name: "All LLMs",
          description: "All available LLM providers",
          resultCount: llmProviders.reduce((sum, provider) => sum + provider.resultCount, 0),
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
      console.error('Failed to fetch website init data:', error);
      throw new Error(`Failed to initialize data for website ${websiteId}`);
    }
  }

  /**
   * Get all data needed for the Analysis page
   */
  async getAnalysisPageData(websiteId: string, filters?: Partial<AnalysisFilters>): Promise<AnalysisPageData> {
    try {
      const [
        topics,
        llmProviders,
        analysisSessions,
        recentResults,
        metadata,
      ] = await Promise.all([
        analysisService.getTopicsForWebsite(websiteId),
        analysisService.getAvailableLLMProviders(websiteId),
        this.getAnalysisSessions(websiteId),
        analysisService.getAnalysisResultsPaginated(websiteId, {
          limit: 20,
          filters: (filters || {}) as Partial<AnalysisFilters>,
        }),
        analysisService.getWebsiteMetadata(websiteId),
      ]);

      // Transform data with "All" options
      const topicsWithAll: Topic[] = [
        { id: "all", name: "All Topics", resultCount: topics.reduce((s, t) => s + t.resultCount, 0) },
        ...topics,
      ];

      const llmProvidersWithAll: LLMProvider[] = [
        { id: "all", name: "All LLMs", description: "All LLM providers", resultCount: llmProviders.reduce((s, p) => s + p.resultCount, 0) },
        ...llmProviders,
      ];

      return {
        topics: topicsWithAll,
        llmProviders: llmProvidersWithAll,
        analysisSessions,
        recentResults: recentResults.results as AnalysisResult[],
        metadata,
      };
    } catch (error) {
      console.error('Failed to fetch analysis page data:', error);
      throw new Error(`Failed to load analysis data for website ${websiteId}`);
    }
  }

  /**
   * Get all data needed for the Competitors page
   */
  async getCompetitorsPageData(websiteId: string, filters?: Partial<CompetitorFilters>): Promise<CompetitorsPageData> {
    try {
      const [
        competitors,
        performance,
        analytics,
        topics,
      ] = await Promise.all([
        competitorService.getCompetitors(websiteId),
        competitorService.getCompetitorPerformance(websiteId, filters?.dateRange as { start: string; end: string; } | undefined),
        competitorService.getCompetitiveAnalysis(websiteId, filters?.dateRange as { start: string; end: string; } | undefined),
        analysisService.getTopicsForWebsite(websiteId), // Shared data
      ]);

      return {
        competitors: competitors as CompetitorData[],
        performance: performance as CompetitorPerformance[],
        analytics: {
          totalCompetitors: analytics.totalCompetitors,
          averageShareOfVoice: (analytics as Record<string, unknown>)?.averageShareOfVoice as number || 0,
          topCompetitor: (analytics as Record<string, unknown>)?.topCompetitor as string || 'N/A',
          competitiveGaps: (analytics.competitiveGaps || []) as Array<{ topic: string; gap: number }>,
        },
        topics,
      };
    } catch (error) {
      console.error('Failed to fetch competitors page data:', error);
      throw new Error(`Failed to load competitors data for website ${websiteId}`);
    }
  }

  /**
   * Get all data needed for the Dashboard page
   */
  async getDashboardPageData(websiteIds: string[], filters?: Partial<DashboardFilters>): Promise<DashboardPageData> {
    try {
      const [
        metrics,
        timeSeriesData,
        topicPerformance,
        llmPerformance,
        websitePerformance,
      ] = await Promise.all([
        dashboardService.getDashboardMetrics(websiteIds, filters?.dateRange as { start: string; end: string; } | undefined),
        dashboardService.getTimeSeriesData(websiteIds, filters?.dateRange as "7d" | "30d" | "90d" | undefined),
        dashboardService.getTopicPerformance(websiteIds),
        dashboardService.getLLMPerformance(websiteIds),
        dashboardService.getWebsitePerformance(websiteIds),
      ]);

      return {
        metrics: {
          totalAnalyses: metrics.totalAnalyses,
          averageVisibility: (metrics as Record<string, unknown>)?.averageVisibility as number || 0,
          competitorCount: (metrics as Record<string, unknown>)?.competitorCount as number || 0,
          lastAnalysisDate: (metrics as Record<string, unknown>)?.lastAnalysisDate as string,
          growthRate: (metrics as Record<string, unknown>)?.growthRate as number || 0,
        },
        timeSeriesData: timeSeriesData.map((item: Record<string, unknown>) => ({
          date: item.date as string,
          value: (item.value as number) || 0,
          label: (item.label as string) || '',
        })),
        topicPerformance: topicPerformance.map((item: Record<string, unknown>) => ({
          id: (item.id as string) || '',
          name: (item.name as string) || '',
          value: (item.value as number) || 0,
          change: (item.change as number) || 0,
          trend: (item.trend as 'up' | 'down' | 'stable') || 'stable' as const,
        })),
        llmPerformance: llmPerformance.map((item: Record<string, unknown>) => ({
          id: (item.id as string) || '',
          name: (item.name as string) || '',
          value: (item.value as number) || 0,
          change: (item.change as number) || 0,
          trend: (item.trend as 'up' | 'down' | 'stable') || 'stable' as const,
        })),
        websitePerformance: websitePerformance.map((item: Record<string, unknown>) => ({
          id: (item.id as string) || '',
          name: (item.name as string) || '',
          value: (item.value as number) || 0,
          change: (item.change as number) || 0,
          trend: (item.trend as 'up' | 'down' | 'stable') || 'stable' as const,
        })),
      };
    } catch (error) {
      console.error('Failed to fetch dashboard page data:', error);
      throw new Error('Failed to load dashboard data');
    }
  }

  /**
   * Batch multiple API requests together
   */
  async batchRequests<T>(requests: BatchRequest[]): Promise<BatchResponse<T>[]> {
    const responses: BatchResponse<T>[] = [];

    // Process requests in parallel
    const promises = requests.map(async (request) => {
      try {
        let data: T;

        switch (request.type) {
          case 'website_init':
            data = await this.getWebsiteInitData(request.payload.websiteId as string) as T;
            break;
          
          case 'analysis_page':
            data = await this.getAnalysisPageData(request.payload.websiteId as string, request.payload.filters as Partial<AnalysisFilters>) as T;
            break;
          
          case 'competitors_page':
            data = await this.getCompetitorsPageData(request.payload.websiteId as string, request.payload.filters as Partial<CompetitorFilters>) as T;
            break;
          
          case 'dashboard_page':
            data = await this.getDashboardPageData(request.payload.websiteIds as string[], request.payload.filters as Partial<DashboardFilters>) as T;
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
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        };
      }
    });

    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        responses.push(result.value);
      } else {
        responses.push({
          id: requests[index]?.id || '',
          data: null as T,
          error: result.reason?.message || 'Request failed',
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
      case 'website_init':
      case 'analysis_page':
      case 'competitors_page':
        return `website_${request.payload.websiteId}`;
      case 'dashboard_page':
        return 'dashboard';
      default:
        return 'general';
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
          const originalRequest = requests.find(req => req.id === response.id);
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
  private async getRecentAnalyses(websiteId: string, limit: number = 5): Promise<AnalysisResult[]> {
    try {
      const result = await analysisService.getAnalysisResultsPaginated(websiteId, {
        limit,
        filters: {},
      });
      return result.results as AnalysisResult[];
    } catch (error) {
      console.warn('Failed to fetch recent analyses:', error);
      return [];
    }
  }

  private async getBasicMetrics(websiteId: string): Promise<WebsiteInitData['basicMetrics']> {
    try {
      // This would be a simplified metrics call
      const results = await analysisService.getAnalysisResultsPaginated(websiteId, {
        limit: 1,
        filters: {},
      });

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

  private async getAnalysisSessions(_websiteId: string): Promise<Array<{ id: string; name: string; resultCount: number }>> {
    try {
      // This would fetch available analysis sessions
      // For now, return a default "All" option
      return [
        { id: "all", name: "All Sessions", resultCount: 0 }
      ];
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
      type: 'website_init',
      payload: { websiteId },
      timestamp: Date.now(),
    }),

  /**
   * Load complete analysis page data
   */
  loadAnalysisPage: (websiteId: string, filters?: Partial<AnalysisFilters>) =>
    batchService.queueRequest({
      id: `analysis_${websiteId}_${Date.now()}`,
      type: 'analysis_page',
      payload: { websiteId, filters },
      timestamp: Date.now(),
    }),

  /**
   * Load complete competitors page data
   */
  loadCompetitorsPage: (websiteId: string, filters?: Partial<CompetitorFilters>) =>
    batchService.queueRequest({
      id: `competitors_${websiteId}_${Date.now()}`,
      type: 'competitors_page',
      payload: { websiteId, filters },
      timestamp: Date.now(),
    }),

  /**
   * Load complete dashboard page data
   */
  loadDashboardPage: (websiteIds: string[], filters?: Partial<DashboardFilters>) =>
    batchService.queueRequest({
      id: `dashboard_${websiteIds.join(',')}_${Date.now()}`,
      type: 'dashboard_page',
      payload: { websiteIds, filters },
      timestamp: Date.now(),
    }),
};