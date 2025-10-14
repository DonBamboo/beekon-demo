import { supabase } from "@/integrations/supabase/client";
import { type AnalysisResult, type LLMResult } from "./analysisService";
import { generateExportFilename } from "@/lib/export-utils";
import { DashboardMetricsResult } from "@/types/supabase-rpc";

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
  [key: string]: unknown;
}

export interface TopicPerformance {
  topic: string;
  visibility: number;
  mentions: number;
  averageRank: number;
  sentiment: number;
  trend: number; // percentage change
  [key: string]: unknown;
}

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
        start:
          dateRange?.start ||
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: dateRange?.end || new Date().toISOString(),
      };

      const { data, error } = await (
        supabase.schema("beekon_data") as unknown as {
          rpc: (
            name: string,
            params: Record<string, unknown>
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("get_dashboard_metrics", {
        p_website_ids: websiteIds,
        p_date_start: defaultDateRange.start,
        p_date_end: defaultDateRange.end,
      });

      if (error) {
        const errorObj = error as {
          code?: string;
          message?: string;
          details?: string;
          hint?: string;
        } | null;
        console.error("❌ Dashboard metrics error:", {
          error,
          code: errorObj?.code,
          message: errorObj?.message,
          details: errorObj?.details,
          hint: errorObj?.hint,
          parameters: { websiteIds, dateRange: defaultDateRange },
        });
        throw error;
      }

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) {
        return this.getEmptyMetrics();
      }

      const metrics = result as DashboardMetricsResult;
      return {
        overallVisibilityScore: Number(
          metrics.overall_visibility_score.toFixed(2) || 0
        ),
        averageRanking: Number(metrics.average_ranking.toFixed(2) || 0.0),
        totalMentions: Number(metrics.total_mentions || 0),
        sentimentScore: Number(metrics.sentiment_score.toFixed(2) || 50),
        totalAnalyses: Number(metrics.total_analyses || 0),
        activeWebsites: Number(metrics.active_websites || 0),
        topPerformingTopic: metrics.top_performing_topic || null,
        improvementTrend: Number(metrics.improvement_trend || 0),
      };
    } catch (error) {
      // Enhanced error handling with fallback to direct materialized view query
      console.error("🚨 Dashboard metrics RPC error, attempting fallback:", {
        error: error instanceof Error ? error.message : error,
        websiteIds,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Fallback: Direct query to materialized view if RPC function fails
      try {
        const { data: fallbackData, error: fallbackError } = await (
          supabase.schema("beekon_data") as any
        ) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from("mv_website_dashboard_summary")
          .select("*")
          .in("website_id", websiteIds);

        if (fallbackError) {
          console.error("❌ Fallback query failed:", fallbackError);
          return this.getEmptyMetrics();
        }

        if (!fallbackData || fallbackData.length === 0) {
          console.warn("⚠️ No data found in materialized view fallback");
          return this.getEmptyMetrics();
        }

        // Calculate metrics from materialized view data
        const totalAnalyses = fallbackData.reduce(
          (sum: number, row: any) => sum + (row.total_brand_analyses || 0),
          0
        ); // eslint-disable-line @typescript-eslint/no-explicit-any
        const totalMentions = fallbackData.reduce(
          (sum: number, row: any) => sum + (row.total_brand_mentions || 0),
          0
        ); // eslint-disable-line @typescript-eslint/no-explicit-any
        const avgVisibility =
          fallbackData.reduce(
            (sum: number, row: any) => sum + (row.brand_mention_rate || 0),
            0
          ) / fallbackData.length; // eslint-disable-line @typescript-eslint/no-explicit-any
        const avgSentiment =
          fallbackData.reduce(
            (sum: number, row: any) => sum + (row.avg_brand_sentiment || 0),
            0
          ) / fallbackData.length; // eslint-disable-line @typescript-eslint/no-explicit-any

        return {
          overallVisibilityScore: Number(avgVisibility.toFixed(2)),
          averageRanking: 3.5, // Default reasonable ranking
          totalMentions: totalMentions,
          sentimentScore: Number(((avgSentiment + 1) * 50).toFixed(2)),
          totalAnalyses: totalAnalyses,
          activeWebsites: fallbackData.length,
          topPerformingTopic: "Data Available",
          improvementTrend: 0,
        };
      } catch (fallbackError) {
        console.error("🚨 All fallback methods failed:", fallbackError);
        return this.getEmptyMetrics();
      }
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
      const { data, error } = await (
        supabase.schema("beekon_data") as unknown as {
          rpc: (
            name: string,
            params: Record<string, unknown>
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("get_dashboard_time_series", {
        p_website_ids: websiteIds,
        p_days: days,
      });

      if (error) throw error;

      interface TimeSeriesRow {
        date: string;
        visibility: number;
        mentions: number;
        sentiment: number;
      }

      // Type guard to ensure data is an array
      const validData = Array.isArray(data) ? data : [];
      return validData.map((row: TimeSeriesRow) => ({
        date: row.date,
        visibility: Number(row.visibility || 0),
        mentions: Number(row.mentions || 0),
        sentiment: Number(row.sentiment || 50),
      }));
    } catch (error) {
      // Enhanced error handling with fallback to direct table query
      console.error("🚨 Time series RPC error, attempting fallback:", {
        error: error instanceof Error ? error.message : error,
        websiteIds,
        period,
      });

      // Fallback: Direct query to raw table if RPC function fails
      try {
        const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;

        const { data: fallbackData, error: fallbackError } = await supabase
          .schema("beekon_data")
          .from("llm_analysis_results")
          .select("analyzed_at, is_mentioned, sentiment_score")
          .in("website_id", websiteIds)
          .gte(
            "analyzed_at",
            new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
          )
          .order("analyzed_at", { ascending: true });

        if (fallbackError) {
          console.error("❌ Time series fallback failed:", fallbackError);
          return [];
        }

        if (!fallbackData || fallbackData.length === 0) {
          console.warn("⚠️ No time series data found in fallback");
          return [];
        }

        // Group by date and calculate daily metrics
        const dateMap = new Map<
          string,
          { mentions: number; total: number; sentiments: number[] }
        >();

        fallbackData.forEach((row: any) => {
          // eslint-disable-line @typescript-eslint/no-explicit-any
          const dateString = new Date(row.analyzed_at)
            .toISOString()
            .split("T")[0];
          if (!dateString) return; // Skip invalid dates

          let dayData = dateMap.get(dateString);
          if (!dayData) {
            dayData = { mentions: 0, total: 0, sentiments: [] };
            dateMap.set(dateString, dayData);
          }
          dayData.total++;
          if (row.is_mentioned) dayData.mentions++;
          if (row.sentiment_score !== null)
            dayData.sentiments.push(row.sentiment_score);
        });

        const result = Array.from(dateMap.entries()).map(([date, data]) => ({
          date,
          visibility: data.total > 0 ? (data.mentions / data.total) * 100 : 0,
          mentions: data.mentions,
          sentiment:
            data.sentiments.length > 0
              ? (data.sentiments.reduce((sum, s) => sum + s, 0) /
                  data.sentiments.length +
                  1) *
                50
              : 50,
        }));

        return result;
      } catch (fallbackError) {
        console.error("🚨 Time series fallback failed:", fallbackError);
        return [];
      }
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
      const { data, error } = await (
        supabase.schema("beekon_data") as unknown as {
          rpc: (
            name: string,
            params: Record<string, unknown>
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("get_topic_performance_dashboard", {
        p_website_ids: websiteIds,
        p_limit: limit,
      });

      if (error) throw error;

      interface TopicPerformanceRow {
        topic: string;
        visibility: number;
        mentions: number;
        average_rank: number;
        sentiment: number;
        trend: number;
      }

      // Type guard to ensure data is an array
      const validData = Array.isArray(data) ? data : [];
      return validData.map((row: TopicPerformanceRow) => ({
        topic: row.topic,
        visibility: Number(row.visibility || 0),
        mentions: Number(row.mentions || 0),
        averageRank: Number(row.average_rank || 4.0),
        sentiment: Number(row.sentiment || 50),
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
      const { data, error } = await (
        supabase.schema("beekon_data") as unknown as {
          rpc: (
            name: string,
            params: Record<string, unknown>
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("get_llm_performance_dashboard", {
        p_website_ids: websiteIds,
      });

      if (error) throw error;

      interface LLMPerformanceRow {
        provider: string;
        mention_rate: number;
        average_rank: number;
        sentiment: number;
        total_analyses: number;
      }

      // Type guard to ensure data is an array
      const validData = Array.isArray(data) ? data : [];
      return validData.map((row: LLMPerformanceRow) => ({
        provider: row.provider,
        mentionRate: Number(row.mention_rate || 0),
        averageRank: Number(row.average_rank || 4.0),
        sentiment: Number(row.sentiment || 50),
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
      const { data, error } = await (
        supabase.schema("beekon_data") as unknown as {
          rpc: (
            name: string,
            params: Record<string, unknown>
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("get_website_performance_dashboard", {
        p_website_ids: websiteIds,
      });

      if (error) throw error;

      interface WebsitePerformanceRow {
        website_id: string;
        domain: string;
        display_name: string;
        visibility: number;
        mentions: number;
        sentiment: number;
        last_analyzed: string;
      }

      // Type guard to ensure data is an array
      const validData = Array.isArray(data) ? data : [];
      return validData.map((row: WebsitePerformanceRow) => ({
        websiteId: row.website_id,
        domain: row.domain || "",
        displayName: row.display_name || "",
        visibility: Number(row.visibility || 0),
        mentions: Number(row.mentions || 0),
        sentiment: Number(row.sentiment || 50),
        lastAnalyzed: row.last_analyzed || "",
      }));
    } catch (error) {
      // Failed to get website performance - return empty array
      return [];
    }
  }

  // @ts-expect-error - Unused function - can be removed in future cleanup
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
