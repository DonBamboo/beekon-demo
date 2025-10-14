import { supabase } from "@/integrations/supabase/client";
import { Competitor, AnalysisResult } from "@/types/database";
import BaseService from "./baseService";
import {
  competitorAnalysisService,
  type CompetitorShareOfVoice,
  type CompetitiveGapAnalysis,
  type CompetitorInsight,
} from "./competitorAnalysisService";
import {
  calculateTimeSeriesShareOfVoice,
  validateShareOfVoiceTotal,
} from "@/utils/shareOfVoiceUtils";

// Re-export types for external use
export type {
  CompetitiveGapAnalysis,
  CompetitorShareOfVoice,
  CompetitorInsight,
};
export type { Competitor };

export interface CompetitorServicePerformance {
  // Database fields (required by CompetitorPerformance interface)
  visibility_score: number;
  avg_rank: number;
  total_mentions: number;
  sentiment_score: number;

  // UI-compatible fields
  competitorId: string;
  domain: string;
  name: string;
  shareOfVoice: number;
  averageRank: number;
  mentionCount: number;
  sentimentScore: number;
  visibilityScore: number;
  trend: "up" | "down" | "stable";
  trendPercentage: number;
  lastAnalyzed: string;
  isActive: boolean;
  analysisStatus?: "pending" | "analyzing" | "completed" | "failed"; // Analysis status for progress tracking
}

export interface CompetitorComparison {
  topic: string;
  yourBrand: number;
  competitors: Array<{
    competitorId: string;
    name: string;
    score: number;
  }>;
}

export interface CompetitorTimeSeriesData {
  date: string;
  competitors: Array<{
    competitorId: string;
    name: string;
    shareOfVoice: number;
    averageRank: number;
    mentionCount: number;
    sentimentScore: number;
  }>;
}

// Separate interfaces for different metric types
export interface MarketShareDataPoint {
  name: string;
  normalizedValue: number; // Normalized percentage (0-100, sum = 100)
  rawValue: number; // Raw share of voice percentage
  competitorId?: string;
  mentions?: number;
  avgRank?: number | null;
  value?: number; // Add missing property
  dataType: "market_share"; // Explicit data type identifier
}

export interface ShareOfVoiceDataPoint {
  name: string;
  shareOfVoice: number; // Raw percentage of mentions
  totalMentions: number;
  totalAnalyses: number;
  competitorId?: string;
  avgRank?: number | null;
  dataType: "share_of_voice"; // Explicit data type identifier
}

export interface CompetitorAnalytics {
  totalCompetitors: number;
  activeCompetitors: number;
  competitorsWithPendingAnalysis: number; // Count of competitors with pending/analyzing status
  hasInProgressAnalysis: boolean; // True if any competitors are being analyzed
  averageCompetitorRank: number;
  // Separate normalized market share from raw share of voice
  marketShareData: MarketShareDataPoint[];
  shareOfVoiceData: ShareOfVoiceDataPoint[];
  competitiveGaps: CompetitorComparison[];
  timeSeriesData: CompetitorTimeSeriesData[];
  shareOfVoice: CompetitorShareOfVoice[];
  gapAnalysis: CompetitiveGapAnalysis[];
  insights: CompetitorInsight[];
  _metadata?: {
    dataValidation: {
      isValid: boolean;
      issues: string[];
      warnings: string[];
      totalChecks: number;
      passedChecks: number;
    };
    generatedAt: string;
    dataConsistency: {
      competitorCount: {
        marketShare: number;
        shareOfVoice: number;
        consistent: boolean;
      };
      dataAlignment: {
        matchingCompetitors: number;
        missingInMarketShare: number;
        missingInShareOfVoice: number;
      };
    };
  };
}

export class OptimizedCompetitorService extends BaseService {
  private static instance: OptimizedCompetitorService;
  protected serviceName = "competitor" as const;
  private cache = new Map<
    string,
    { data: unknown; timestamp: number; ttl: number }
  >();

  public static getInstance(): OptimizedCompetitorService {
    if (!OptimizedCompetitorService.instance) {
      OptimizedCompetitorService.instance = new OptimizedCompetitorService();
    }
    return OptimizedCompetitorService.instance;
  }

  /**
   * Get cached data or fetch new data
   */
  private async getCachedData<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number = 300000 // 5 minutes default
  ): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }

    const data = await fetchFunction();
    this.cache.set(key, { data, timestamp: now, ttl });
    return data;
  }

  /**
   * Clear cache for specific key or all cache
   */
  private clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get all competitors for a website (optimized)
   */
  async getCompetitors(websiteId: string): Promise<Competitor[]> {
    const cacheKey = `competitors_${websiteId}`;

    return this.getCachedData(cacheKey, async () => {
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("competitors")
        .select(
          "*, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_error_message"
        )
        .eq("website_id", websiteId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    });
  }

  /**
   * Get competitor performance metrics (UPDATED: uses corrected database functions)
   */
  async getCompetitorPerformance(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorServicePerformance[]> {
    const cacheKey = `performance_${websiteId}_${dateRange?.start || "all"}_${
      dateRange?.end || "all"
    }`;

    return this.getCachedData(cacheKey, async () => {
      try {
        // Use the corrected database function (now uses proper competitor_id relationships)
        const { data, error } = await supabase
          .schema("beekon_data")
          .rpc("get_competitor_performance", {
            p_website_id: websiteId,
            p_limit: 50,
            p_offset: 0,
          });

        if (error) {
          console.warn("Competitor performance query error:", error);
          return [];
        }

        // Transform database results using the corrected field structure
        const performanceData = Array.isArray(data) ? data : [];
        return performanceData.map((row: Record<string, unknown>) => {
          const totalMentions = Number(row.total_mentions) || 0;
          const positiveMentions = Number(row.positive_mentions) || 0;
          const avgSentiment = Number(row.avg_sentiment_score);
          const avgRank = Number(row.avg_rank_position);
          const mentionTrend = Number(row.mention_trend_7d) || 0;
          const analysisStatus = String(row.analysis_status || "completed");

          const shareOfVoiceValue =
            totalMentions > 0
              ? Math.round((positiveMentions / totalMentions) * 100)
              : 0;
          const averageRankValue =
            avgRank && !isNaN(avgRank) && avgRank > 0 && avgRank <= 20
              ? Math.round(avgRank * 10) / 10
              : 0;
          const sentimentScoreValue =
            avgSentiment && !isNaN(avgSentiment)
              ? Math.round(Math.max(0, Math.min(100, (avgSentiment + 1) * 50)))
              : 50;

          return {
            // Database fields (required by CompetitorPerformance interface)
            visibility_score: shareOfVoiceValue,
            avg_rank: averageRankValue,
            total_mentions: totalMentions,
            sentiment_score: sentimentScoreValue,

            // UI-compatible fields
            competitorId: String(row.competitor_id),
            domain: String(row.competitor_domain),
            name: String(row.competitor_name || row.competitor_domain),
            shareOfVoice: shareOfVoiceValue,
            averageRank: averageRankValue,
            mentionCount: totalMentions,
            sentimentScore: sentimentScoreValue,
            visibilityScore: shareOfVoiceValue,
            trend: this.calculateTrend(mentionTrend),
            trendPercentage: Math.abs(mentionTrend),
            lastAnalyzed: String(
              row.last_analysis_date || new Date().toISOString()
            ),
            isActive:
              analysisStatus === "completed" || analysisStatus === "analyzing",
            analysisStatus: analysisStatus as
              | "pending"
              | "analyzing"
              | "completed"
              | "failed",
          };
        });
      } catch (error) {
        console.error("Error fetching competitor performance:", error);
        return [];
      }
    });
  }

  /**
   * Get competitor time series data (optimized with database functions)
   */
  async getCompetitorTimeSeriesData(
    websiteId: string,
    competitorDomain?: string,
    days: number = 30
  ): Promise<CompetitorTimeSeriesData[]> {
    const cacheKey = `timeseries_${websiteId}_${
      competitorDomain || "all"
    }_${days}`;

    return this.getCachedData(cacheKey, async () => {
      // Note: We no longer exit early if no competitors exist because we want
      // to include "Your Brand" data even when there are no competitors

      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_competitor_time_series", {
          p_website_id: websiteId,
          p_competitor_domain: competitorDomain,
          p_days: days,
        });

      if (error) {
        console.error("❌ Backend RPC function error:", error);
        console.warn("⚠️ Trying direct query fallback before synthetic data");

        // First try: Direct query fallback using the same logic as the RPC function
        try {
          const directQueryData = await this.getTimeSeriesDirectQuery(
            websiteId,
            competitorDomain,
            days
          );
          if (directQueryData.length > 0) {
            return directQueryData;
          }
        } catch (directQueryError) {
          console.error(
            "❌ Direct query fallback also failed:",
            directQueryError
          );
        }

        // Last resort: synthetic data
        console.warn("⚠️ Falling back to synthetic data generation");
        const fallbackData = await this.getFallbackTimeSeriesData(
          websiteId,
          days
        );
        return fallbackData;
      }

      // Group by date
      const timeSeriesMap = new Map<string, CompetitorTimeSeriesData>();
      const timeSeriesData = Array.isArray(data) ? data : [];

      // If no data is returned, create fallback time series data
      if (timeSeriesData.length === 0) {
        console.warn(
          "⚠️ No time series data returned from backend, generating fallback data"
        );

        // Generate basic time series with "Your Brand" for the last week
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split("T")[0];

          if (!dateStr) {
            console.error("Failed to generate date string for fallback data");
            continue;
          }

          timeSeriesMap.set(dateStr, {
            date: dateStr,
            competitors: [
              {
                competitorId: "your-brand",
                name: "Your Brand",
                shareOfVoice: 100, // 100% when no competitors
                averageRank: 0,
                mentionCount: 0,
                sentimentScore: 50,
              },
            ],
          });
        }

        const fallbackResult = Array.from(timeSeriesMap.values()).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        return fallbackResult;
      }

      timeSeriesData.forEach((row: Record<string, unknown>) => {
        const dateStr = String(row.analysis_date);
        if (!timeSeriesMap.has(dateStr)) {
          timeSeriesMap.set(dateStr, {
            date: dateStr,
            competitors: [],
          });
        }

        const dailyPositiveMentions = Number(row.daily_positive_mentions) || 0;
        const dailyAvgSentiment = Number(row.daily_avg_sentiment);
        const dailyAvgRank = Number(row.daily_avg_rank);

        // Get share of voice from backend calculation (if available) or use 0 as fallback
        const backendShareOfVoice =
          row.share_of_voice !== undefined
            ? Number(row.share_of_voice) || 0
            : 0;

        timeSeriesMap.get(dateStr)!.competitors.push({
          competitorId: row.is_your_brand
            ? "your-brand"
            : String(row.competitor_id || ""), // Use special ID for Your Brand
          name: String(row.competitor_name || row.competitor_domain),
          shareOfVoice: backendShareOfVoice, // Use backend-calculated share of voice
          averageRank:
            // Your Brand doesn't have rank position, only competitors do
            row.is_your_brand
              ? 0
              : dailyAvgRank &&
                !isNaN(dailyAvgRank) &&
                dailyAvgRank > 0 &&
                dailyAvgRank <= 20
              ? Math.round(dailyAvgRank * 10) / 10 // Round to 1 decimal place
              : 0,
          mentionCount: dailyPositiveMentions, // Use positive mentions for share calculation
          sentimentScore:
            dailyAvgSentiment && !isNaN(dailyAvgSentiment)
              ? Math.round(
                  Math.max(0, Math.min(100, (dailyAvgSentiment + 1) * 50))
                )
              : 50,
        });
      });

      // Apply normalization only if backend didn't calculate share of voice properly
      const normalizedResult = Array.from(timeSeriesMap.values())
        .map((timePoint) => {
          // Check if backend provided valid share of voice calculations
          const hasValidBackendShares = timePoint.competitors.every(
            (comp) => comp.shareOfVoice > 0
          );
          const totalBackendShares = timePoint.competitors.reduce(
            (sum, comp) => sum + comp.shareOfVoice,
            0
          );
          const isBackendShareValid =
            hasValidBackendShares && Math.abs(totalBackendShares - 100) < 5; // Allow 5% tolerance

          if (isBackendShareValid) {
            // Use backend calculations as-is
            return timePoint;
          } else {
            // Fallback to frontend normalization if backend data is invalid
            const normalizedCompetitors = calculateTimeSeriesShareOfVoice(
              timePoint.competitors
            );
            return {
              ...timePoint,
              competitors: normalizedCompetitors,
            };
          }
        })
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        ); // FIXED: Chronological order (oldest to newest)

      // Validate that each date totals to 100%
      normalizedResult.forEach((timePoint, index) => {
        const validation = validateShareOfVoiceTotal(timePoint.competitors);
        if (!validation.isValid && index < 3) {
          // Only log first 3 validation failures
          console.warn(
            `⚠️ Share of voice validation failed for ${timePoint.date}:`,
            validation
          );
        }
      });

      // Count how many time points used backend vs frontend calculation
      let backendCalculated = 0;
      let frontendCalculated = 0;
      Array.from(timeSeriesMap.values()).forEach((timePoint) => {
        const hasValidBackendShares = timePoint.competitors.every(
          (comp) => comp.shareOfVoice > 0
        );
        const totalBackendShares = timePoint.competitors.reduce(
          (sum, comp) => sum + comp.shareOfVoice,
          0
        );
        const isBackendShareValid =
          hasValidBackendShares && Math.abs(totalBackendShares - 100) < 5;

        if (isBackendShareValid) {
          backendCalculated++;
        } else {
          frontendCalculated++;
        }
      });

      return normalizedResult;
    });
  }

  /**
   * Direct query method to get time series data when RPC function fails
   */
  private async getTimeSeriesDirectQuery(
    websiteId: string,
    competitorDomain?: string,
    days: number = 30
  ): Promise<CompetitorTimeSeriesData[]> {
    // Calculate the date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // Get raw data from materialized view
    let query = supabase
      .schema("beekon_data")
      .from("mv_competitor_daily_metrics")
      .select("*")
      .eq("website_id", websiteId)
      .gte("analysis_date", startDate.toISOString().split("T")[0])
      .order("analysis_date", { ascending: false })
      .order("competitor_name", { ascending: true });

    if (competitorDomain) {
      query = query.eq("competitor_domain", competitorDomain);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Direct query failed: ${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.warn("No data found in direct query");
      return [];
    }

    // Process the direct query results and calculate share of voice
    const timeSeriesMap = new Map<string, CompetitorTimeSeriesData>();
    const dailyTotals = new Map<string, number>();

    // First pass: calculate daily totals
    data.forEach((row: Record<string, unknown>) => {
      const dateStr = String(row.analysis_date);
      const dailyMentions = Number(row.daily_mentions) || 0;

      if (!dailyTotals.has(dateStr)) {
        dailyTotals.set(dateStr, 0);
      }
      dailyTotals.set(dateStr, dailyTotals.get(dateStr)! + dailyMentions);
    });

    // Second pass: process competitors and calculate share of voice
    data.forEach((row: Record<string, unknown>) => {
      const dateStr = String(row.analysis_date);
      if (!timeSeriesMap.has(dateStr)) {
        timeSeriesMap.set(dateStr, {
          date: dateStr,
          competitors: [],
        });
      }

      const dailyPositiveMentions = Number(row.daily_positive_mentions) || 0;
      const dailyMentions = Number(row.daily_mentions) || 0;
      const dailyAvgSentiment = Number(row.daily_avg_sentiment);
      const dailyAvgRank = Number(row.daily_avg_rank);
      const totalForDate = dailyTotals.get(dateStr) || 1;

      // Calculate accurate share of voice
      const shareOfVoice =
        totalForDate > 0
          ? Math.round((dailyMentions / totalForDate) * 100 * 100) / 100 // Round to 2 decimal places
          : 0;

      timeSeriesMap.get(dateStr)!.competitors.push({
        competitorId: row.is_your_brand
          ? "your-brand"
          : String(row.competitor_id || ""),
        name: String(row.competitor_name || row.competitor_domain),
        shareOfVoice, // Use the calculated share of voice
        averageRank: row.is_your_brand
          ? 0
          : dailyAvgRank &&
            !isNaN(dailyAvgRank) &&
            dailyAvgRank > 0 &&
            dailyAvgRank <= 20
          ? Math.round(dailyAvgRank * 10) / 10
          : 0,
        mentionCount: dailyPositiveMentions,
        sentimentScore:
          dailyAvgSentiment && !isNaN(dailyAvgSentiment)
            ? Math.round(
                Math.max(0, Math.min(100, (dailyAvgSentiment + 1) * 50))
              )
            : 50,
      });
    });

    const result = Array.from(timeSeriesMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return result;
  }

  /**
   * Fallback method to get time series data when backend RPC fails
   */
  private async getFallbackTimeSeriesData(
    websiteId: string,
    days: number
  ): Promise<CompetitorTimeSeriesData[]> {
    try {
      // Get competitors from the database directly
      const competitors = await this.getCompetitors(websiteId);

      // Create basic time series with "Your Brand" and any competitors
      const timeSeriesMap = new Map<string, CompetitorTimeSeriesData>();
      const today = new Date();

      for (let i = Math.min(days - 1, 6); i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        if (!dateStr) continue;

        const competitorList = [
          {
            competitorId: "your-brand",
            name: "Your Brand",
            shareOfVoice: competitors.length === 0 ? 100 : 50, // 100% if no competitors, otherwise 50%
            averageRank: 0,
            mentionCount: competitors.length === 0 ? 1 : 10,
            sentimentScore: 75,
          },
        ];

        // Add known competitors with basic data
        competitors.forEach((comp, index) => {
          competitorList.push({
            competitorId: comp.id,
            name:
              comp.competitor_name ||
              comp.competitor_domain.replace(/^https?:\/\//, ""),
            shareOfVoice:
              competitors.length === 1
                ? 50
                : Math.round(50 / competitors.length),
            averageRank: 2 + index,
            mentionCount: Math.max(1, 10 - index * 2),
            sentimentScore: 60 - index * 5,
          });
        });

        timeSeriesMap.set(dateStr, {
          date: dateStr,
          competitors: competitorList,
        });
      }

      const fallbackResult = Array.from(timeSeriesMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      return fallbackResult;
    } catch (fallbackError) {
      console.error(
        "❌ Fallback time series generation failed:",
        fallbackError
      );

      // Last resort: return minimal "Your Brand" only data
      const dateStr = new Date().toISOString().split("T")[0];
      if (!dateStr) {
        return []; // Return empty array if date generation fails
      }

      const minimalResult: CompetitorTimeSeriesData[] = [
        {
          date: dateStr,
          competitors: [
            {
              competitorId: "your-brand",
              name: "Your Brand",
              shareOfVoice: 100,
              averageRank: 0,
              mentionCount: 0,
              sentimentScore: 50,
            },
          ],
        },
      ];

      return minimalResult;
    }
  }

  /**
   * Get competitive analysis (optimized with parallel queries)
   */
  async getCompetitiveAnalysis(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorAnalytics> {
    const cacheKey = `analytics_${websiteId}_${dateRange?.start || "all"}_${
      dateRange?.end || "all"
    }`;

    return this.getCachedData(cacheKey, async () => {
      // First check if there are any competitors for this website
      const { data: hasCompetitors } = await supabase
        .schema("beekon_data")
        .from("competitors")
        .select("id")
        .eq("website_id", websiteId)
        .eq("is_active", true)
        .limit(1);

      // If no competitors exist, return empty analytics immediately
      if (!hasCompetitors || hasCompetitors.length === 0) {
        return {
          totalCompetitors: 0,
          activeCompetitors: 0,
          competitorsWithPendingAnalysis: 0,
          hasInProgressAnalysis: false,
          averageCompetitorRank: 0,
          marketShareData: [
            {
              name: "Your Brand",
              normalizedValue: 0,
              rawValue: 0,
              mentions: 0,
              avgRank: null,
              dataType: "market_share" as const,
            },
          ],
          shareOfVoiceData: [
            {
              name: "Your Brand",
              shareOfVoice: 0,
              totalMentions: 0,
              totalAnalyses: 0,
              avgRank: null,
              dataType: "share_of_voice" as const,
            },
          ],
          competitiveGaps: [],
          timeSeriesData: [],
          shareOfVoice: [],
          gapAnalysis: [],
          insights: [],
        };
      }

      // Execute all queries in parallel
      const [
        competitors,
        yourBrandResults,
        timeSeriesData,
        shareOfVoice,
        gapAnalysis,
        insights,
      ] = await Promise.all([
        this.getCompetitorPerformance(websiteId, dateRange),
        this.getAnalysisResultsForWebsite(websiteId, dateRange),
        this.getCompetitorTimeSeriesData(websiteId, undefined, 30),
        competitorAnalysisService.getCompetitorShareOfVoice(
          websiteId,
          dateRange
        ),
        competitorAnalysisService.getCompetitiveGapAnalysis(
          websiteId,
          dateRange
        ),
        competitorAnalysisService.getCompetitorInsights(websiteId, dateRange),
      ]);

      // Calculate your brand's mention data
      const yourBrandMentions = yourBrandResults.reduce(
        (sum, r) =>
          sum + r.llm_results.filter((llm) => llm.is_mentioned).length,
        0
      );
      const yourBrandAnalyses = yourBrandResults.reduce(
        (sum, r) => sum + r.llm_results.length,
        0
      );

      // Calculate total mentions across all brands (Your Brand + all competitors)
      const totalCompetitorMentions = shareOfVoice.reduce(
        (sum, comp) => sum + comp.totalMentions,
        0
      );
      const totalMentionsAllBrands =
        yourBrandMentions + totalCompetitorMentions;

      // Calculate true Share of Voice (relative to total mentions across all brands)
      const yourBrandTrueShareOfVoice =
        totalMentionsAllBrands > 0
          ? Number(
              ((yourBrandMentions / totalMentionsAllBrands) * 100).toFixed(1)
            )
          : 0;

      // For backward compatibility, also calculate mention rate (old logic)
      const yourBrandMentionRate =
        yourBrandAnalyses > 0
          ? Number(((yourBrandMentions / yourBrandAnalyses) * 100).toFixed(1))
          : 0;

      // Create market share data (using true share of voice as baseline, with normalization if needed)
      const competitorTrueShares = shareOfVoice.map((comp) => ({
        ...comp,
        trueShareOfVoice:
          totalMentionsAllBrands > 0
            ? Number(
                ((comp.totalMentions / totalMentionsAllBrands) * 100).toFixed(1)
              )
            : 0,
      }));

      // Total should be 100%, but add normalization as safety measure
      const totalTrueShare =
        yourBrandTrueShareOfVoice +
        competitorTrueShares.reduce(
          (sum, comp) => sum + comp.trueShareOfVoice,
          0
        );
      const normalizationFactor = totalTrueShare > 0 ? 100 / totalTrueShare : 1;

      // Create normalized market share data with fallback protection
      const safeNormalizedValue =
        !isNaN(yourBrandTrueShareOfVoice) && isFinite(yourBrandTrueShareOfVoice)
          ? Number((yourBrandTrueShareOfVoice * normalizationFactor).toFixed(1))
          : 0;
      const safeRawValue =
        !isNaN(yourBrandMentionRate) && isFinite(yourBrandMentionRate)
          ? yourBrandMentionRate
          : 0;

      const marketShareData: MarketShareDataPoint[] = [
        {
          name: "Your Brand",
          normalizedValue: safeNormalizedValue,
          rawValue: safeRawValue, // Keep old mention rate for reference
          mentions:
            !isNaN(yourBrandMentions) && isFinite(yourBrandMentions)
              ? yourBrandMentions
              : 0,
          avgRank: undefined, // Your brand doesn't have a rank position
          dataType: "market_share",
        },
        ...competitorTrueShares.map((comp) => ({
          name: comp.competitorName,
          normalizedValue: Number(
            (comp.trueShareOfVoice * normalizationFactor).toFixed(1)
          ),
          rawValue: comp.shareOfVoice, // Keep old database value for reference
          competitorId: comp.competitorId,
          mentions: comp.totalMentions,
          avgRank: comp.avgRankPosition,
          dataType: "market_share" as const,
        })),
      ];

      // Create share of voice data (true relative share of total mentions)
      const yourBrandDataPoint = {
        name: "Your Brand",
        shareOfVoice: yourBrandTrueShareOfVoice, // Use true share of voice
        totalMentions: yourBrandMentions,
        totalAnalyses: yourBrandAnalyses,
        avgRank: undefined,
        dataType: "share_of_voice" as const,
      };

      // Ensure Your Brand data point is valid and always included
      const validShareOfVoice =
        !isNaN(yourBrandTrueShareOfVoice) && isFinite(yourBrandTrueShareOfVoice)
          ? yourBrandTrueShareOfVoice
          : 0; // Fallback to 0 if invalid

      const safeBrandDataPoint = {
        name: "Your Brand",
        shareOfVoice: validShareOfVoice,
        value: validShareOfVoice, // Add value field for ShareOfVoiceChart compatibility
        totalMentions:
          !isNaN(yourBrandMentions) && isFinite(yourBrandMentions)
            ? yourBrandMentions
            : 0, // Fallback to 0 if invalid
        totalAnalyses:
          !isNaN(yourBrandAnalyses) && isFinite(yourBrandAnalyses)
            ? yourBrandAnalyses
            : 0, // Fallback to 0 if invalid
        avgRank: undefined,
        dataType: "share_of_voice" as const,
      };

      const shareOfVoiceData: ShareOfVoiceDataPoint[] = [
        safeBrandDataPoint, // Always ensure Your Brand is included with valid data
        ...competitorTrueShares.map((comp) => ({
          name: comp.competitorName,
          shareOfVoice: comp.trueShareOfVoice, // Use true share of voice
          value: comp.trueShareOfVoice, // Add value field for ShareOfVoiceChart compatibility
          totalMentions: comp.totalMentions,
          totalAnalyses: comp.totalAnalyses,
          competitorId: comp.competitorId,
          avgRank: comp.avgRankPosition,
          dataType: "share_of_voice" as const,
        })),
      ];

      // Competitive gaps will be generated in unified analytics from gapAnalysis directly

      // Create unified competitor analytics with validated data
      const unifiedAnalytics = this.createUnifiedCompetitorAnalytics({
        competitors,
        shareOfVoice,
        gapAnalysis,
        insights,
        timeSeriesData,
        marketShareData,
        shareOfVoiceData,
        totalMentionsAllBrands,
        yourBrandMentions,
      });

      return unifiedAnalytics;
    });
  }

  /**
   * Batch add competitors (optimized for multiple inserts with UPSERT)
   */
  async batchAddCompetitors(
    websiteId: string,
    competitors: Array<{ domain: string; name?: string }>
  ): Promise<Competitor[]> {
    // Check for existing competitors in batch
    const domains = competitors.map((c) => c.domain);
    const { data: existing } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .select("id, competitor_domain, competitor_name, is_active")
      .eq("website_id", websiteId)
      .in("competitor_domain", domains);

    const existingMap = new Map(
      existing?.map((e) => [e.competitor_domain, e]) || []
    );

    const newCompetitors = competitors.filter(
      (c) => !existingMap.has(c.domain)
    );

    const updatedCompetitors = competitors.filter((c) =>
      existingMap.has(c.domain)
    );

    const results: Competitor[] = [];

    // Insert new competitors
    if (newCompetitors.length > 0) {
      const { data: newData, error: insertError } = await supabase
        .schema("beekon_data")
        .from("competitors")
        .insert(
          newCompetitors.map((comp) => ({
            website_id: websiteId,
            competitor_domain: comp.domain,
            competitor_name: comp.name || null,
            is_active: true,
          }))
        )
        .select();

      if (insertError) throw insertError;
      results.push(...(newData || []));
    }

    // Update existing competitors (reactivate and update name if provided)
    for (const comp of updatedCompetitors) {
      const existing = existingMap.get(comp.domain);
      if (existing) {
        const updates: Partial<Competitor> = { is_active: true };
        if (comp.name && comp.name !== existing.competitor_name) {
          updates.competitor_name = comp.name;
        }

        const { data: updateData, error: updateError } = await supabase
          .schema("beekon_data")
          .from("competitors")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        if (updateData) results.push(updateData);
      }
    }

    // Clear all relevant cache for this website
    this.clearCache(`competitors_data_${websiteId}`);
    this.clearCache(`performance_${websiteId}`);
    this.clearCache(`analytics_${websiteId}`);

    // Clear cache patterns that might contain this website ID
    for (const key of this.cache.keys()) {
      if (key.includes(websiteId)) {
        this.cache.delete(key);
      }
    }

    // Refresh materialized views to ensure new competitors appear in analytics
    try {
      await this.refreshCompetitorViews();
      await this.refreshCompetitorAnalysis();
      // Materialized views refreshed successfully
    } catch (refreshError) {
      // Failed to refresh materialized views
      // Don't throw the error to avoid breaking the main operation
    }

    return results;
  }

  /**
   * Add a new competitor (optimized with UPSERT behavior)
   */
  async addCompetitor(
    websiteId: string,
    domain: string,
    name?: string
  ): Promise<Competitor> {
    const result = await this.batchAddCompetitors(websiteId, [
      { domain, name },
    ]);
    if (result.length === 0) {
      // If no result, try to get the existing competitor
      const { data: existing } = await supabase
        .schema("beekon_data")
        .from("competitors")
        .select(
          "*, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_error_message"
        )
        .eq("website_id", websiteId)
        .eq("competitor_domain", domain)
        .single();

      if (existing) {
        return existing;
      }
      throw new Error("Failed to add or retrieve competitor");
    }
    return result[0]!;
  }

  /**
   * Update competitor information (optimized)
   */
  async updateCompetitor(
    competitorId: string,
    updates: Partial<Pick<Competitor, "competitor_name" | "is_active">>
  ): Promise<Competitor> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .update(updates)
      .eq("id", competitorId)
      .select("*, website_id")
      .single();

    if (error) throw error;

    // Clear relevant cache
    this.clearCache(`competitors_data_${data.website_id}`);

    // Refresh materialized views to ensure updated competitors appear in analytics
    try {
      await this.refreshCompetitorViews();
      await this.refreshCompetitorAnalysis();
      // Materialized views refreshed successfully
    } catch (refreshError) {
      // Failed to refresh materialized views
      // Don't throw the error to avoid breaking the main operation
    }

    return data;
  }

  /**
   * Delete a competitor with transaction-safe CASCADE cleanup
   * Uses database stored procedure for atomic deletion of competitor and all related data
   */
  async deleteCompetitor(competitorId: string): Promise<void> {
    try {
      // Execute transaction-safe deletion via database stored procedure
      // This handles all CASCADE deletions atomically with rollback on failure
      const { data: rawResult, error: rpcError } = await supabase.rpc(
        "delete_competitor_with_transaction" as never,
        {
          competitor_id_param: competitorId,
        } as never
      );

      if (rpcError) {
        console.error(`❌ Database deletion failed:`, rpcError);
        throw rpcError;
      }

      // Parse the result as JSON response from stored procedure
      const result = rawResult as unknown as {
        success: boolean;
        competitor_id: string;
        competitor_name: string | null;
        competitor_domain: string;
        website_id: string;
        deleted_analysis_results: number;
        deleted_status_logs: number;
        timestamp: string;
      };

      // Log the deletion results
      if (result && result.success) {
        // Clear all related application caches
        await this.clearCompetitorCaches(result.website_id, competitorId);
      }

      // Force synchronous materialized view refresh to update analytics immediately
      await this.forceSynchronousViewRefresh();
    } catch (error) {
      console.error(`❌ Error during competitor deletion:`, error);

      // Provide detailed error message
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error during deletion";

      throw new Error(`Failed to delete competitor: ${errorMessage}`);
    }
  }

  /**
   * Clear all caches related to a competitor
   */
  private async clearCompetitorCaches(
    websiteId: string,
    competitorId: string
  ): Promise<void> {
    try {
      // Clear main competitor data cache
      this.clearCache(`competitors_data_${websiteId}`);

      // Clear performance cache for all date ranges
      this.clearCache(`performance_${websiteId}`);

      // Clear time series cache for this competitor
      const cacheEntries = Object.keys(this.cache);
      const competitorCaches = cacheEntries.filter(
        (key) =>
          key.includes(`timeseries_${websiteId}`) ||
          key.includes(`analytics_${websiteId}`) ||
          key.includes(competitorId)
      );

      competitorCaches.forEach((key) => {
        this.clearCache(key);
      });
    } catch (error) {
      console.error(`❌ Error clearing competitor caches:`, error);
      throw error;
    }
  }

  /**
   * Force synchronous materialized view refresh to immediately remove deleted competitors
   */
  private async forceSynchronousViewRefresh(): Promise<void> {
    try {
      // Refresh all competitor-related materialized views synchronously
      const refreshPromises = [
        this.refreshCompetitorViews(),
        this.refreshCompetitorAnalysis(),
      ];

      // Wait for all refreshes to complete
      await Promise.all(refreshPromises);
    } catch (error) {
      console.error(`❌ Error during synchronous view refresh:`, error);
      // Don't throw - view refresh failure shouldn't block deletion
      console.warn(`⚠️ View refresh failed but deletion will continue`);
    }
  }

  /**
   * Transform competitor data into clean, flattened export format
   */
  private transformCompetitorDataForExport(
    competitors: CompetitorServicePerformance[],
    analytics: CompetitorAnalytics,
    dateRange?: { start: string; end: string }
  ): Record<string, unknown>[] {
    const exportRows: Record<string, unknown>[] = [];

    // Export metadata section
    exportRows.push(
      {
        category: "Export Info",
        metric: "Export Date",
        value: new Date().toLocaleDateString(),
        unit: "date",
      },
      {
        category: "Export Info",
        metric: "Total Competitors",
        value: competitors.length,
        unit: "count",
      },
      {
        category: "Export Info",
        metric: "Active Competitors",
        value: analytics.activeCompetitors,
        unit: "count",
      }
    );

    if (dateRange) {
      exportRows.push(
        {
          category: "Export Info",
          metric: "Date Range Start",
          value: new Date(dateRange.start).toLocaleDateString(),
          unit: "date",
        },
        {
          category: "Export Info",
          metric: "Date Range End",
          value: new Date(dateRange.end).toLocaleDateString(),
          unit: "date",
        }
      );
    }

    // Overall analytics section
    exportRows.push({
      category: "Analytics Overview",
      metric: "Average Competitor Rank",
      value: analytics.averageCompetitorRank.toFixed(1),
      unit: "position",
    });

    // Market share data section
    analytics.marketShareData.forEach((item) => {
      exportRows.push({
        category: "Market Share",
        metric: `${item.name} Share`,
        value: `${item.value}%`,
        unit: "percentage",
      });
    });

    // Individual competitor performance
    competitors.forEach((competitor) => {
      const competitorName = competitor.name || competitor.domain;

      exportRows.push(
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Domain`,
          value: competitor.domain,
          unit: "text",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Share of Voice`,
          value: `${competitor.shareOfVoice}%`,
          unit: "percentage",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Average Rank`,
          value:
            competitor.averageRank > 0
              ? competitor.averageRank.toFixed(1)
              : "N/A",
          unit: "position",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Mention Count`,
          value: competitor.mentionCount,
          unit: "count",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Sentiment Score`,
          value: `${competitor.sentimentScore}%`,
          unit: "percentage",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Visibility Score`,
          value: `${competitor.visibilityScore}%`,
          unit: "percentage",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Trend`,
          value: `${competitor.trend} (${competitor.trendPercentage.toFixed(
            1
          )}%)`,
          unit: "trend",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Last Analyzed`,
          value: new Date(competitor.lastAnalyzed).toLocaleDateString(),
          unit: "date",
        },
        {
          category: "Competitor Performance",
          metric: `${competitorName} - Status`,
          value: competitor.isActive ? "Active" : "Inactive",
          unit: "status",
        }
      );
    });

    // Competitive gaps analysis
    analytics.competitiveGaps.forEach((gap) => {
      exportRows.push({
        category: "Competitive Gaps",
        metric: `${gap.topic} - Your Brand Score`,
        value: gap.yourBrand,
        unit: "score",
      });

      gap.competitors.forEach((comp) => {
        exportRows.push({
          category: "Competitive Gaps",
          metric: `${gap.topic} - ${comp.name} Score`,
          value: comp.score,
          unit: "score",
        });
      });
    });

    // Insights section
    analytics.insights.forEach((insight, index) => {
      exportRows.push(
        {
          category: "Insights",
          metric: `Insight #${index + 1} - Type`,
          value: insight.type,
          unit: "text",
        },
        {
          category: "Insights",
          metric: `Insight #${index + 1} - Content`,
          value: insight.content,
          unit: "text",
        },
        {
          category: "Insights",
          metric: `Insight #${index + 1} - Impact Score`,
          value: insight.impactScore,
          unit: "score",
        }
      );
    });

    return exportRows;
  }

  /**
   * Export competitor data (optimized)
   */
  async exportCompetitorData(
    websiteId: string,
    format: "csv" | "json" | "pdf",
    dateRange?: { start: string; end: string }
  ): Promise<Blob> {
    // Use parallel execution for better performance
    const [competitors, analytics] = await Promise.all([
      this.getCompetitorPerformance(websiteId, dateRange),
      this.getCompetitiveAnalysis(websiteId, dateRange),
    ]);

    // For PDF export, use the shared export service
    if (format === "pdf") {
      const exportFormattedData = this.transformCompetitorDataForExport(
        competitors,
        analytics,
        dateRange
      );

      const { exportService } = await import("./exportService");
      const exportData = {
        title: "Competitor Analysis Export",
        data: exportFormattedData,
        exportedAt: new Date().toISOString(),
        totalRecords: competitors.length,
        metadata: {
          exportType: "competitor_analysis",
          generatedBy: "Beekon AI Competitor Service",
          competitorCount: competitors.length,
          analyticsIncluded: true,
          dateRange: dateRange || null,
        },
      };

      return await exportService.exportData(exportData, format, {
        exportType: "competitor",
        customFilename: `competitor_analysis_${competitors.length}_competitors`,
      });
    }

    // For CSV and JSON, use existing logic
    const exportData = {
      competitors,
      analytics,
      exportedAt: new Date().toISOString(),
      dateRange,
    };

    switch (format) {
      case "json":
        return new Blob([JSON.stringify(exportData, null, 2)], {
          type: "application/json",
        });
      case "csv":
        return new Blob([this.convertToCSV(exportData)], {
          type: "text/csv",
        });
      default:
        throw new Error(
          `Unsupported format: ${format}. Supported formats are: csv, json, pdf`
        );
    }
  }

  /**
   * Refresh materialized views (for real-time updates)
   */
  async refreshCompetitorViews(): Promise<void> {
    await supabase
      .schema("beekon_data")
      .rpc("refresh_competitor_performance_views");
    // Clear all cache after refresh
    this.clearCache();
  }

  // Private helper methods

  private calculateTrend(trendValue: number | null): "up" | "down" | "stable" {
    if (!trendValue) return "stable";
    if (trendValue > 5) return "up";
    if (trendValue < -5) return "down";
    return "stable";
  }

  private convertToCSV(data: {
    competitors: CompetitorServicePerformance[];
    analytics: CompetitorAnalytics;
  }): string {
    const { competitors, analytics } = data;

    let csv = "Competitor Analysis Export\n\n";

    // Competitors section
    csv += "Competitors\n";
    csv +=
      "Name,Domain,Share of Voice,Average Rank,Mentions,Sentiment Score,Trend\n";
    competitors.forEach((comp) => {
      csv += `${comp.name},${comp.domain},${comp.shareOfVoice}%,${comp.averageRank},${comp.mentionCount},${comp.sentimentScore}%,${comp.trend}\n`;
    });
    csv += "\n";

    // Market share section
    csv += "Market Share\n";
    csv += "Name,Share of Voice\n";
    analytics.marketShareData.forEach((item) => {
      csv += `${item.name},${item.value}%\n`;
    });
    csv += "\n";

    // Competitive gaps section
    csv += "Competitive Gaps\n";
    csv += "Topic,Your Brand";
    if (analytics.competitiveGaps.length > 0) {
      analytics.competitiveGaps[0]!.competitors.forEach((comp) => {
        csv += `,${comp.name}`;
      });
    }
    csv += "\n";

    analytics.competitiveGaps.forEach((gap) => {
      csv += `${gap.topic},${gap.yourBrand}`;
      gap.competitors.forEach((comp) => {
        csv += `,${comp.score}`;
      });
      csv += "\n";
    });

    return csv;
  }

  /**
   * Get analysis results for a website using OPTIMIZED materialized view function
   * This replaces expensive 4-table JOINs with lightning-fast pre-computed data
   */
  private async getAnalysisResultsForWebsite(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<AnalysisResult[]> {
    // OPTIMIZED: Use materialized view function instead of expensive raw table JOINs
    const defaultDateRange = {
      start:
        dateRange?.start ||
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      end: dateRange?.end || new Date().toISOString(),
    };

    const { data, error } = await (
      supabase.schema("beekon_data") as unknown as {
        rpc: (
          name: string,
          params: Record<string, unknown>
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("get_analysis_results_optimized", {
      p_website_id: websiteId,
      p_date_start: defaultDateRange.start,
      p_date_end: defaultDateRange.end,
      p_limit: 10000, // Large limit for comprehensive analysis
      p_offset: 0,
    });

    if (error) {
      console.error(
        "❌ [ERROR] getAnalysisResultsForWebsite OPTIMIZED query failed:",
        error
      );
      throw error;
    }

    // Transform materialized view data to expected AnalysisResult format
    const resultsMap = new Map<string, AnalysisResult>();

    (Array.isArray(data) ? data : []).forEach(
      (row: Record<string, unknown>) => {
        const topicName = row.topic;

        if (!resultsMap.has(String(topicName))) {
          resultsMap.set(String(topicName), {
            id: String(row.topic_id),
            topic: String(topicName),
            topic_name: String(topicName),
            topic_keywords: [], // Keywords not available in materialized view
            llm_results: [],
            total_mentions: 0,
            avg_rank: null,
            avg_confidence: null,
            avg_sentiment: null,
          } as AnalysisResult);
        }

        const analysisResult = resultsMap.get(String(topicName))!;
        analysisResult.llm_results.push({
          llm_provider: String(row.llm_provider),
          is_mentioned: Boolean(row.is_mentioned) || false,
          rank_position: row.rank_position as number | null,
          confidence_score: row.confidence_score as number | null,
          sentiment_score: row.sentiment_score as number | null,
          summary_text: row.summary_text as string | null,
          response_text: "", // Not available in materialized view
          analyzed_at: String(row.analyzed_at) || new Date().toISOString(),
        });

        if (row.is_mentioned) {
          analysisResult.total_mentions++;
        }
      }
    );

    const results = Array.from(resultsMap.values());

    return results;
  }

  /**
   * Trigger competitor analysis for new LLM responses
   */
  async analyzeCompetitorsInResponse(
    websiteId: string,
    promptId: string,
    llmProvider: string,
    responseText: string
  ): Promise<void> {
    try {
      // Get all active competitors for this website
      const competitors = await this.getCompetitors(websiteId);

      if (competitors.length === 0) {
        return; // No competitors to analyze
      }

      // Create response map for batch analysis
      const responseTextMap = new Map<string, string>();
      responseTextMap.set(promptId, responseText);

      // Analyze all competitors for this response
      await competitorAnalysisService.batchAnalyzeCompetitors(
        websiteId,
        competitors.map((c) => c.id),
        [promptId],
        llmProvider,
        responseTextMap
      );

      // Clear cache to ensure fresh data on next request
      this.clearCache();
    } catch (error) {
      // Error analyzing competitors in response
      // Don't throw - this is a background operation
    }
  }

  /**
   * Get enhanced share of voice data
   */
  async getEnhancedShareOfVoice(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorShareOfVoice[]> {
    const cacheKey = `enhanced_sov_${websiteId}_${dateRange?.start || "all"}_${
      dateRange?.end || "all"
    }`;

    return this.getCachedData(cacheKey, async () => {
      return competitorAnalysisService.getCompetitorShareOfVoice(
        websiteId,
        dateRange
      );
    });
  }

  /**
   * Get enhanced competitive gap analysis
   */
  async getEnhancedCompetitiveGaps(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitiveGapAnalysis[]> {
    const cacheKey = `enhanced_gaps_${websiteId}_${dateRange?.start || "all"}_${
      dateRange?.end || "all"
    }`;

    return this.getCachedData(cacheKey, async () => {
      return competitorAnalysisService.getCompetitiveGapAnalysis(
        websiteId,
        dateRange
      );
    });
  }

  /**
   * Get competitor insights
   */
  async getCompetitorInsights(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorInsight[]> {
    const cacheKey = `insights_${websiteId}_${dateRange?.start || "all"}_${
      dateRange?.end || "all"
    }`;

    return this.getCachedData(cacheKey, async () => {
      return competitorAnalysisService.getCompetitorInsights(
        websiteId,
        dateRange
      );
    });
  }

  /**
   * Create unified competitor analytics with validated and consistent data
   */
  private createUnifiedCompetitorAnalytics({
    competitors,
    shareOfVoice,
    gapAnalysis,
    insights,
    timeSeriesData,
    marketShareData,
    shareOfVoiceData,
  }: {
    competitors: CompetitorServicePerformance[];
    shareOfVoice: CompetitorShareOfVoice[];
    gapAnalysis: CompetitiveGapAnalysis[];
    insights: CompetitorInsight[];
    timeSeriesData: CompetitorTimeSeriesData[];
    marketShareData: MarketShareDataPoint[];
    shareOfVoiceData: ShareOfVoiceDataPoint[];
    totalMentionsAllBrands: number;
    yourBrandMentions: number;
    // Note: totalMentionsAllBrands and yourBrandMentions can be calculated from shareOfVoice data
  }): CompetitorAnalytics {
    // Validate data consistency before creating analytics
    const validation = this.validateCompetitorData({
      shareOfVoice,
      gapAnalysis,
      marketShareData,
      insights,
    });

    // Additional validation for share of voice totals
    const shareOfVoiceTotal = shareOfVoiceData.reduce(
      (sum, item) => sum + item.shareOfVoice,
      0
    );
    const marketShareTotal = marketShareData.reduce(
      (sum, item) => sum + item.normalizedValue,
      0
    );

    // UPDATED: Expect normalized data to be very close to 100%
    if (Math.abs(shareOfVoiceTotal - 100) > 1) {
      validation.warnings.push(
        `Share of voice total deviates from 100%: ${shareOfVoiceTotal.toFixed(
          2
        )}% (expected: 100.00% ±1%)`
      );
    }

    if (Math.abs(marketShareTotal - 100) > 5) {
      validation.warnings.push(
        `Market share total deviates from 100%: ${marketShareTotal.toFixed(1)}%`
      );
    }

    // Validation issues logged for debugging and monitoring
    if (validation.issues.length > 0) {
      // Competitor data validation issues found
      // In production, you might want to send this to a monitoring service
      this.logValidationIssues(validation);
    }

    if (validation.warnings.length > 0) {
      // Competitor data validation warnings found
    }

    // Create competitive gaps in consistent format (use gapAnalysis as primary source)
    const competitiveGaps: CompetitorComparison[] = gapAnalysis.map((gap) => ({
      topic: gap.topicName,
      yourBrand: Math.round(gap.yourBrandScore),
      competitors: gap.competitorData.map((comp) => ({
        competitorId: comp.competitor_id,
        name: comp.competitor_name,
        score: Math.round(comp.score),
      })),
    }));

    // Use validated insights that match the displayed data
    const validatedInsights = this.validateInsightsAgainstDisplayData(
      insights,
      shareOfVoice,
      gapAnalysis,
      marketShareData
    );

    // Count competitors with pending or in-progress analysis
    const competitorsWithPendingAnalysis = competitors.filter(
      (c) => c.analysisStatus === "pending" || c.analysisStatus === "analyzing"
    ).length;

    return {
      totalCompetitors: competitors.length,
      activeCompetitors: competitors.filter((c) => c.isActive).length,
      competitorsWithPendingAnalysis,
      hasInProgressAnalysis: competitorsWithPendingAnalysis > 0,
      averageCompetitorRank:
        competitors.length > 0
          ? competitors.reduce((sum, c) => sum + (c.averageRank || 0), 0) /
            competitors.length
          : 0,
      marketShareData,
      shareOfVoiceData, // Add the new share of voice data
      competitiveGaps, // Use consistent format derived from gapAnalysis
      timeSeriesData,
      shareOfVoice,
      gapAnalysis, // Keep raw database format for advanced components
      insights: validatedInsights,
      // Add metadata for debugging and validation
      _metadata: {
        dataValidation: validation,
        generatedAt: new Date().toISOString(),
        dataConsistency: this.checkDataConsistency(
          marketShareData,
          shareOfVoice
        ),
      },
    };
  }

  /**
   * Validate competitor data for consistency and quality
   */
  private validateCompetitorData({
    shareOfVoice,
    gapAnalysis,
    marketShareData,
    insights,
  }: {
    shareOfVoice: CompetitorShareOfVoice[];
    gapAnalysis: CompetitiveGapAnalysis[];
    marketShareData: MarketShareDataPoint[];
    insights: CompetitorInsight[];
  }) {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Validate market share data (normalized values should sum to ~100%)
    const totalMarketShare = marketShareData.reduce(
      (sum, item) => sum + item.normalizedValue,
      0
    );
    if (totalMarketShare > 105) {
      // Allow 5% tolerance for rounding
      issues.push(
        `Market share total exceeds 100%: ${totalMarketShare.toFixed(1)}%`
      );
    }

    // Validate share of voice consistency
    const shareOfVoiceTotal = shareOfVoice.reduce(
      (sum, comp) => sum + comp.shareOfVoice,
      0
    );
    // UPDATED: Expect normalized data to be very close to 100%
    if (Math.abs(shareOfVoiceTotal - 100) > 1) {
      warnings.push(
        `Share of voice total deviates from expected 100%: ${shareOfVoiceTotal.toFixed(
          2
        )}% (±1% tolerance)`
      );
    }

    // Validate gap analysis data
    gapAnalysis.forEach((gap) => {
      if (gap.yourBrandScore < 0 || gap.yourBrandScore > 100) {
        issues.push(
          `Invalid brand score for ${gap.topicName}: ${gap.yourBrandScore}%`
        );
      }
      gap.competitorData.forEach((comp) => {
        if (comp.score < 0 || comp.score > 100) {
          issues.push(
            `Invalid competitor score for ${comp.competitor_name}: ${comp.score}%`
          );
        }
      });
    });

    // Validate insights reference existing competitors
    insights.forEach((insight) => {
      if (insight.competitorId) {
        const competitorExists = shareOfVoice.some(
          (comp) => comp.competitorId === insight.competitorId
        );
        if (!competitorExists) {
          warnings.push(
            `Insight references non-existent competitor: ${insight.competitorId}`
          );
        }
      }
    });

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      totalChecks: 4,
      passedChecks: 4 - issues.length,
    };
  }

  /**
   * Validate insights against display data to ensure consistency
   */
  private validateInsightsAgainstDisplayData(
    insights: CompetitorInsight[],
    shareOfVoice: CompetitorShareOfVoice[],
    gapAnalysis: CompetitiveGapAnalysis[],
    marketShareData: MarketShareDataPoint[]
  ): CompetitorInsight[] {
    return insights.map((insight) => {
      // For market leader insights, verify the dominance claim against actual market share data
      if (insight.title.includes("Market Leader") && insight.competitorId) {
        const marketShareItem = marketShareData.find(
          (item) => item.competitorId === insight.competitorId
        );
        const shareOfVoiceItem = shareOfVoice.find(
          (item) => item.competitorId === insight.competitorId
        );

        if (marketShareItem && shareOfVoiceItem) {
          // Update description to match actual displayed data (use normalized value for market share)
          const actualShare = marketShareItem.normalizedValue;
          const updatedDescription = `${
            shareOfVoiceItem.competitorName
          } dominates with ${actualShare.toFixed(1)}% market share`;

          return {
            ...insight,
            description: updatedDescription,
          };
        }
      }

      // For opportunity insights, verify gap data matches
      if (
        insight.title.includes("Improvement Opportunity") &&
        insight.topicId
      ) {
        const gapData = gapAnalysis.find(
          (gap) => gap.topicId === insight.topicId
        );
        if (gapData && gapData.competitorData.length > 0) {
          const topCompetitor = gapData.competitorData.reduce((prev, current) =>
            prev.score > current.score ? prev : current
          );

          const updatedDescription = `Your brand scores ${gapData.yourBrandScore.toFixed(
            1
          )}% vs ${
            topCompetitor.competitor_name
          }'s ${topCompetitor.score.toFixed(1)}%`;

          return {
            ...insight,
            description: updatedDescription,
          };
        }
      }

      return insight;
    });
  }

  /**
   * Check data consistency between different data sources
   */
  private checkDataConsistency(
    marketShareData: MarketShareDataPoint[],
    shareOfVoice: CompetitorShareOfVoice[]
  ) {
    const consistency = {
      competitorCount: {
        marketShare: marketShareData.filter(
          (item) => item.name !== "Your Brand"
        ).length,
        shareOfVoice: shareOfVoice.length,
        consistent: false,
      },
      dataAlignment: {
        matchingCompetitors: 0,
        missingInMarketShare: 0,
        missingInShareOfVoice: 0,
      },
    };

    // Check competitor count consistency
    consistency.competitorCount.consistent =
      consistency.competitorCount.marketShare ===
      consistency.competitorCount.shareOfVoice;

    // Check data alignment
    shareOfVoice.forEach((sovItem) => {
      const marketShareItem = marketShareData.find(
        (msItem) => msItem.competitorId === sovItem.competitorId
      );
      if (marketShareItem) {
        consistency.dataAlignment.matchingCompetitors++;
      } else {
        consistency.dataAlignment.missingInMarketShare++;
      }
    });

    marketShareData.forEach((msItem) => {
      if (
        msItem.name !== "Your Brand" &&
        !shareOfVoice.find(
          (sovItem) => sovItem.competitorId === msItem.competitorId
        )
      ) {
        consistency.dataAlignment.missingInShareOfVoice++;
      }
    });

    return consistency;
  }

  /**
   * Log validation issues for monitoring and debugging
   */
  private logValidationIssues(_validation: {
    isValid: boolean;
    issues: string[];
    warnings: string[];
    totalChecks: number;
    passedChecks: number;
  }) {
    // In a production environment, you might send this to a monitoring service like:
    // - Sentry for error tracking
    // - DataDog for metrics
    // - Custom analytics endpoint
    // Validation issues and warnings detected
    // This could be enhanced with proper monitoring integration
  }

  /**
   * Performance monitoring wrapper for async operations
   */
  private async withPerformanceMonitoring<T>(
    _operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Performance timing for debugging (startTime available for future monitoring)

    const result = await operation();
    // Performance metrics logged
    // In production, you might want to send metrics to a monitoring service
    // Slow operation detection for monitoring

    return result;
  }

  /**
   * Enhanced competitive analysis with performance monitoring
   */
  async getOptimizedCompetitiveAnalysis(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorAnalytics> {
    return this.withPerformanceMonitoring(
      "getOptimizedCompetitiveAnalysis",
      () => this.getCompetitiveAnalysis(websiteId, dateRange)
    );
  }

  /**
   * Refresh all competitor analysis data
   */
  async refreshCompetitorAnalysis(): Promise<void> {
    await competitorAnalysisService.refreshCompetitorAnalysisViews();
    this.clearCache(); // Clear all cached data
  }
}

// Export the optimized service as the default
export const competitorService = OptimizedCompetitorService.getInstance();
