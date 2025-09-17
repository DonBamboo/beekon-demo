import { supabase } from "@/integrations/supabase/client";
import {
  analysisService,
  type AnalysisResult,
  type LLMResult,
} from "./analysisService";
import { generateExportFilename } from "@/lib/export-utils";

export interface DashboardMetrics {
  overallVisibilityScore: number;
  averageRanking: number;
  totalMentions: number;
  sentimentScore: number;
  totalAnalyses: number;
  activeWebsites: number;
  topPerformingTopic: string | null;
  improvementTrend: number; // percentage change from previous period
}

export interface TimeSeriesData {
  date: string;
  visibility: number;
  mentions: number;
  sentiment: number;
  [key: string]: unknown;}

export interface TopicPerformance {
  topic: string;
  visibility: number;
  mentions: number;
  averageRank: number;
  sentiment: number;
  trend: number; // percentage change
  [key: string]: unknown;}

export interface LLMPerformance {
  provider: string;
  mentionRate: number;
  averageRank: number;
  sentiment: number;
  totalAnalyses: number;
}

export interface WebsitePerformance {
  websiteId: string;
  domain: string;
  displayName: string;
  visibility: number;
  mentions: number;
  sentiment: number;
  lastAnalyzed: string;
}

export class DashboardService {
  private static instance: DashboardService;

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  /**
   * Get comprehensive dashboard metrics for a workspace - OPTIMIZED
   * Uses materialized views for lightning-fast performance
   */
  async getDashboardMetrics(
    websiteIds: string[],
    dateRange?: { start: string; end: string }
  ): Promise<DashboardMetrics> {
    if (websiteIds.length === 0) {
      return this.getEmptyMetrics();
    }

    try {
      // OPTIMIZED: Use materialized view function instead of expensive analysis queries
      const defaultDateRange = {
        start: dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: dateRange?.end || new Date().toISOString()
      };

      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_dashboard_metrics", {
          p_website_ids: websiteIds,
          p_date_start: defaultDateRange.start,
          p_date_end: defaultDateRange.end,
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result) {
        return this.getEmptyMetrics();
      }

      return {
        overallVisibilityScore: Number(result.overall_visibility_score || 0),
        averageRanking: Number(result.average_ranking || 4.0),
        totalMentions: Number(result.total_mentions || 0),
        sentimentScore: Number(result.sentiment_score || 2.5),
        totalAnalyses: Number(result.total_analyses || 0),
        activeWebsites: Number(result.active_websites || 0),
        topPerformingTopic: result.top_performing_topic || null,
        improvementTrend: Number(result.improvement_trend || 0),
      };
    } catch (error) {
      // Failed to get dashboard metrics - fallback to empty metrics
      return this.getEmptyMetrics();
    }
  }

  /**
   * Get time series data for dashboard charts - OPTIMIZED
   * Uses materialized views for fast time series data
   */
  async getTimeSeriesData(
    websiteIds: string[],
    period: "7d" | "30d" | "90d" = "7d"
  ): Promise<TimeSeriesData[]> {
    if (websiteIds.length === 0) return [];

    try {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;

      // OPTIMIZED: Use materialized view function for instant time series data
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_dashboard_time_series", {
          p_website_ids: websiteIds,
          p_days: days,
        });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        date: row.date,
        visibility: Number(row.visibility || 0),
        mentions: Number(row.mentions || 0),
        sentiment: Number(row.sentiment || 2.5),
      }));
    } catch (error) {
      // Failed to get time series data - return empty array
      return [];
    }
  }

  /**
   * Get topic performance data - OPTIMIZED
   * Uses competitive gap analysis materialized view
   */
  async getTopicPerformance(
    websiteIds: string[],
    limit: number = 10
  ): Promise<TopicPerformance[]> {
    if (websiteIds.length === 0) return [];

    try {
      // OPTIMIZED: Use materialized view function for topic performance
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_topic_performance_dashboard", {
          p_website_ids: websiteIds,
          p_limit: limit,
        });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        topic: row.topic,
        visibility: Number(row.visibility || 0),
        mentions: Number(row.mentions || 0),
        averageRank: Number(row.average_rank || 4.0),
        sentiment: Number(row.sentiment || 2.5),
        trend: Number(row.trend || 0),
      }));
    } catch (error) {
      // Failed to get topic performance - return empty array
      return [];
    }
  }

  /**
   * Get LLM provider performance comparison - OPTIMIZED
   * Uses cached performance metrics for instant results
   */
  async getLLMPerformance(websiteIds: string[]): Promise<LLMPerformance[]> {
    if (websiteIds.length === 0) return [];

    try {
      // OPTIMIZED: Use materialized view function for LLM performance
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_llm_performance_dashboard", {
          p_website_ids: websiteIds,
        });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        provider: row.provider,
        mentionRate: Number(row.mention_rate || 0),
        averageRank: Number(row.average_rank || 4.0),
        sentiment: Number(row.sentiment || 2.5),
        totalAnalyses: Number(row.total_analyses || 0),
      }));
    } catch (error) {
      // Failed to get LLM performance - return empty array
      return [];
    }
  }

  /**
   * Get website performance comparison - OPTIMIZED
   * Uses materialized view for instant website metrics
   */
  async getWebsitePerformance(
    websiteIds: string[]
  ): Promise<WebsitePerformance[]> {
    if (websiteIds.length === 0) return [];

    try {
      // OPTIMIZED: Use materialized view function for website performance
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_website_performance_dashboard", {
          p_website_ids: websiteIds,
        });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        websiteId: row.website_id,
        domain: row.domain || "",
        displayName: row.display_name || "",
        visibility: Number(row.visibility || 0),
        mentions: Number(row.mentions || 0),
        sentiment: Number(row.sentiment || 2.5),
        lastAnalyzed: row.last_analyzed || "",
      }));
    } catch (error) {
      // Failed to get website performance - return empty array
      return [];
    }
  }

  private async getAllAnalysisResults(
    websiteIds: string[],
    dateRange?: { start: string; end: string }
  ): Promise<AnalysisResult[]> {
    if (websiteIds.length === 0) {
      return [];
    }

    try {
      // Execute all website analysis fetching in parallel
      const allResultsPromises = websiteIds.map((websiteId) =>
        analysisService.getAnalysisResults(websiteId, { dateRange })
      );

      const allResultsArrays = await Promise.all(allResultsPromises);

      // Flatten all results into a single array and convert to AnalysisResult format
      const flatResults = allResultsArrays.flat();
      return flatResults.map(result => ({
        id: result.id,
        topic_name: result.topic,
        topic: result.topic,
        topic_keywords: [],
        llm_results: result.llm_results,
        total_mentions: result.llm_results.filter(r => r.is_mentioned).length,
        avg_rank: result.llm_results.reduce((acc, r) => acc + (r.rank_position || 0), 0) / result.llm_results.length || null,
        avg_confidence: result.confidence,
        avg_sentiment: result.llm_results.reduce((acc, r) => acc + (r.sentiment_score || 0), 0) / result.llm_results.length || null,
        created_at: result.created_at,
        website_id: result.website_id,
      }));
    } catch (error) {
      // Failed to get analysis results
      return [];
    }
  }

  private calculateAggregatedMetrics(
    results: AnalysisResult[]
  ): DashboardMetrics {
    if (results.length === 0) return this.getEmptyMetrics();

    const allLLMResults: LLMResult[] = [];
    const topics = new Set<string>();

    results.forEach((result) => {
      allLLMResults.push(...result.llm_results);
      topics.add(result.topic);
    });

    // Calculate overall visibility (percentage of mentions)
    const totalLLMResults = allLLMResults.length;
    const mentionedResults = allLLMResults.filter((r) => r.is_mentioned);
    const overallVisibilityScore =
      totalLLMResults > 0
        ? Math.round((mentionedResults.length / totalLLMResults) * 100)
        : 0;

    // Calculate average ranking
    const rankedResults = mentionedResults.filter(
      (r) => r.rank_position !== null
    );
    const averageRanking =
      rankedResults.length > 0
        ? Math.round(
            (rankedResults.reduce((sum, r) => sum + (r.rank_position || 0), 0) /
              rankedResults.length) *
              10
          ) / 10
        : 0;

    // Calculate sentiment score
    const sentimentResults = allLLMResults.filter(
      (r) => r.sentiment_score !== null
    );
    const sentimentScore =
      sentimentResults.length > 0
        ? Math.round(
            (sentimentResults.reduce(
              (sum, r) => sum + (r.sentiment_score || 0),
              0
            ) /
              sentimentResults.length +
              1) *
              50
          )
        : 0;

    // Find top performing topic
    const topicPerformance = this.calculateTopicPerformance(results, 1);
    const topPerformingTopic =
      topicPerformance.length > 0 ? topicPerformance[0]!.topic : null;

    return {
      overallVisibilityScore,
      averageRanking,
      totalMentions: mentionedResults.length,
      sentimentScore,
      totalAnalyses: results.length,
      activeWebsites: new Set(results.map((r) => r.website_id)).size,
      topPerformingTopic,
      improvementTrend: 0, // Will be calculated separately
    };
  }

  private calculateMetricsForResults(
    results: AnalysisResult[]
  ): DashboardMetrics {
    return this.calculateAggregatedMetrics(results);
  }

  private calculateTopicPerformance(
    results: AnalysisResult[],
    limit: number
  ): TopicPerformance[] {
    const topicMap = new Map<
      string,
      {
        results: AnalysisResult[];
        llmResults: LLMResult[];
      }
    >();

    // Group results by topic
    results.forEach((result) => {
      if (!topicMap.has(result.topic)) {
        topicMap.set(result.topic, { results: [], llmResults: [] });
      }
      const topicData = topicMap.get(result.topic)!;
      topicData.results.push(result);
      topicData.llmResults.push(...result.llm_results);
    });

    // Calculate performance for each topic
    const topicPerformance: TopicPerformance[] = [];

    topicMap.forEach((data, topic) => {
      const mentionedResults = data.llmResults.filter((r) => r.is_mentioned);
      const totalResults = data.llmResults.length;

      const visibility =
        totalResults > 0 ? (mentionedResults.length / totalResults) * 100 : 0;

      const rankedResults = mentionedResults.filter(
        (r) => r.rank_position !== null
      );
      const averageRank =
        rankedResults.length > 0
          ? rankedResults.reduce((sum, r) => sum + (r.rank_position || 0), 0) /
            rankedResults.length
          : 0;

      const sentimentResults = data.llmResults.filter(
        (r) => r.sentiment_score !== null
      );
      const sentiment =
        sentimentResults.length > 0
          ? (sentimentResults.reduce(
              (sum, r) => sum + (r.sentiment_score || 0),
              0
            ) /
              sentimentResults.length +
              1) *
            50
          : 0;

      topicPerformance.push({
        topic,
        visibility: Math.round(visibility),
        mentions: mentionedResults.length,
        averageRank: Math.round(averageRank * 10) / 10,
        sentiment: Math.round(sentiment),
        trend: 0, // Would need historical data to calculate
      });
    });

    return topicPerformance
      .sort((a, b) => b.visibility - a.visibility)
      .slice(0, limit);
  }

  private calculateLLMPerformance(results: AnalysisResult[]): LLMPerformance[] {
    const llmMap = new Map<string, LLMResult[]>();

    // Group results by LLM provider
    results.forEach((result) => {
      result.llm_results.forEach((llmResult) => {
        if (!llmMap.has(llmResult.llm_provider)) {
          llmMap.set(llmResult.llm_provider, []);
        }
        llmMap.get(llmResult.llm_provider)!.push(llmResult);
      });
    });

    const llmPerformance: LLMPerformance[] = [];

    llmMap.forEach((llmResults, provider) => {
      const mentionedResults = llmResults.filter((r) => r.is_mentioned);
      const mentionRate =
        llmResults.length > 0
          ? (mentionedResults.length / llmResults.length) * 100
          : 0;

      const rankedResults = mentionedResults.filter(
        (r) => r.rank_position !== null
      );
      const averageRank =
        rankedResults.length > 0
          ? rankedResults.reduce((sum, r) => sum + (r.rank_position || 0), 0) /
            rankedResults.length
          : 0;

      const sentimentResults = llmResults.filter(
        (r) => r.sentiment_score !== null
      );
      const sentiment =
        sentimentResults.length > 0
          ? (sentimentResults.reduce(
              (sum, r) => sum + (r.sentiment_score || 0),
              0
            ) /
              sentimentResults.length +
              1) *
            50
          : 0;

      llmPerformance.push({
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        mentionRate: Math.round(mentionRate),
        averageRank: Math.round(averageRank * 10) / 10,
        sentiment: Math.round(sentiment),
        totalAnalyses: llmResults.length,
      });
    });

    return llmPerformance.sort((a, b) => b.mentionRate - a.mentionRate);
  }

  private aggregateByDate(
    results: AnalysisResult[],
    startDate: Date,
    endDate: Date
  ): TimeSeriesData[] {
    const dateMap = new Map<
      string,
      {
        mentions: number;
        totalResults: number;
        sentimentSum: number;
        sentimentCount: number;
      }
    >();

    // Initialize all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split("T")[0]!;
      dateMap.set(dateKey, {
        mentions: 0,
        totalResults: 0,
        sentimentSum: 0,
        sentimentCount: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregate results by date
    results.forEach((result) => {
      result.llm_results.forEach((llmResult) => {
        const date = new Date(llmResult.analyzed_at)
          .toISOString()
          .split("T")[0]!;
        const data = dateMap.get(date);

        if (data) {
          data.totalResults++;
          if (llmResult.is_mentioned) {
            data.mentions++;
          }
          if (llmResult.sentiment_score !== null) {
            data.sentimentSum += llmResult.sentiment_score;
            data.sentimentCount++;
          }
        }
      });
    });

    // Convert to time series format
    const timeSeriesData: TimeSeriesData[] = [];
    dateMap.forEach((data, date) => {
      const visibility =
        data.totalResults > 0 ? (data.mentions / data.totalResults) * 100 : 0;
      const sentiment =
        data.sentimentCount > 0
          ? (data.sentimentSum / data.sentimentCount + 1) * 50
          : 50;

      timeSeriesData.push({
        date,
        visibility: Math.round(visibility),
        mentions: data.mentions,
        sentiment: Math.round(sentiment),
      });
    });

    return timeSeriesData.sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getPreviousPeriodMetrics(
    websiteIds: string[],
    currentRange?: { start: string; end: string }
  ): Promise<DashboardMetrics> {
    if (!currentRange) {
      return this.getEmptyMetrics();
    }

    const currentStart = new Date(currentRange.start);
    const currentEnd = new Date(currentRange.end);
    const periodLength = currentEnd.getTime() - currentStart.getTime();

    const previousEnd = new Date(currentStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodLength);

    const previousRange = {
      start: previousStart.toISOString(),
      end: previousEnd.toISOString(),
    };

    const previousResults = await this.getAllAnalysisResults(
      websiteIds,
      previousRange
    );
    return this.calculateAggregatedMetrics(previousResults);
  }

  private calculateTrend(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  private getEmptyMetrics(): DashboardMetrics {
    return {
      overallVisibilityScore: 0,
      averageRanking: 0,
      totalMentions: 0,
      sentimentScore: 0,
      totalAnalyses: 0,
      activeWebsites: 0,
      topPerformingTopic: null,
      improvementTrend: 0,
    };
  }

  /**
   * Export dashboard data in specified format
   */
  async exportDashboardData(
    websiteIds: string[],
    format: "pdf" | "csv" | "json" | "word"
  ): Promise<Blob> {
    const [metrics, timeSeriesData, topicPerformance] = await Promise.all([
      this.getDashboardMetrics(websiteIds),
      this.getTimeSeriesData(websiteIds),
      this.getTopicPerformance(websiteIds),
    ]);

    const exportData = {
      title: "Dashboard Analytics Report",
      data: {
        metrics,
        timeSeriesData,
        topicPerformance,
        summary: {
          websiteCount: websiteIds.length,
          totalTopics: topicPerformance.length,
          analysisPoints: timeSeriesData.length,
          avgVisibilityScore: metrics.overallVisibilityScore,
          avgSentimentScore: metrics.sentimentScore,
        },
      },
      exportedAt: new Date().toISOString(),
      totalRecords: timeSeriesData.length + topicPerformance.length,
      metadata: {
        exportType: "dashboard_analytics",
        generatedBy: "Beekon AI Dashboard",
        websiteIds,
        dateRange: {
          start: timeSeriesData[0]?.date || new Date().toISOString(),
          end:
            timeSeriesData[timeSeriesData.length - 1]?.date ||
            new Date().toISOString(),
        },
      },
    };

    // Use enhanced export service for all formats
    const { exportService } = await import("./exportService");
    return await exportService.exportData(exportData, format, {
      exportType: "dashboard",
      customFilename: generateExportFilename("dashboard_analytics", format, {
        includeTimestamp: true,
        dateRange: exportData.metadata.dateRange,
      }),
    });
  }

}

export const dashboardService = DashboardService.getInstance();
