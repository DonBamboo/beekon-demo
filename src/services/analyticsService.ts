/**
 * Analytics Service - Provides stable analytics calculations independent of pagination
 * This service ensures analytics remain consistent regardless of lazy-loading or infinite scroll
 */

import { supabase } from "@/integrations/supabase/client";
import type { AnalysisFilters } from "@/hooks/useAnalysisQuery";

// Type definitions for database result structures
interface AnalysisResultData {
  llm_provider: string;
  is_mentioned: boolean;
  rank_position: number;
  confidence_score: number;
  sentiment_score: number;
  summary_text: string;
  response_text: string;
  analyzed_at: string;
  created_at: string;
  prompts?: {
    id: string;
    prompt_text: string;
    topic_id: string;
    created_at: string;
    topics?: {
      id: string;
      topic_name: string;
      website_id: string;
    };
  };
}

// Analytics interfaces for Analysis page
export interface AnalysisAnalytics {
  totalResults: number;
  totalMentioned: number;
  mentionRate: number;
  averageConfidence: number;
  averageRank: number;
  topPerformingTopics: Array<{
    topic: string;
    mentionRate: number;
    averageRank: number;
    resultCount: number;
  }>;
  llmPerformance: Array<{
    provider: string;
    mentionRate: number;
    averageRank: number;
    averageConfidence: number;
    totalResults: number;
  }>;
  topicDistribution: Array<{
    topic: string;
    count: number;
    percentage: number;
  }>;
  sentimentAnalysis: {
    positive: number;
    neutral: number;
    negative: number;
    averageScore: number;
  };
  timeSeriesData: Array<{
    date: string;
    mentionRate: number;
    averageRank: number;
    resultCount: number;
  }>;
}

// Analytics interfaces for Competitors page
export interface CompetitorAnalytics {
  totalCompetitors: number;
  activeCompetitors: number;
  marketShareData: Array<{
    name: string;
    value: number;
    marketShare: number;
    totalMentions: number;
  }>;
  shareOfVoiceData: Array<{
    name: string;
    shareOfVoice: number;
    totalMentions: number;
    totalAnalyses: number;
    avgRank: number;
  }>;
  competitiveGaps: Array<{
    topic: string;
    yourBrand: number;
    topCompetitor: string;
    topCompetitorScore: number;
    gap: number;
    opportunity: "high" | "medium" | "low";
  }>;
  insights: Array<{
    type: "opportunity" | "threat" | "strength";
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    competitors?: string[];
  }>;
}

// Dashboard analytics interface
export interface DashboardAnalytics {
  totalWebsites: number;
  totalAnalyses: number;
  averageVisibility: number;
  totalTopics: number;
  recentTrends: {
    visibilityChange: number;
    rankChange: number;
    mentionChange: number;
    period: string;
  };
  topPerformers: Array<{
    websiteId: string;
    websiteName: string;
    visibilityScore: number;
    change: number;
  }>;
  alertsAndInsights: Array<{
    type: "alert" | "insight" | "recommendation";
    severity: "high" | "medium" | "low";
    title: string;
    message: string;
    websiteId?: string;
    actionable?: boolean;
  }>;
}

class AnalyticsService {
  /**
   * Get comprehensive analytics for Analysis page - operates on complete dataset
   */
  async getAnalysisAnalytics(
    websiteId: string,
    filters?: AnalysisFilters
  ): Promise<AnalysisAnalytics> {
    // Build base query for complete dataset
    let query = supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .select(
        `
        *,
        prompts!inner (
          id,
          prompt_text,
          topic_id,
          created_at,
          topics!inner (
            id,
            topic_name,
            website_id
          )
        )
      `
      )
      .eq("website_id", websiteId);

    // Apply filters without pagination
    if (filters) {
      if (filters.dateRange && typeof filters.dateRange === "object") {
        query = query
          .gte("created_at", filters.dateRange.start)
          .lte("created_at", filters.dateRange.end);
      }

      if (filters.topic && filters.topic !== "all") {
        query = query.eq("prompts.topics.id", filters.topic);

        // Debug: Log topic filtering query
        if (process.env.NODE_ENV !== "production") {
          console.log('🔍 [DEBUG] Analytics query filtering by topic:', {
            topicId: filters.topic,
            queryField: 'prompts.topics.id',
            message: 'Filtering analytics by topic ID'
          });
        }
      }

      if (filters.llmProvider && filters.llmProvider !== "all") {
        query = query.eq("llm_provider", filters.llmProvider);
      }

      if (filters.searchQuery) {
        // Apply search query to relevant text fields
        query = query.or(`summary_text.ilike.%${filters.searchQuery}%, response_text.ilike.%${filters.searchQuery}%`);
      }
    }

    const { data: results, error } = await query;

    if (error) throw error;

    // Debug: Log query results
    if (process.env.NODE_ENV !== "production") {
      console.log('📊 [DEBUG] Analytics query results:', {
        resultCount: (results || []).length,
        hasTopicFilter: !!(filters?.topic && filters.topic !== "all"),
        topicFilter: filters?.topic,
        sampleResult: results?.[0] ? {
          topic: results[0].prompts?.topics?.topic_name,
          topicId: results[0].prompts?.topics?.id,
          isMentioned: results[0].is_mentioned
        } : null
      });
    }

    // Calculate analytics from complete dataset
    return this.calculateAnalysisAnalytics((results || []) as AnalysisResultData[]);
  }

  /**
   * Get analytics for Competitors page
   */
  async getCompetitorAnalytics(
    websiteId: string,
    _filters?: Record<string, unknown>
  ): Promise<CompetitorAnalytics> {
    // Get complete competitor data with analysis results
    const { data: competitorData, error } = await supabase
      .schema("beekon_data")
      .from("mv_competitor_performance")
      .select("*")
      .eq("website_id", websiteId);

    if (error) throw error;

    return this.calculateCompetitorAnalytics(competitorData || []);
  }

  /**
   * Get analytics for Dashboard page
   */
  async getDashboardAnalytics(
    websiteIds: string[],
    _filters?: Record<string, unknown>
  ): Promise<DashboardAnalytics> {
    // Get aggregated data across all websites
    const { data: dashboardData, error } = await supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .select("*")
      .in("website_id", websiteIds);

    if (error) throw error;

    return this.calculateDashboardAnalytics(dashboardData || []);
  }

  /**
   * Calculate analytics from analysis results data
   */
  private calculateAnalysisAnalytics(
    results: AnalysisResultData[]
  ): AnalysisAnalytics {
    if (results.length === 0) {
      return this.getEmptyAnalysisAnalytics();
    }

    const totalResults = results.length;
    const mentionedResults = results.filter((r) => r.is_mentioned).length;
    const mentionRate = (mentionedResults / totalResults) * 100;

    // Calculate confidence scores (only for mentioned results)
    const mentionedWithConfidence = results.filter(
      (r) => r.is_mentioned && r.confidence_score
    );
    const averageConfidence =
      mentionedWithConfidence.length > 0
        ? (mentionedWithConfidence.reduce(
            (sum, r) => sum + r.confidence_score,
            0
          ) /
            mentionedWithConfidence.length) *
          100
        : 0;

    // Calculate average rank (only for mentioned results with valid rank)
    const mentionedWithRank = results.filter(
      (r) => r.is_mentioned && r.rank_position && r.rank_position > 0
    );
    const averageRank =
      mentionedWithRank.length > 0
        ? mentionedWithRank.reduce((sum, r) => sum + r.rank_position, 0) /
          mentionedWithRank.length
        : 0;

    // Group by topic for topic-based analytics
    const topicGroups = results.reduce((acc, r) => {
      const topic = r.prompts?.topics?.topic_name || "Unknown";
      if (!acc[topic]) acc[topic] = [];
      acc[topic].push(r);
      return acc;
    }, {} as Record<string, AnalysisResultData[]>);

    const topPerformingTopics = Object.entries(topicGroups)
      .map(([topic, topicResults]: [string, AnalysisResultData[]]) => {
        const topicMentioned = topicResults.filter(
          (r: AnalysisResultData) => r.is_mentioned
        ).length;
        const topicMentionRate = (topicMentioned / topicResults.length) * 100;
        const rankedResults = topicResults.filter(
          (r: AnalysisResultData) => r.is_mentioned && r.rank_position > 0
        );
        const avgRank =
          rankedResults.length > 0
            ? rankedResults.reduce((sum: number, r: AnalysisResultData) => sum + r.rank_position, 0) /
              rankedResults.length
            : 0;

        return {
          topic,
          mentionRate: topicMentionRate,
          averageRank: avgRank,
          resultCount: topicResults.length,
        };
      })
      .sort((a, b) => b.mentionRate - a.mentionRate)
      .slice(0, 10);

    // Group by LLM provider
    const llmGroups = results.reduce((acc, r) => {
      const provider = r.llm_provider || 'unknown';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(r);
      return acc;
    }, {} as Record<string, AnalysisResultData[]>);

    const llmPerformance = Object.entries(llmGroups).map(
      ([provider, llmResults]: [string, AnalysisResultData[]]) => {
        const mentioned = llmResults.filter((r: AnalysisResultData) => r.is_mentioned).length;
        const mentionRate = (mentioned / llmResults.length) * 100;
        const withConfidence = llmResults.filter(
          (r: AnalysisResultData) => r.is_mentioned && r.confidence_score
        );
        const avgConfidence =
          withConfidence.length > 0
            ? (withConfidence.reduce((sum: number, r: AnalysisResultData) => sum + r.confidence_score, 0) /
                withConfidence.length) *
              100
            : 0;
        const withRank = llmResults.filter(
          (r: AnalysisResultData) => r.is_mentioned && r.rank_position > 0
        );
        const avgRank =
          withRank.length > 0
            ? withRank.reduce((sum: number, r: AnalysisResultData) => sum + r.rank_position, 0) /
              withRank.length
            : 0;

        return {
          provider,
          mentionRate,
          averageRank: avgRank,
          averageConfidence: avgConfidence,
          totalResults: llmResults.length,
        };
      }
    );

    // Topic distribution
    const topicDistribution = Object.entries(topicGroups).map(
      ([topic, topicResults]) => ({
        topic,
        count: topicResults.length,
        percentage: (topicResults.length / totalResults) * 100,
      })
    );

    // Sentiment analysis
    const withSentiment = results.filter((r) => r.sentiment_score !== null);
    const positive = withSentiment.filter((r) => r.sentiment_score > 0).length;
    const negative = withSentiment.filter((r) => r.sentiment_score < 0).length;
    const neutral = withSentiment.filter((r) => r.sentiment_score === 0).length;
    const averageScore =
      withSentiment.length > 0
        ? withSentiment.reduce((sum, r) => sum + r.sentiment_score, 0) /
          withSentiment.length
        : 0;

    return {
      totalResults,
      totalMentioned: mentionedResults,
      mentionRate,
      averageConfidence,
      averageRank,
      topPerformingTopics,
      llmPerformance,
      topicDistribution,
      sentimentAnalysis: {
        positive,
        neutral,
        negative,
        averageScore,
      },
      timeSeriesData: [], // Will be implemented based on requirements
    };
  }

  /**
   * Calculate competitor analytics from competitor data
   */
  private calculateCompetitorAnalytics(
    _data: unknown[]
  ): CompetitorAnalytics {
    // Implementation will depend on the competitor data structure
    return {
      totalCompetitors: 0,
      activeCompetitors: 0,
      marketShareData: [],
      shareOfVoiceData: [],
      competitiveGaps: [],
      insights: [],
    };
  }

  /**
   * Calculate dashboard analytics from dashboard data
   */
  private calculateDashboardAnalytics(
    _data: unknown[]
  ): DashboardAnalytics {
    // Implementation will depend on the dashboard data structure
    return {
      totalWebsites: 0,
      totalAnalyses: 0,
      averageVisibility: 0,
      totalTopics: 0,
      recentTrends: {
        visibilityChange: 0,
        rankChange: 0,
        mentionChange: 0,
        period: "7d",
      },
      topPerformers: [],
      alertsAndInsights: [],
    };
  }

  /**
   * Return empty analytics structure
   */
  private getEmptyAnalysisAnalytics(): AnalysisAnalytics {
    return {
      totalResults: 0,
      totalMentioned: 0,
      mentionRate: 0,
      averageConfidence: 0,
      averageRank: 0,
      topPerformingTopics: [],
      llmPerformance: [],
      topicDistribution: [],
      sentimentAnalysis: {
        positive: 0,
        neutral: 0,
        negative: 0,
        averageScore: 0,
      },
      timeSeriesData: [],
    };
  }
}

export const analyticsService = new AnalyticsService();
