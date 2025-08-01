import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import BaseService from "./baseService";

// Type definitions for competitor analysis
type CompetitorAnalysisResult =
  Database["beekon_data"]["Tables"]["competitor_analysis_results"]["Row"];
type CompetitorAnalysisInsert =
  Database["beekon_data"]["Tables"]["competitor_analysis_results"]["Insert"];

export interface CompetitorMentionAnalysis {
  isMentioned: boolean;
  rankPosition: number | null;
  sentimentScore: number | null;
  confidenceScore: number | null;
  summaryText: string;
}

export interface CompetitorShareOfVoice {
  competitorId: string;
  competitorName: string;
  competitorDomain: string;
  totalAnalyses: number;
  totalMentions: number;
  shareOfVoice: number;
  avgRankPosition: number | null;
  avgSentimentScore: number | null;
  avgConfidenceScore: number | null;
}

export interface CompetitiveGapAnalysis {
  topicId: string;
  topicName: string;
  yourBrandScore: number;
  competitorData: Array<{
    competitorId: string;
    competitor_name: string;
    competitorDomain: string;
    score: number;
    avgRankPosition: number | null;
    totalMentions: number;
  }>;
}

export interface CompetitorInsight {
  type: "opportunity" | "threat" | "neutral";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  topicId?: string;
  competitorId?: string;
  recommendations: string[];
}

export interface CompetitiveTrend {
  trendType:
    | "share_growth"
    | "share_decline"
    | "ranking_improvement"
    | "ranking_decline"
    | "new_competitor"
    | "sentiment_change";
  competitorId: string;
  competitorName: string;
  timeframe: string;
  changeValue: number;
  changePercent: number;
  significance: "high" | "medium" | "low";
  description: string;
}

export interface CompetitiveIntelligence {
  marketPosition: {
    yourRank: number;
    totalCompetitors: number;
    marketSharePercent: number;
    positionChange: number;
  };
  keyTrends: CompetitiveTrend[];
  emergingThreats: CompetitorInsight[];
  strategicOpportunities: CompetitorInsight[];
  actionPriorities: Array<{
    priority: number;
    action: string;
    category: "content" | "seo" | "competitive" | "strategic";
    expectedImpact: "high" | "medium" | "low";
    timeToImplement: "short" | "medium" | "long";
  }>;
}

export class CompetitorAnalysisService extends BaseService {
  private static instance: CompetitorAnalysisService;
  protected serviceName = "competitorAnalysis" as const;

  public static getInstance(): CompetitorAnalysisService {
    if (!CompetitorAnalysisService.instance) {
      CompetitorAnalysisService.instance = new CompetitorAnalysisService();
    }
    return CompetitorAnalysisService.instance;
  }

  /**
   * Analyze competitor mentions in LLM response
   */
  async analyzeCompetitorMentions(
    websiteId: string,
    competitorId: string,
    promptId: string,
    llmProvider: string,
    responseText: string
  ): Promise<CompetitorMentionAnalysis> {
    try {
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("analyze_competitor_mentions", {
          p_website_id: websiteId,
          p_competitor_id: competitorId,
          p_prompt_id: promptId,
          p_llm_provider: llmProvider,
          p_response_text: responseText,
        });

      if (error) throw error;

      const result = data[0];
      return {
        isMentioned: result!.is_mentioned,
        rankPosition: result!.rank_position,
        sentimentScore: result!.sentiment_score,
        confidenceScore: result!.confidence_score,
        summaryText: result!.summary_text,
      };
    } catch (error) {
      console.error("Error analyzing competitor mentions:", error);
      throw error;
    }
  }

  /**
   * Store competitor analysis result
   */
  async storeCompetitorAnalysis(
    competitorId: string,
    promptId: string,
    llmProvider: string,
    analysisResult: CompetitorMentionAnalysis,
    responseText: string
  ): Promise<CompetitorAnalysisResult> {
    try {
      const analysisData: CompetitorAnalysisInsert = {
        competitor_id: competitorId,
        prompt_id: promptId,
        llm_provider: llmProvider,
        is_mentioned: analysisResult.isMentioned,
        rank_position: analysisResult.rankPosition,
        sentiment_score: analysisResult.sentimentScore,
        confidence_score: analysisResult.confidenceScore,
        response_text: responseText,
        summary_text: analysisResult.summaryText,
      };

      const { data, error } = await supabase
        .schema("beekon_data")
        .from("competitor_analysis_results")
        .upsert(analysisData, {
          onConflict: "competitor_id,prompt_id,llm_provider",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error storing competitor analysis:", error);
      throw error;
    }
  }

  /**
   * Get competitor share of voice data
   */
  async getCompetitorShareOfVoice(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorShareOfVoice[]> {
    try {
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_competitor_share_of_voice", {
          p_website_id: websiteId,
          p_date_start:
            dateRange?.start ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          p_date_end: dateRange?.end || new Date().toISOString(),
        });

      if (error) throw error;

      return (data || []).map((row) => ({
        competitorId: row.competitor_id,
        competitorName: row.competitor_name || row.competitor_domain,
        competitorDomain: row.competitor_domain,
        totalAnalyses: row.total_analyses,
        totalMentions: row.total_voice_mentions,
        shareOfVoice: Number(row.share_of_voice || 0),
        avgRankPosition: row.avg_rank_position
          ? Number(row.avg_rank_position)
          : null,
        avgSentimentScore: row.avg_sentiment_score
          ? Number(row.avg_sentiment_score)
          : null,
        avgConfidenceScore: row.avg_confidence_score
          ? Number(row.avg_confidence_score)
          : null,
      }));
    } catch (error) {
      console.error("Error getting competitor share of voice:", error);
      throw error;
    }
  }

  /**
   * Get competitive gap analysis
   */
  async getCompetitiveGapAnalysis(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitiveGapAnalysis[]> {
    try {
      const { data, error } = await supabase
        .schema("beekon_data")
        .rpc("get_competitive_gap_analysis", {
          p_website_id: websiteId,
          p_date_start:
            dateRange?.start ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          p_date_end: dateRange?.end || new Date().toISOString(),
        });

      if (error) throw error;

      return (data || []).map((row) => ({
        topicId: row.topic_id,
        topicName: row.topic_name,
        yourBrandScore: Number(row.your_brand_score || 0),
        competitorData: Array.isArray(row.competitor_data)
          ? row.competitor_data
          : [],
      }));
    } catch (error) {
      console.error("Error getting competitive gap analysis:", error);
      throw error;
    }
  }

  /**
   * Batch analyze competitors for multiple prompts
   */
  async batchAnalyzeCompetitors(
    websiteId: string,
    competitorIds: string[],
    promptIds: string[],
    llmProvider: string,
    responseTextMap: Map<string, string> // Map of promptId -> responseText
  ): Promise<CompetitorAnalysisResult[]> {
    try {
      const results: CompetitorAnalysisResult[] = [];

      for (const competitorId of competitorIds) {
        for (const promptId of promptIds) {
          const responseText = responseTextMap.get(promptId);
          if (!responseText) continue;

          // Analyze competitor mentions
          const analysis = await this.analyzeCompetitorMentions(
            websiteId,
            competitorId,
            promptId,
            llmProvider,
            responseText
          );

          // Store the analysis result
          const result = await this.storeCompetitorAnalysis(
            competitorId,
            promptId,
            llmProvider,
            analysis,
            responseText
          );

          results.push(result);
        }
      }

      return results;
    } catch (error) {
      console.error("Error in batch competitor analysis:", error);
      throw error;
    }
  }

  /**
   * Get competitor insights and recommendations
   */
  async getCompetitorInsights(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorInsight[]> {
    try {
      const [shareOfVoice, gapAnalysis] = await Promise.all([
        this.getCompetitorShareOfVoice(websiteId, dateRange),
        this.getCompetitiveGapAnalysis(websiteId, dateRange),
      ]);

      const insights: CompetitorInsight[] = [];

      // Analyze share of voice for threats and opportunities
      const totalMarketVoice = shareOfVoice.reduce(
        (sum, comp) => sum + comp.shareOfVoice,
        0
      );
      const dominantCompetitor = shareOfVoice.find(
        (comp) => comp.shareOfVoice > 40
      );

      if (dominantCompetitor) {
        insights.push({
          type: "threat",
          title: "Market Leader Identified",
          description: `${
            dominantCompetitor.competitorName
          } dominates with ${dominantCompetitor.shareOfVoice.toFixed(
            1
          )}% share of voice`,
          impact: "high",
          competitorId: dominantCompetitor.competitorId,
          recommendations: [
            "Analyze their content strategy and positioning",
            "Identify gaps in their coverage",
            "Focus on topics where they have lower rankings",
          ],
        });
      }

      // Analyze competitive gaps for opportunities
      const opportunityTopics = gapAnalysis.filter((gap) => {
        const avgCompetitorScore =
          gap.competitorData.reduce((sum, comp) => sum + comp.score, 0) /
          gap.competitorData.length;
        return (
          gap.yourBrandScore < avgCompetitorScore && avgCompetitorScore > 0
        );
      });

      opportunityTopics.forEach((topic) => {
        const topCompetitor = topic.competitorData.reduce((prev, current) =>
          prev.score > current.score ? prev : current
        );

        insights.push({
          type: "opportunity",
          title: `Improvement Opportunity: ${topic.topicName}`,
          description: `Your brand scores ${topic.yourBrandScore.toFixed(
            1
          )}% vs ${
            topCompetitor.competitor_name
          }'s ${topCompetitor.score.toFixed(1)}%`,
          impact: topic.yourBrandScore < 20 ? "high" : "medium",
          topicId: topic.topicId,
          competitorId: topCompetitor.competitorId,
          recommendations: [
            "Create more comprehensive content on this topic",
            "Optimize for better ranking positions",
            "Study competitor approaches and improve upon them",
          ],
        });
      });

      // Analyze ranking performance
      const poorRankingCompetitors = shareOfVoice.filter(
        (comp) =>
          comp.avgRankPosition &&
          comp.avgRankPosition > 3 &&
          comp.totalMentions > 0
      );

      poorRankingCompetitors.forEach((competitor) => {
        insights.push({
          type: "opportunity",
          title: `Ranking Opportunity vs ${competitor.competitorName}`,
          description: `${
            competitor.competitorName
          } averages position ${competitor.avgRankPosition?.toFixed(
            1
          )} - opportunity to outrank`,
          impact: "medium",
          competitorId: competitor.competitorId,
          recommendations: [
            "Focus on topics where they rank lower",
            "Improve content quality and relevance",
            "Optimize for better search positioning",
          ],
        });
      });

      return insights.sort((a, b) => {
        const impactOrder = { high: 3, medium: 2, low: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      });
    } catch (error) {
      console.error("Error getting competitor insights:", error);
      throw error;
    }
  }

  /**
   * Get competitor analysis results for a specific period
   */
  async getCompetitorAnalysisResults(
    websiteId: string,
    competitorId?: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitorAnalysisResult[]> {
    try {
      let query = supabase
        .schema("beekon_data")
        .from("competitor_analysis_results")
        .select(
          `
          *,
          competitors!inner(
            id,
            competitor_name,
            competitor_domain,
            website_id
          ),
          prompts!inner(
            id,
            prompt_text,
            topic_id,
            topics!inner(
              id,
              topic_name
            )
          )
        `
        )
        .eq("competitors.website_id", websiteId)
        .order("analyzed_at", { ascending: false });

      if (competitorId) {
        query = query.eq("competitor_id", competitorId);
      }

      if (dateRange) {
        query = query
          .gte("analyzed_at", dateRange.start)
          .lte("analyzed_at", dateRange.end);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error getting competitor analysis results:", error);
      throw error;
    }
  }

  /**
   * Refresh competitor analysis materialized views
   */
  async refreshCompetitorAnalysisViews(): Promise<void> {
    try {
      const { error } = await supabase
        .schema("beekon_data")
        .rpc("refresh_competitor_analysis_views");

      if (error) throw error;
    } catch (error) {
      console.error("Error refreshing competitor analysis views:", error);
      throw error;
    }
  }

  /**
   * Competitive Intelligence Engine - Advanced analysis and recommendations
   */
  async generateCompetitiveIntelligence(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<CompetitiveIntelligence> {
    try {
      const [shareOfVoice, gapAnalysis, historicalData] = await Promise.all([
        this.getCompetitorShareOfVoice(websiteId, dateRange),
        this.getCompetitiveGapAnalysis(websiteId, dateRange),
        this.getHistoricalTrends(websiteId, dateRange),
      ]);

      // Calculate market position
      const totalShareOfVoice = shareOfVoice.reduce(
        (sum, comp) => sum + comp.shareOfVoice,
        0
      );
      const yourBrandShare =
        shareOfVoice.find((comp) => comp.competitorName === "Your Brand")
          ?.shareOfVoice || 0;
      const competitorsByShare = shareOfVoice
        .filter((comp) => comp.competitorName !== "Your Brand")
        .sort((a, b) => b.shareOfVoice - a.shareOfVoice);

      const yourRank =
        competitorsByShare.findIndex(
          (comp) => comp.shareOfVoice < yourBrandShare
        ) + 1;
      const marketPosition = {
        yourRank: yourRank || competitorsByShare.length + 1,
        totalCompetitors: competitorsByShare.length,
        marketSharePercent: yourBrandShare,
        positionChange: this.calculatePositionChange(
          historicalData,
          yourBrandShare
        ),
      };

      // Generate competitive trends
      const keyTrends = this.analyzeCompetitiveTrends(
        shareOfVoice,
        historicalData
      );

      // Generate strategic insights
      const allInsights = await this.getCompetitorInsights(
        websiteId,
        dateRange
      );
      const emergingThreats = allInsights
        .filter(
          (insight) => insight.type === "threat" && insight.impact === "high"
        )
        .slice(0, 3);

      const strategicOpportunities = allInsights
        .filter((insight) => insight.type === "opportunity")
        .slice(0, 5);

      // Generate action priorities
      const actionPriorities = this.generateActionPriorities(
        marketPosition,
        keyTrends,
        emergingThreats,
        strategicOpportunities,
        gapAnalysis
      );

      return {
        marketPosition,
        keyTrends,
        emergingThreats,
        strategicOpportunities,
        actionPriorities,
      };
    } catch (error) {
      console.error("Error generating competitive intelligence:", error);
      throw error;
    }
  }

  /**
   * Get historical trends for competitive analysis
   */
  private async getHistoricalTrends(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<unknown[]> {
    try {
      // Get historical share of voice data for trend analysis
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const sixtyDaysAgo = new Date(
        Date.now() - 60 * 24 * 60 * 60 * 1000
      ).toISOString();

      const [currentPeriod, previousPeriod] = await Promise.all([
        this.getCompetitorShareOfVoice(websiteId, {
          start: thirtyDaysAgo,
          end: new Date().toISOString(),
        }),
        this.getCompetitorShareOfVoice(websiteId, {
          start: sixtyDaysAgo,
          end: thirtyDaysAgo,
        }),
      ]);

      return [currentPeriod, previousPeriod];
    } catch (error) {
      console.error("Error getting historical trends:", error);
      return [];
    }
  }

  /**
   * Calculate position change based on historical data
   */
  private calculatePositionChange(
    historicalData: unknown[],
    currentShare: number
  ): number {
    if (!historicalData || historicalData.length < 2) return 0;

    const [_, previous] = historicalData;
    const previousYourBrand = (
      previous as Array<{ competitorName: string; shareOfVoice: number }>
    ).find((comp) => comp.competitorName === "Your Brand");

    if (!previousYourBrand) return 0;

    return currentShare - previousYourBrand.shareOfVoice;
  }

  /**
   * Analyze competitive trends from historical data
   */
  private analyzeCompetitiveTrends(
    currentData: CompetitorShareOfVoice[],
    historicalData: any[]
  ): CompetitiveTrend[] {
    const trends: CompetitiveTrend[] = [];

    if (!historicalData || historicalData.length < 2) return trends;

    const [current, previous] = historicalData;

    currentData.forEach((competitor) => {
      const previousData = previous.find(
        (comp: any) => comp.competitorId === competitor.competitorId
      );

      if (previousData) {
        const shareChange = competitor.shareOfVoice - previousData.shareOfVoice;
        const shareChangePercent =
          previousData.shareOfVoice > 0
            ? (shareChange / previousData.shareOfVoice) * 100
            : 0;

        if (Math.abs(shareChangePercent) > 10) {
          // Significant change threshold
          trends.push({
            trendType: shareChange > 0 ? "share_growth" : "share_decline",
            competitorId: competitor.competitorId,
            competitorName: competitor.competitorName,
            timeframe: "30 days",
            changeValue: shareChange,
            changePercent: shareChangePercent,
            significance:
              Math.abs(shareChangePercent) > 25
                ? "high"
                : Math.abs(shareChangePercent) > 15
                ? "medium"
                : "low",
            description: `${competitor.competitorName} ${
              shareChange > 0 ? "gained" : "lost"
            } ${Math.abs(shareChangePercent).toFixed(1)}% share of voice`,
          });
        }

        // Analyze ranking changes
        if (competitor.avgRankPosition && previousData.avgRankPosition) {
          const rankingChange =
            previousData.avgRankPosition - competitor.avgRankPosition;

          if (Math.abs(rankingChange) > 0.5) {
            trends.push({
              trendType:
                rankingChange > 0 ? "ranking_improvement" : "ranking_decline",
              competitorId: competitor.competitorId,
              competitorName: competitor.competitorName,
              timeframe: "30 days",
              changeValue: rankingChange,
              changePercent:
                (rankingChange / previousData.avgRankPosition) * 100,
              significance: Math.abs(rankingChange) > 1 ? "high" : "medium",
              description: `${competitor.competitorName} ${
                rankingChange > 0 ? "improved" : "declined"
              } average ranking by ${Math.abs(rankingChange).toFixed(
                1
              )} positions`,
            });
          }
        }
      } else {
        // New competitor detected
        trends.push({
          trendType: "new_competitor",
          competitorId: competitor.competitorId,
          competitorName: competitor.competitorName,
          timeframe: "30 days",
          changeValue: competitor.shareOfVoice,
          changePercent: 100,
          significance: competitor.shareOfVoice > 5 ? "high" : "medium",
          description: `New competitor ${
            competitor.competitorName
          } entered with ${competitor.shareOfVoice.toFixed(1)}% share of voice`,
        });
      }
    });

    return trends.sort((a, b) => {
      const significanceOrder = { high: 3, medium: 2, low: 1 };
      return (
        significanceOrder[b.significance] - significanceOrder[a.significance]
      );
    });
  }

  /**
   * Generate prioritized action recommendations
   */
  private generateActionPriorities(
    marketPosition: any,
    trends: CompetitiveTrend[],
    threats: CompetitorInsight[],
    opportunities: CompetitorInsight[],
    gapAnalysis: CompetitiveGapAnalysis[]
  ): Array<{
    priority: number;
    action: string;
    category: "content" | "seo" | "competitive" | "strategic";
    expectedImpact: "high" | "medium" | "low";
    timeToImplement: "short" | "medium" | "long";
  }> {
    const actions: any[] = [];
    let priority = 1;

    // High-priority actions based on market position
    if (marketPosition.yourRank > 3) {
      actions.push({
        priority: priority++,
        action:
          "Focus on improving overall market position through content optimization",
        category: "strategic",
        expectedImpact: "high",
        timeToImplement: "long",
      });
    }

    // Actions based on emerging threats
    threats.forEach((threat) => {
      actions.push({
        priority: priority++,
        action: `Counter competitive threat: ${threat.title}`,
        category: "competitive",
        expectedImpact: threat.impact,
        timeToImplement: "medium",
      });
    });

    // Actions based on opportunities
    opportunities.slice(0, 3).forEach((opportunity) => {
      actions.push({
        priority: priority++,
        action: `Capitalize on opportunity: ${opportunity.title}`,
        category: opportunity.topicId ? "content" : "seo",
        expectedImpact: opportunity.impact,
        timeToImplement: "short",
      });
    });

    // Actions based on significant trends
    const significantTrends = trends.filter(
      (trend) => trend.significance === "high"
    );
    significantTrends.forEach((trend) => {
      if (
        trend.trendType === "share_growth" &&
        trend.competitorName !== "Your Brand"
      ) {
        actions.push({
          priority: priority++,
          action: `Analyze and counter ${trend.competitorName}'s growth strategy`,
          category: "competitive",
          expectedImpact: "high",
          timeToImplement: "medium",
        });
      }
    });

    // Actions based on competitive gaps
    const criticalGaps = gapAnalysis.filter((gap) => gap.yourBrandScore < 30);
    criticalGaps.slice(0, 2).forEach((gap) => {
      actions.push({
        priority: priority++,
        action: `Improve content coverage for ${gap.topicName}`,
        category: "content",
        expectedImpact: "medium",
        timeToImplement: "short",
      });
    });

    // SEO optimization actions
    actions.push({
      priority: priority++,
      action:
        "Implement advanced SEO optimization based on competitor analysis",
      category: "seo",
      expectedImpact: "medium",
      timeToImplement: "medium",
    });

    return actions.slice(0, 8); // Return top 8 priorities
  }

  /**
   * Generate automated competitive report
   */
  async generateCompetitiveReport(
    websiteId: string,
    dateRange?: { start: string; end: string }
  ): Promise<{
    executiveSummary: string;
    keyFindings: string[];
    intelligence: CompetitiveIntelligence;
    recommendedActions: string[];
  }> {
    try {
      const intelligence = await this.generateCompetitiveIntelligence(
        websiteId,
        dateRange
      );

      const executiveSummary = this.generateExecutiveSummary(intelligence);
      const keyFindings = this.extractKeyFindings(intelligence);
      const recommendedActions = intelligence.actionPriorities
        .slice(0, 5)
        .map((action) => action.action);

      return {
        executiveSummary,
        keyFindings,
        intelligence,
        recommendedActions,
      };
    } catch (error) {
      console.error("Error generating competitive report:", error);
      throw error;
    }
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(
    intelligence: CompetitiveIntelligence
  ): string {
    const { marketPosition, keyTrends, emergingThreats } = intelligence;

    let summary = `Your brand currently ranks #${
      marketPosition.yourRank
    } out of ${
      marketPosition.totalCompetitors
    } competitors with ${marketPosition.marketSharePercent.toFixed(
      1
    )}% market share. `;

    if (marketPosition.positionChange > 0) {
      summary += `You've gained ${marketPosition.positionChange.toFixed(
        1
      )} percentage points in share of voice. `;
    } else if (marketPosition.positionChange < 0) {
      summary += `You've lost ${Math.abs(marketPosition.positionChange).toFixed(
        1
      )} percentage points in share of voice. `;
    }

    if (keyTrends.length > 0) {
      const highTrends = keyTrends.filter((t) => t.significance === "high");
      if (highTrends.length > 0) {
        summary += `Key market movements include ${highTrends[0].description}. `;
      }
    }

    if (emergingThreats.length > 0) {
      summary += `Primary competitive concern: ${emergingThreats[0].title}.`;
    }

    return summary;
  }

  /**
   * Extract key findings from intelligence data
   */
  private extractKeyFindings(intelligence: CompetitiveIntelligence): string[] {
    const findings: string[] = [];

    // Market position findings
    if (intelligence.marketPosition.yourRank <= 3) {
      findings.push("Strong market position in top 3 competitors");
    } else {
      findings.push("Opportunity to improve market ranking and share of voice");
    }

    // Trend findings
    const growthTrends = intelligence.keyTrends.filter(
      (t) => t.trendType === "share_growth" && t.significance === "high"
    );
    if (growthTrends.length > 0) {
      findings.push(
        `${growthTrends.length} competitor(s) showing significant growth`
      );
    }

    // Threat findings
    if (intelligence.emergingThreats.length > 0) {
      findings.push(
        `${intelligence.emergingThreats.length} high-impact competitive threats identified`
      );
    }

    // Opportunity findings
    if (intelligence.strategicOpportunities.length > 0) {
      findings.push(
        `${intelligence.strategicOpportunities.length} strategic opportunities for improvement`
      );
    }

    return findings;
  }
}

// Export singleton instance
export const competitorAnalysisService =
  CompetitorAnalysisService.getInstance();
export default competitorAnalysisService;
