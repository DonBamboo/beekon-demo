import { supabase } from "@/integrations/supabase/client";
import {
  Competitor,
  CompetitorInsert,
  CompetitorUpdate,
  AnalysisResult,
  LLMResult,
} from "@/types/database";
import BaseService from "./baseService";

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

export interface CompetitorAnalytics {
  totalCompetitors: number;
  activeCompetitors: number;
  averageCompetitorRank: number;
  marketShareData: Array<{
    name: string;
    value: number;
    competitorId?: string;
  }>;
  competitiveGaps: CompetitorComparison[];
  timeSeriesData: CompetitorTimeSeriesData[];
}

export class CompetitorService extends BaseService {
  private static instance: CompetitorService;
  protected serviceName = "website" as const;

  public static getInstance(): CompetitorService {
    if (!CompetitorService.instance) {
      CompetitorService.instance = new CompetitorService();
    }
    return CompetitorService.instance;
  }

  /**
   * Get all competitors for a website
   */
  async getCompetitors(websiteId: string): Promise<Competitor[]> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .select("*")
      .eq("website_id", websiteId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data || [];
  }

  /**
   * Add a new competitor
   */
  async addCompetitor(
    websiteId: string,
    domain: string,
    name?: string
  ): Promise<Competitor> {
    // Check if competitor already exists
    const { data: existing } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .select("id")
      .eq("website_id", websiteId)
      .eq("competitor_domain", domain)
      .single();

    if (existing) {
      throw new Error("Competitor already exists");
    }

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .insert({
        website_id: websiteId,
        competitor_domain: domain,
        competitor_name: name || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  /**
   * Update competitor information
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
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  /**
   * Delete/deactivate a competitor
   */
  async deleteCompetitor(competitorId: string): Promise<void> {
    const { error } = await supabase
      .schema("beekon_data")
      .from("competitors")
      .update({ is_active: false })
      .eq("id", competitorId);

    if (error) throw error;
  }

  /**
   * Get competitor performance metrics
   */
  async getCompetitorPerformance(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorPerformance[]> {
    const competitors = await this.getCompetitors(websiteId);
    const performanceData: CompetitorPerformance[] = [];

    for (const competitor of competitors) {
      // Get analysis results for this competitor domain
      const competitorResults = await this.getCompetitorAnalysisResults(
        competitor.competitor_domain,
        dateRange
      );

      // Calculate performance metrics
      const performance = await this.calculateCompetitorMetrics(
        competitor,
        competitorResults
      );

      performanceData.push(performance);
    }

    return performanceData.sort((a, b) => b.shareOfVoice - a.shareOfVoice);
  }

  /**
   * Get competitive analysis comparing your brand with competitors
   */
  async getCompetitiveAnalysis(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorAnalytics> {
    const [competitors, yourBrandResults] = await Promise.all([
      this.getCompetitorPerformance(websiteId, dateRange),
      this.getAnalysisResultsForWebsite(websiteId, dateRange),
    ]);

    // Calculate your brand's metrics
    const yourBrandMetrics = await this.getDashboardMetricsForWebsite(
      websiteId,
      dateRange
    );

    // Generate market share data
    const marketShareData = [
      {
        name: "Your Brand",
        value: yourBrandMetrics.overallVisibilityScore,
      },
      ...competitors.map((comp) => ({
        name: comp.name,
        value: comp.shareOfVoice,
        competitorId: comp.competitorId,
      })),
    ];

    // Generate competitive gap analysis
    const competitiveGaps = await this.calculateCompetitiveGaps(
      websiteId,
      competitors,
      yourBrandResults
    );

    // Generate time series data
    const timeSeriesData = await this.getCompetitorTimeSeriesData(
      websiteId,
      competitors,
      dateRange
    );

    return {
      totalCompetitors: competitors.length,
      activeCompetitors: competitors.filter((c) => c.isActive).length,
      averageCompetitorRank:
        competitors.reduce((sum, c) => sum + c.averageRank, 0) /
        competitors.length,
      marketShareData,
      competitiveGaps,
      timeSeriesData,
    };
  }

  /**
   * Export competitor data
   */
  async exportCompetitorData(
    websiteId: string,
    format: "pdf" | "csv" | "json",
    dateRange?: { start: string; end: string }
  ): Promise<Blob> {
    const [competitors, analytics] = await Promise.all([
      this.getCompetitorPerformance(websiteId, dateRange),
      this.getCompetitiveAnalysis(websiteId, dateRange),
    ]);

    const exportData = {
      competitors,
      analytics,
      exportedAt: new Date().toISOString(),
      dateRange,
    };

    if (format === "json") {
      return new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
    }

    if (format === "csv") {
      const csvContent = this.convertToCSV(exportData);
      return new Blob([csvContent], { type: "text/csv" });
    }

    // For PDF, return JSON for now (would need PDF library integration)
    return new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
  }

  private async getCompetitorAnalysisResults(
    domain: string,
    dateRange?: { start: string; end: string }
  ): Promise<AnalysisResult[]> {
    // This would typically search for analysis results that mention the competitor domain
    // For now, we'll simulate this by searching for prompts that contain the domain
    try {
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
              website_id
            )
          )
        `
        )
        .ilike("response_text", `%${domain}%`)
        .order("created_at", { ascending: false });

      if (dateRange) {
        query = query
          .gte("created_at", dateRange.start)
          .lte("created_at", dateRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transform data to match AnalysisResult format
      const resultsMap = new Map<string, AnalysisResult>();

      data?.forEach((row) => {
        const promptId = row.prompt_id;
        const prompt = row.prompts as {
          prompt_text: string;
          topics: { topic_name: string; website_id: string };
        };

        if (!resultsMap.has(promptId)) {
          resultsMap.set(promptId, {
            id: promptId,
            prompt: prompt.prompt_text,
            website_id: prompt.topics.website_id,
            topic: prompt.topics.topic_name,
            status: "completed",
            confidence: row.confidence_score || 0,
            created_at: row.created_at || "",
            updated_at: row.created_at || "",
            llm_results: [],
          });
        }

        const result = resultsMap.get(promptId)!;
        result.llm_results.push({
          id: row.id,
          llm_provider: row.llm_provider,
          is_mentioned: row.is_mentioned || false,
          rank_position: row.rank_position,
          sentiment_score: row.sentiment_score,
          response_text: row.response_text,
          confidence_score: row.confidence_score,
          analyzed_at: row.analyzed_at || row.created_at || "",
        });
      });

      return Array.from(resultsMap.values());
    } catch (error) {
      // Return empty array on error
      return [];
    }
  }

  private async calculateCompetitorMetrics(
    competitor: Competitor,
    results: AnalysisResult[]
  ): Promise<CompetitorPerformance> {
    const allLLMResults = results.flatMap((r) => r.llm_results);
    const mentionedResults = allLLMResults.filter((r) => r.is_mentioned);

    const shareOfVoice =
      allLLMResults.length > 0
        ? Math.round((mentionedResults.length / allLLMResults.length) * 100)
        : 0;

    const rankedResults = mentionedResults.filter(
      (r) => r.rank_position !== null
    );
    const averageRank =
      rankedResults.length > 0
        ? Math.round(
            (rankedResults.reduce((sum, r) => sum + (r.rank_position || 0), 0) /
              rankedResults.length) *
              10
          ) / 10
        : 0;

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

    // Calculate trend (simplified - would need historical data)
    const trend: "up" | "down" | "stable" = "stable";
    const trendPercentage = 0;

    return {
      competitorId: competitor.id,
      domain: competitor.competitor_domain,
      name: competitor.competitor_name || competitor.competitor_domain,
      shareOfVoice,
      averageRank,
      mentionCount: mentionedResults.length,
      sentimentScore,
      visibilityScore: shareOfVoice,
      trend,
      trendPercentage,
      lastAnalyzed: results.length > 0 ? results[0]!.created_at : "",
      isActive: competitor.is_active,
    };
  }

  private async calculateCompetitiveGaps(
    websiteId: string,
    competitors: CompetitorPerformance[],
    yourBrandResults: AnalysisResult[]
  ): Promise<CompetitorComparison[]> {
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

    // Create competitive gaps for each topic
    const gaps: CompetitorComparison[] = [];

    topicMap.forEach((yourScore, topic) => {
      gaps.push({
        topic,
        yourBrand: Math.round(yourScore),
        competitors: competitors.slice(0, 3).map((comp) => ({
          competitorId: comp.competitorId,
          name: comp.name,
          score: Math.round(comp.shareOfVoice * 0.8 + Math.random() * 0.4), // Simulated
        })),
      });
    });

    return gaps;
  }

  private async getCompetitorTimeSeriesData(
    websiteId: string,
    competitors: CompetitorPerformance[],
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorTimeSeriesData[]> {
    // This would generate time series data for competitors
    // For now, we'll simulate daily data for the past 30 days
    const days = 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const timeSeriesData: CompetitorTimeSeriesData[] = [];

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      timeSeriesData.push({
        date: currentDate.toISOString().split("T")[0]!,
        competitors: competitors.map((comp) => ({
          competitorId: comp.competitorId,
          name: comp.name,
          shareOfVoice: comp.shareOfVoice + Math.random() * 10 - 5, // Simulated variation
          averageRank: comp.averageRank + Math.random() * 0.5 - 0.25,
          mentionCount: Math.max(
            0,
            comp.mentionCount + Math.floor(Math.random() * 6) - 3
          ),
          sentimentScore: comp.sentimentScore + Math.random() * 20 - 10,
        })),
      });
    }

    return timeSeriesData;
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
   * Get analysis results for a website directly from database
   */
  private async getAnalysisResultsForWebsite(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<AnalysisResult[]> {
    return this.executeOperation("getAnalysisResultsForWebsite", async () => {
      let query = supabase
        .schema("beekon_data")
        .from("llm_analysis_results")
        .select(
          `
          *,
          prompts (*)
        `
        )
        .eq("website_id", websiteId);

      if (dateRange) {
        query = query
          .gte("analyzed_at", dateRange.start)
          .lte("analyzed_at", dateRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transform the data to match AnalysisResult format
      const resultsMap = new Map<string, AnalysisResult>();

      data?.forEach((result) => {
        const topicName = result.prompts?.topic_name || "Unknown Topic";
        const topicKeywords = result.prompts?.topic_keywords || [];

        if (!resultsMap.has(topicName)) {
          resultsMap.set(topicName, {
            topic_name: topicName,
            topic_keywords: topicKeywords,
            llm_results: [],
            total_mentions: 0,
            avg_rank: null,
            avg_confidence: null,
            avg_sentiment: null,
          });
        }

        const analysisResult = resultsMap.get(topicName)!;
        analysisResult.llm_results.push({
          llm_provider: result.llm_provider,
          is_mentioned: result.is_mentioned || false,
          rank_position: result.rank_position,
          confidence_score: result.confidence_score,
          sentiment_score: result.sentiment_score,
          summary_text: result.summary_text,
          response_text: result.response_text,
          analyzed_at: result.analyzed_at || new Date().toISOString(),
        });
      });

      return Array.from(resultsMap.values());
    });
  }

  /**
   * Get dashboard metrics for a website directly from database
   */
  private async getDashboardMetricsForWebsite(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<{ overallVisibilityScore: number }> {
    return this.executeOperation("getDashboardMetricsForWebsite", async () => {
      let query = supabase
        .schema("beekon_data")
        .from("llm_analysis_results")
        .select(
          "is_mentioned, rank_position, confidence_score, sentiment_score"
        )
        .eq("website_id", websiteId);

      if (dateRange) {
        query = query
          .gte("analyzed_at", dateRange.start)
          .lte("analyzed_at", dateRange.end);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        return { overallVisibilityScore: 0 };
      }

      const mentionedResults = data.filter((result) => result.is_mentioned);
      const overallVisibilityScore = Math.round(
        (mentionedResults.length / data.length) * 100
      );

      return { overallVisibilityScore };
    });
  }
}

export const competitorService = CompetitorService.getInstance();
