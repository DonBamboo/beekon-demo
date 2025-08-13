import { supabase } from "@/integrations/supabase/client";
import {
  Competitor,
  CompetitorInsert,
  CompetitorUpdate,
  AnalysisResult,
  LLMResult,
} from "@/types/database";
import BaseService from "./baseService";
import {
  competitorAnalysisService,
  type CompetitorShareOfVoice,
  type CompetitiveGapAnalysis,
  type CompetitorInsight,
} from "./competitorAnalysisService";

// Re-export types for external use
export type { CompetitiveGapAnalysis, CompetitorShareOfVoice, CompetitorInsight };
export type { Competitor };

export interface CompetitorPerformance {
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
  avgRank?: number;
  dataType: "market_share"; // Explicit data type identifier
}

export interface ShareOfVoiceDataPoint {
  name: string;
  shareOfVoice: number; // Raw percentage of mentions
  totalMentions: number;
  totalAnalyses: number;
  competitorId?: string;
  avgRank?: number;
  dataType: "share_of_voice"; // Explicit data type identifier
}

export interface CompetitorAnalytics {
  totalCompetitors: number;
  activeCompetitors: number;
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
      return cached.data;
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
        .select("*")
        .eq("website_id", websiteId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    });
  }

  /**
   * Get competitor performance metrics (optimized with database functions)
   */
  async getCompetitorPerformance(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorPerformance[]> {
    const cacheKey = `performance_${websiteId}_${dateRange?.start || "all"}_${
      dateRange?.end || "all"
    }`;

    return this.getCachedData(cacheKey, async () => {
      // First check if there are any competitors for this website
      const { data: competitors } = await supabase
        .schema("beekon_data")
        .from("competitors")
        .select("id")
        .eq("website_id", websiteId)
        .eq("is_active", true)
        .limit(1);

      // If no competitors exist, return empty array immediately
      if (!competitors || competitors.length === 0) {
        return [];
      }

      // Use the optimized database function
      const { data, error } = await supabase.rpc("get_competitor_performance", {
        p_website_id: websiteId,
        p_limit: 50,
        p_offset: 0,
      });

      if (error) throw error;

      // Transform database results to match interface with safe calculations
      return (data || []).map((row: Record<string, unknown>) => {
        const totalMentions = row.total_mentions || 0;
        const positiveMentions = row.positive_mentions || 0;
        const avgSentiment = row.avg_sentiment_score;
        const avgRank = row.avg_rank_position;
        const mentionTrend = row.mention_trend_7d;

        // Average rank processing completed

        return {
          competitorId: row.competitor_id,
          domain: row.competitor_domain,
          name: row.competitor_name || row.competitor_domain,
          shareOfVoice:
            totalMentions > 0
              ? Math.round((positiveMentions / totalMentions) * 100)
              : 0,
          averageRank:
            avgRank && !isNaN(avgRank) && avgRank > 0 && avgRank <= 20
              ? avgRank
              : null,
          mentionCount: totalMentions,
          sentimentScore:
            avgSentiment && !isNaN(avgSentiment)
              ? Math.round((avgSentiment + 1) * 50)
              : 50,
          visibilityScore:
            totalMentions > 0
              ? Math.round((positiveMentions / totalMentions) * 100)
              : 0,
          trend: this.calculateTrend(mentionTrend),
          trendPercentage:
            mentionTrend && !isNaN(mentionTrend) ? Math.abs(mentionTrend) : 0,
          lastAnalyzed: row.last_analysis_date || new Date().toISOString(),
          isActive: true,
        };
      });
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
      // First check if there are any competitors for this website
      const { data: competitors } = await supabase
        .schema("beekon_data")
        .from("competitors")
        .select("id")
        .eq("website_id", websiteId)
        .eq("is_active", true)
        .limit(1);

      // If no competitors exist, return empty array immediately
      if (!competitors || competitors.length === 0) {
        return [];
      }

      const { data, error } = await supabase.rpc("get_competitor_time_series", {
        p_website_id: websiteId,
        p_competitor_domain: competitorDomain,
        p_days: days,
      });

      if (error) throw error;

      // Group by date
      const timeSeriesMap = new Map<string, CompetitorTimeSeriesData>();

      (data || []).forEach((row: Record<string, unknown>) => {
        const dateStr = row.analysis_date;
        if (!timeSeriesMap.has(dateStr)) {
          timeSeriesMap.set(dateStr, {
            date: dateStr,
            competitors: [],
          });
        }

        const dailyMentions = row.daily_mentions || 0;
        const dailyPositiveMentions = row.daily_positive_mentions || 0;
        const dailyAvgSentiment = row.daily_avg_sentiment;
        const dailyAvgRank = row.daily_avg_rank;

        timeSeriesMap.get(dateStr)!.competitors.push({
          competitorId: "", // Would need to join with competitors table
          name: row.competitor_domain,
          shareOfVoice:
            dailyMentions > 0
              ? Math.round((dailyPositiveMentions / dailyMentions) * 100)
              : 0,
          averageRank:
            dailyAvgRank &&
            !isNaN(dailyAvgRank) &&
            dailyAvgRank > 0 &&
            dailyAvgRank <= 20
              ? dailyAvgRank
              : 0,
          mentionCount: dailyMentions,
          sentimentScore:
            dailyAvgSentiment && !isNaN(dailyAvgSentiment)
              ? Math.round((dailyAvgSentiment + 1) * 50)
              : 50,
        });
      });

      return Array.from(timeSeriesMap.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    });
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

      // Create normalized market share data
      const marketShareData: MarketShareDataPoint[] = [
        {
          name: "Your Brand",
          normalizedValue: Number(
            (yourBrandTrueShareOfVoice * normalizationFactor).toFixed(1)
          ),
          rawValue: yourBrandMentionRate, // Keep old mention rate for reference
          mentions: yourBrandMentions,
          avgRank: null, // Your brand doesn't have a rank position
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
      const shareOfVoiceData: ShareOfVoiceDataPoint[] = [
        {
          name: "Your Brand",
          shareOfVoice: yourBrandTrueShareOfVoice, // Use true share of voice
          totalMentions: yourBrandMentions,
          totalAnalyses: yourBrandAnalyses,
          avgRank: null,
          dataType: "share_of_voice",
        },
        ...competitorTrueShares.map((comp) => ({
          name: comp.competitorName,
          shareOfVoice: comp.trueShareOfVoice, // Use true share of voice
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
        .select("*")
        .eq("website_id", websiteId)
        .eq("competitor_domain", domain)
        .single();

      if (existing) {
        return existing;
      }
      throw new Error("Failed to add or retrieve competitor");
    }
    return result[0];
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
   * Delete/deactivate a competitor (optimized)
   */
  async deleteCompetitor(competitorId: string): Promise<void> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .update({ is_active: false })
      .eq("id", competitorId)
      .select("website_id")
      .single();

    if (error) throw error;

    // Clear relevant cache
    if (data) {
      this.clearCache(`competitors_data_${data.website_id}`);

      // Refresh materialized views to ensure deleted competitors are removed from analytics
      try {
        await this.refreshCompetitorViews();
        await this.refreshCompetitorAnalysis();
        // Materialized views refreshed successfully
      } catch (refreshError) {
        // Failed to refresh materialized views
        // Don't throw the error to avoid breaking the main operation
      }
    }
  }

  /**
   * Transform competitor data into clean, flattened export format
   */
  private transformCompetitorDataForExport(
    competitors: CompetitorPerformance[],
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
    await supabase.rpc("refresh_competitor_performance_views");
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

  private calculateBrandMetrics(results: AnalysisResult[]): {
    overallVisibilityScore: number;
  } {
    if (results.length === 0) return { overallVisibilityScore: 0 };

    // Calculate share of voice using same methodology as competitor database function
    // Count total analyses and total mentions across all LLM results
    const allLLMResults = results.flatMap((r) => r.llm_results);
    const totalAnalyses = allLLMResults.length;
    const totalMentions = allLLMResults.filter((r) => r.is_mentioned).length;

    // Calculate share of voice as percentage of mentions
    // This matches the database function logic: (total_voice_mentions / total_analyses) * 100
    const overallVisibilityScore =
      totalAnalyses > 0 ? Math.round((totalMentions / totalAnalyses) * 100) : 0;

    return { overallVisibilityScore };
  }

  /**
   * @deprecated Legacy method - no longer used. Gap analysis now handled in unified analytics.
   */
  private transformGapAnalysisToLegacyFormat(
    gapAnalysis: CompetitiveGapAnalysis[]
  ): CompetitorComparison[] {
    // Legacy format transformation deprecated
    return gapAnalysis.map((gap) => ({
      topic: gap.topicName,
      yourBrand: Math.round(gap.yourBrandScore),
      competitors: gap.competitorData.map((comp) => ({
        competitorId: comp.competitorId,
        name: comp.competitor_name,
        score: Math.round(comp.score),
      })),
    }));
  }

  // Legacy method kept for backward compatibility but now deprecated
  private calculateCompetitiveGaps(
    competitors: CompetitorPerformance[],
    yourBrandResults: AnalysisResult[]
  ): CompetitorComparison[] {
    // Method deprecated - use newer implementation

    // Group your brand's results by topic
    const topicMap = new Map<string, number>();

    yourBrandResults.forEach((result) => {
      const mentionedCount = result.llm_results.filter(
        (r) => r.is_mentioned
      ).length;
      const totalCount = result.llm_results.length;
      const score = totalCount > 0 ? (mentionedCount / totalCount) * 100 : 0;

      if (!topicMap.has(result.topic)) {
        topicMap.set(result.topic, 0);
      }
      topicMap.set(result.topic, topicMap.get(result.topic)! + score);
    });

    // Create competitive gaps for each topic using real competitor data
    const gaps: CompetitorComparison[] = [];

    topicMap.forEach((yourScore, topic) => {
      gaps.push({
        topic,
        yourBrand: Math.round(yourScore),
        competitors: competitors.slice(0, 3).map((comp) => ({
          competitorId: comp.competitorId,
          name: comp.name,
          // Use actual share of voice as proxy for topic score instead of random data
          score: Math.round(comp.shareOfVoice),
        })),
      });
    });

    return gaps;
  }

  private convertToCSV(data: {
    competitors: CompetitorPerformance[];
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
   * Get analysis results for a website (optimized with better query)
   */
  private async getAnalysisResultsForWebsite(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<AnalysisResult[]> {
    // Use a more efficient query with proper joins
    let query = supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .select(
        `
        *,
        prompts!inner (
          prompt_text,
          topics!inner (
            topic_name,
            topic_keywords,
            website_id
          )
        )
      `
      )
      .eq("website_id", websiteId)
      .order("analyzed_at", { ascending: false });

    if (dateRange) {
      query = query
        .gte("analyzed_at", dateRange.start)
        .lte("analyzed_at", dateRange.end);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Efficiently transform data
    const resultsMap = new Map<string, AnalysisResult>();

    data?.forEach((row) => {
      const topic = row.prompts?.topics;
      if (!topic) return;

      const topicName = topic.topic_name;

      if (!resultsMap.has(topicName)) {
        resultsMap.set(topicName, {
          topic_name: topicName,
          topic_keywords: topic.topic_keywords || [],
          llm_results: [],
          total_mentions: 0,
          avg_rank: null,
          avg_confidence: null,
          avg_sentiment: null,
        });
      }

      const analysisResult = resultsMap.get(topicName)!;
      analysisResult.llm_results.push({
        llm_provider: row.llm_provider,
        is_mentioned: row.is_mentioned || false,
        rank_position: row.rank_position,
        confidence_score: row.confidence_score,
        sentiment_score: row.sentiment_score,
        summary_text: row.summary_text,
        response_text: row.response_text,
        analyzed_at: row.analyzed_at || new Date().toISOString(),
      });
    });

    return Array.from(resultsMap.values());
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
    totalMentionsAllBrands,
    yourBrandMentions,
  }: {
    competitors: CompetitorPerformance[];
    shareOfVoice: CompetitorShareOfVoice[];
    gapAnalysis: CompetitiveGapAnalysis[];
    insights: CompetitorInsight[];
    timeSeriesData: CompetitorTimeSeriesData[];
    marketShareData: MarketShareDataPoint[];
    shareOfVoiceData: ShareOfVoiceDataPoint[];
    totalMentionsAllBrands: number;
    yourBrandMentions: number;
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

    if (Math.abs(shareOfVoiceTotal - 100) > 5) {
      validation.warnings.push(
        `Share of voice total deviates from 100%: ${shareOfVoiceTotal.toFixed(
          1
        )}%`
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
        competitorId: comp.competitorId,
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

    return {
      totalCompetitors: competitors.length,
      activeCompetitors: competitors.filter((c) => c.isActive).length,
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
        calculationMethod: {
          shareOfVoiceCalculation: "relative_to_total_mentions",
          totalMentionsAllBrands,
          yourBrandMentions,
          shareOfVoiceTotal: shareOfVoiceTotal.toFixed(1),
          marketShareTotal: marketShareTotal.toFixed(1),
          description:
            "Share of voice calculated as (brand_mentions / total_mentions_all_brands) * 100",
        },
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
    if (shareOfVoiceTotal > 105) {
      warnings.push(
        `Share of voice total exceeds 100%: ${shareOfVoiceTotal.toFixed(1)}%`
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
  private logValidationIssues(validation: {
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

    const logData = {
      timestamp: new Date().toISOString(),
      service: "competitorService",
      validationResults: validation,
      userAgent:
        typeof window !== "undefined" ? window.navigator.userAgent : "server",
    };

    // Validation issues and warnings detected
    // This could be enhanced with proper monitoring integration
  }

  /**
   * Performance monitoring wrapper for async operations
   */
  private async withPerformanceMonitoring<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await operation();
      const duration = performance.now() - startTime;

      // Performance metrics logged
      // In production, you might want to send metrics to a monitoring service
      // Slow operation detection for monitoring

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      // Operation failed with performance metrics logged
      throw error;
    }
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
