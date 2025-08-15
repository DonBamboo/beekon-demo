import { AnalysisResult, UIAnalysisResult } from "@/types/database";
import { isUIAnalysisResult, isAnalysisResult } from "@/utils/typeGuards";

export interface AnalysisInsights {
  strengths: string[];
  opportunities: string[];
  recommendations: string[];
  summary: string;
  generatedAt: string;
  sources: {
    summary: "prompt" | "calculated";
    strengths: "prompt" | "calculated" | "mixed";
    opportunities: "prompt" | "calculated" | "mixed";
    recommendations: "prompt" | "calculated" | "mixed";
  };
}

export class InsightService {
  /**
   * Generate insights from analysis results using prompt-specific data when available
   */
  static generateInsights(analysisResults: AnalysisResult[]): AnalysisInsights;

  /**
   * Generate insights from UI analysis results with prompt-specific data
   */
  static generateInsights(
    uiAnalysisResults: UIAnalysisResult[]
  ): AnalysisInsights;

  /**
   * Implementation that handles both types
   */
  static generateInsights(
    results: AnalysisResult[] | UIAnalysisResult[]
  ): AnalysisInsights {
    const insights: AnalysisInsights = {
      strengths: [],
      opportunities: [],
      recommendations: [],
      summary: "",
      generatedAt: new Date().toISOString(),
      sources: {
        summary: "calculated",
        strengths: "calculated",
        opportunities: "calculated",
        recommendations: "calculated",
      },
    };

    if (!results || results.length === 0) {
      return {
        ...insights,
        summary: "No analysis data available to generate insights.",
        recommendations: ["Run analysis to generate insights"],
      };
    }

    // Check if we have UIAnalysisResult with prompt-specific data
    const hasPromptData = results.some(
      (r) =>
        "reporting_text" in r &&
        (r.reporting_text ||
          r.recommendation_text ||
          r.prompt_strengths?.length ||
          r.prompt_opportunities?.length)
    );

    if (hasPromptData) {
      // Validate and filter to only UIAnalysisResult items
      const uiResults = results.filter(isUIAnalysisResult);
      return this.generatePromptBasedInsights(uiResults);
    }

    // Fall back to calculated insights for legacy AnalysisResult data
    const analysisResults = results.filter(isAnalysisResult);
    return this.generateCalculatedInsights(analysisResults);
  }

  /**
   * Generate insights prioritizing prompt-specific data
   */
  private static generatePromptBasedInsights(
    results: UIAnalysisResult[]
  ): AnalysisInsights {
    const insights: AnalysisInsights = {
      strengths: [],
      opportunities: [],
      recommendations: [],
      summary: "",
      generatedAt: new Date().toISOString(),
      sources: {
        summary: "prompt",
        strengths: "prompt",
        opportunities: "prompt",
        recommendations: "prompt",
      },
    };

    // Generate summary from reporting_text
    const reportingTexts = results
      .filter((r) => r.reporting_text)
      .map((r) => r.reporting_text);

    if (reportingTexts.length > 0) {
      insights.summary = reportingTexts.join(" ");
      insights.sources.summary = "prompt";
    } else {
      // Fall back to calculated summary
      insights.summary = this.generateCalculatedSummary(results);
      insights.sources.summary = "calculated";
    }

    // Generate strengths from prompt data
    const promptStrengths = results
      .flatMap((r) => r.prompt_strengths || [])
      .filter((s) => s && s.trim().length > 0);

    if (promptStrengths.length > 0) {
      insights.strengths = [...new Set(promptStrengths)]; // Remove duplicates
      insights.sources.strengths = "prompt";
    } else {
      // Fall back to calculated strengths
      insights.strengths = this.generateCalculatedStrengths(results);
      insights.sources.strengths = "calculated";
    }

    // Generate opportunities from prompt data
    const promptOpportunities = results
      .flatMap((r) => r.prompt_opportunities || [])
      .filter((o) => o && o.trim().length > 0);

    if (promptOpportunities.length > 0) {
      insights.opportunities = [...new Set(promptOpportunities)]; // Remove duplicates
      insights.sources.opportunities = "prompt";
    } else {
      // Fall back to calculated opportunities
      insights.opportunities = this.generateCalculatedOpportunities(results);
      insights.sources.opportunities = "calculated";
    }

    // Generate recommendations from prompt data
    const recommendationTexts = results
      .filter((r) => r.recommendation_text)
      .map((r) => r.recommendation_text);

    if (recommendationTexts.length > 0) {
      let parseRecommendationText = [""];
      if (recommendationTexts[0]?.includes("[")) {
        parseRecommendationText = JSON.parse(recommendationTexts[0]);
      }
      insights.recommendations = parseRecommendationText;
      insights.sources.recommendations = "prompt";
    } else {
      // Fall back to calculated recommendations
      insights.recommendations =
        this.generateCalculatedRecommendations(results);
      insights.sources.recommendations = "calculated";
    }

    return insights;
  }

  /**
   * Generate insights using calculated metrics (legacy method)
   */
  private static generateCalculatedInsights(
    results: AnalysisResult[]
  ): AnalysisInsights {
    const insights: AnalysisInsights = {
      strengths: [],
      opportunities: [],
      recommendations: [],
      summary: "",
      generatedAt: new Date().toISOString(),
      sources: {
        summary: "calculated",
        strengths: "calculated",
        opportunities: "calculated",
        recommendations: "calculated",
      },
    };

    // Calculate overall metrics
    const totalMentions = results.reduce(
      (sum, result) => sum + result.total_mentions,
      0
    );
    const avgRank = this.calculateAverageRank(results);
    const avgConfidence = this.calculateAverageConfidence(results);
    const avgSentiment = this.calculateAverageSentiment(results);
    const mentionRate = this.calculateMentionRate(results);

    // Generate strengths
    insights.strengths = this.generateStrengths(results, {
      totalMentions,
      avgRank,
      avgConfidence,
      avgSentiment,
      mentionRate,
    });

    // Generate opportunities
    insights.opportunities = this.generateOpportunities(results, {
      totalMentions,
      avgRank,
      avgConfidence,
      avgSentiment,
      mentionRate,
    });

    // Generate recommendations
    insights.recommendations = this.generateRecommendations(results, {
      totalMentions,
      avgRank,
      avgConfidence,
      avgSentiment,
      mentionRate,
    });

    // Generate summary
    insights.summary = this.generateSummary(results, {
      totalMentions,
      avgRank,
      avgConfidence,
      avgSentiment,
      mentionRate,
    });

    return insights;
  }

  private static calculateAverageRank(
    results: AnalysisResult[]
  ): number | null {
    const ranks = results
      .filter((r) => r.avg_rank !== null)
      .map((r) => r.avg_rank!);

    return ranks.length > 0
      ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      : null;
  }

  private static calculateAverageConfidence(
    results: AnalysisResult[]
  ): number | null {
    const confidences = results
      .filter((r) => r.avg_confidence !== null)
      .map((r) => r.avg_confidence!);

    return confidences.length > 0
      ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
      : null;
  }

  private static calculateAverageSentiment(
    results: AnalysisResult[]
  ): number | null {
    const sentiments = results
      .filter((r) => r.avg_sentiment !== null)
      .map((r) => r.avg_sentiment!);

    return sentiments.length > 0
      ? sentiments.reduce((sum, sent) => sum + sent, 0) / sentiments.length
      : null;
  }

  private static calculateMentionRate(results: AnalysisResult[]): number {
    const totalTopics = results.length;
    const mentionedTopics = results.filter((r) => r.total_mentions > 0).length;

    return totalTopics > 0 ? (mentionedTopics / totalTopics) * 100 : 0;
  }

  private static generateStrengths(
    results: AnalysisResult[],
    metrics: {
      totalMentions: number;
      avgRank: number | null;
      avgConfidence: number | null;
      avgSentiment: number | null;
      mentionRate: number;
    }
  ): string[] {
    const strengths: string[] = [];

    // High mention rate
    if (metrics.mentionRate >= 70) {
      strengths.push(
        `Strong visibility with ${metrics.mentionRate.toFixed(
          1
        )}% mention rate across analyzed topics`
      );
    }

    // High ranking performance
    if (metrics.avgRank !== null && metrics.avgRank <= 3) {
      strengths.push(
        `Excellent ranking performance with average position ${metrics.avgRank.toFixed(
          1
        )}`
      );
    }

    // High confidence scores
    if (metrics.avgConfidence !== null && metrics.avgConfidence >= 0.7) {
      strengths.push(
        `High confidence in mentions with ${(
          metrics.avgConfidence * 100
        ).toFixed(1)}% average confidence`
      );
    }

    // Positive sentiment
    if (metrics.avgSentiment !== null && metrics.avgSentiment >= 0.6) {
      strengths.push(
        `Positive sentiment in mentions with ${(
          metrics.avgSentiment * 100
        ).toFixed(1)}% average sentiment`
      );
    }

    // High performing topics
    const topTopics = results
      .filter((r) => r.total_mentions > 0)
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, 3);

    if (topTopics.length > 0) {
      strengths.push(
        `Strong performance in key topics: ${topTopics
          .map((t) => t.topic_name)
          .join(", ")}`
      );
    }

    // Consistent performance across LLM providers
    const llmProviders = new Set(
      results.flatMap((r) => r.llm_results.map((lr) => lr.llm_provider))
    );

    if (llmProviders.size >= 3) {
      strengths.push(
        `Consistent visibility across ${llmProviders.size} different LLM providers`
      );
    }

    return strengths.length > 0
      ? strengths
      : ["Analysis shows baseline performance metrics"];
  }

  private static generateOpportunities(
    results: AnalysisResult[],
    metrics: {
      totalMentions: number;
      avgRank: number | null;
      avgConfidence: number | null;
      avgSentiment: number | null;
      mentionRate: number;
    }
  ): string[] {
    const opportunities: string[] = [];

    // Low mention rate
    if (metrics.mentionRate < 30) {
      opportunities.push(
        `Increase visibility - only ${metrics.mentionRate.toFixed(
          1
        )}% of topics mention your brand`
      );
    }

    // Poor ranking performance
    if (metrics.avgRank !== null && metrics.avgRank > 5) {
      opportunities.push(
        `Improve ranking position - currently averaging position ${metrics.avgRank.toFixed(
          1
        )}`
      );
    }

    // Low confidence scores
    if (metrics.avgConfidence !== null && metrics.avgConfidence < 0.5) {
      opportunities.push(
        `Strengthen brand presence - confidence in mentions is ${(
          metrics.avgConfidence * 100
        ).toFixed(1)}%`
      );
    }

    // Negative sentiment
    if (metrics.avgSentiment !== null && metrics.avgSentiment < 0.4) {
      opportunities.push(
        `Address sentiment concerns - current sentiment is ${(
          metrics.avgSentiment * 100
        ).toFixed(1)}%`
      );
    }

    // Topics with no mentions
    const noMentionTopics = results.filter((r) => r.total_mentions === 0);
    if (noMentionTopics.length > 0) {
      opportunities.push(
        `Expand presence in ${noMentionTopics.length} topics with no current mentions`
      );
    }

    // Inconsistent performance across providers
    const llmProviders = new Set(
      results.flatMap((r) => r.llm_results.map((lr) => lr.llm_provider))
    );

    if (llmProviders.size < 3) {
      opportunities.push(
        `Test visibility across more LLM providers for comprehensive coverage`
      );
    }

    // Topics with low but existing mentions
    const lowMentionTopics = results.filter(
      (r) => r.total_mentions > 0 && r.total_mentions < 3
    );
    if (lowMentionTopics.length > 0) {
      opportunities.push(
        `Strengthen presence in ${lowMentionTopics.length} topics with limited mentions`
      );
    }

    return opportunities.length > 0
      ? opportunities
      : ["Continue monitoring for new opportunities"];
  }

  private static generateRecommendations(
    results: AnalysisResult[],
    metrics: {
      totalMentions: number;
      avgRank: number | null;
      avgConfidence: number | null;
      avgSentiment: number | null;
      mentionRate: number;
    }
  ): string[] {
    const recommendations: string[] = [];

    // Based on mention rate
    if (metrics.mentionRate < 50) {
      recommendations.push(
        "**Content Strategy**: Create more targeted content addressing the topics where you're not mentioned"
      );
      recommendations.push(
        "**SEO Optimization**: Improve search engine visibility for key topic keywords"
      );
    }

    // Based on ranking performance
    if (metrics.avgRank !== null && metrics.avgRank > 3) {
      recommendations.push(
        "**Authority Building**: Develop thought leadership content to improve ranking positions"
      );
      recommendations.push(
        "**Backlink Strategy**: Build high-quality backlinks to increase domain authority"
      );
    }

    // Based on confidence scores
    if (metrics.avgConfidence !== null && metrics.avgConfidence < 0.6) {
      recommendations.push(
        "**Brand Clarity**: Ensure consistent messaging across all content and platforms"
      );
      recommendations.push(
        "**Content Quality**: Improve content relevance and specificity to your brand"
      );
    }

    // Based on sentiment
    if (metrics.avgSentiment !== null && metrics.avgSentiment < 0.5) {
      recommendations.push(
        "**Reputation Management**: Address negative sentiment through improved customer experience"
      );
      recommendations.push(
        "**Community Engagement**: Increase positive brand interactions and testimonials"
      );
    }

    // Topic-specific recommendations
    const topPerformingTopics = results
      .filter((r) => r.total_mentions > 0)
      .sort((a, b) => b.total_mentions - a.total_mentions)
      .slice(0, 2);

    if (topPerformingTopics.length > 0) {
      recommendations.push(
        `**Leverage Success**: Double down on successful topics: ${topPerformingTopics
          .map((t) => t.topic_name)
          .join(", ")}`
      );
    }

    const underPerformingTopics = results
      .filter((r) => r.total_mentions === 0)
      .slice(0, 3);

    if (underPerformingTopics.length > 0) {
      recommendations.push(
        `**Gap Analysis**: Research why you're not mentioned in: ${underPerformingTopics
          .map((t) => t.topic_name)
          .join(", ")}`
      );
    }

    // General recommendations
    recommendations.push(
      "**Regular Monitoring**: Set up automated alerts for brand mentions and ranking changes"
    );
    recommendations.push(
      "**Competitive Analysis**: Monitor competitor performance in your key topics"
    );

    return recommendations;
  }

  private static generateSummary(
    results: AnalysisResult[],
    metrics: {
      totalMentions: number;
      avgRank: number | null;
      avgConfidence: number | null;
      avgSentiment: number | null;
      mentionRate: number;
    }
  ): string {
    const topicsAnalyzed = results.length;
    const topicsWithMentions = results.filter(
      (r) => r.total_mentions > 0
    ).length;

    let summary = `Analysis of ${topicsAnalyzed} topics reveals `;

    if (metrics.mentionRate >= 70) {
      summary += `strong brand visibility with ${topicsWithMentions} topics mentioning your brand (${metrics.mentionRate.toFixed(
        1
      )}% mention rate).`;
    } else if (metrics.mentionRate >= 40) {
      summary += `moderate brand visibility with ${topicsWithMentions} topics mentioning your brand (${metrics.mentionRate.toFixed(
        1
      )}% mention rate).`;
    } else {
      summary += `limited brand visibility with only ${topicsWithMentions} topics mentioning your brand (${metrics.mentionRate.toFixed(
        1
      )}% mention rate).`;
    }

    if (metrics.avgRank !== null) {
      summary += ` Average ranking position is ${metrics.avgRank.toFixed(1)}.`;
    }

    if (metrics.avgConfidence !== null) {
      summary += ` Mention confidence averages ${(
        metrics.avgConfidence * 100
      ).toFixed(1)}%.`;
    }

    if (metrics.avgSentiment !== null) {
      const sentimentLabel =
        metrics.avgSentiment >= 0.6
          ? "positive"
          : metrics.avgSentiment >= 0.4
          ? "neutral"
          : "negative";
      summary += ` Overall sentiment is ${sentimentLabel} (${(
        metrics.avgSentiment * 100
      ).toFixed(1)}%).`;
    }

    return summary;
  }

  /**
   * Helper methods for prompt-based insights fallback
   */
  private static generateCalculatedSummary(
    results: UIAnalysisResult[]
  ): string {
    const topicsAnalyzed = results.length;
    const topicsWithMentions = results.filter((r) =>
      r.llm_results.some((llm) => llm.is_mentioned)
    ).length;
    const mentionRate =
      topicsAnalyzed > 0 ? (topicsWithMentions / topicsAnalyzed) * 100 : 0;

    let summary = `Analysis of ${topicsAnalyzed} topics reveals `;

    if (mentionRate >= 70) {
      summary += `strong brand visibility with ${topicsWithMentions} topics mentioning your brand (${mentionRate.toFixed(
        1
      )}% mention rate).`;
    } else if (mentionRate >= 40) {
      summary += `moderate brand visibility with ${topicsWithMentions} topics mentioning your brand (${mentionRate.toFixed(
        1
      )}% mention rate).`;
    } else {
      summary += `limited brand visibility with only ${topicsWithMentions} topics mentioning your brand (${mentionRate.toFixed(
        1
      )}% mention rate).`;
    }

    return summary;
  }

  private static generateCalculatedStrengths(
    results: UIAnalysisResult[]
  ): string[] {
    const strengths: string[] = [];
    const mentionRate = this.calculateUIAnalysisResultMentionRate(results);

    if (mentionRate >= 70) {
      strengths.push(
        `Strong visibility with ${mentionRate.toFixed(
          1
        )}% mention rate across analyzed topics`
      );
    }

    const topTopics = results
      .filter((r) => r.llm_results.some((llm) => llm.is_mentioned))
      .slice(0, 3);

    if (topTopics.length > 0) {
      strengths.push(
        `Strong performance in key topics: ${topTopics
          .map((t) => t.topic)
          .join(", ")}`
      );
    }

    return strengths.length > 0
      ? strengths
      : ["Analysis shows baseline performance metrics"];
  }

  private static generateCalculatedOpportunities(
    results: UIAnalysisResult[]
  ): string[] {
    const opportunities: string[] = [];
    const mentionRate = this.calculateUIAnalysisResultMentionRate(results);

    if (mentionRate < 30) {
      opportunities.push(
        `Increase visibility - only ${mentionRate.toFixed(
          1
        )}% of topics mention your brand`
      );
    }

    const noMentionTopics = results.filter(
      (r) => !r.llm_results.some((llm) => llm.is_mentioned)
    );
    if (noMentionTopics.length > 0) {
      opportunities.push(
        `Expand presence in ${noMentionTopics.length} topics with no current mentions`
      );
    }

    return opportunities.length > 0
      ? opportunities
      : ["Continue monitoring for new opportunities"];
  }

  private static generateCalculatedRecommendations(
    results: UIAnalysisResult[]
  ): string[] {
    const recommendations: string[] = [];
    const mentionRate = this.calculateUIAnalysisResultMentionRate(results);

    if (mentionRate < 50) {
      recommendations.push(
        "**Content Strategy**: Create more targeted content addressing the topics where you're not mentioned"
      );
      recommendations.push(
        "**SEO Optimization**: Improve search engine visibility for key topic keywords"
      );
    }

    const topPerformingTopics = results
      .filter((r) => r.llm_results.some((llm) => llm.is_mentioned))
      .slice(0, 2);

    if (topPerformingTopics.length > 0) {
      recommendations.push(
        `**Leverage Success**: Double down on successful topics: ${topPerformingTopics
          .map((t) => t.topic)
          .join(", ")}`
      );
    }

    recommendations.push(
      "**Regular Monitoring**: Set up automated alerts for brand mentions and ranking changes"
    );
    recommendations.push(
      "**Competitive Analysis**: Monitor competitor performance in your key topics"
    );

    return recommendations;
  }

  private static calculateUIAnalysisResultMentionRate(
    results: UIAnalysisResult[]
  ): number {
    const totalTopics = results.length;
    const mentionedTopics = results.filter((r) =>
      r.llm_results.some((llm) => llm.is_mentioned)
    ).length;

    return totalTopics > 0 ? (mentionedTopics / totalTopics) * 100 : 0;
  }
}
