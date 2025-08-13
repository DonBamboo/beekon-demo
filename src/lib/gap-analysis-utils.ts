import { type CompetitiveGapAnalysis } from "@/services/competitorService";

// Configuration for gap classification thresholds
export const GAP_THRESHOLDS = {
  advantage: { min: 15 }, // Significant advantage threshold for meaningful gaps
  opportunity: { max: -15 }, // Significant opportunity threshold for actionable gaps
  priority: {
    high: 25, // High priority for substantial gaps requiring immediate attention
    medium: 15, // Medium priority for notable gaps worth addressing
  }
} as const;

// Types for gap analysis results
export interface GapClassification {
  topicId: string;
  topicName: string;
  yourBrandScore: number;
  competitorData: CompetitiveGapAnalysis['competitorData'];
  avgCompetitor: number;
  gapSize: number;
  gapType: 'advantage' | 'opportunity' | 'competitive';
  priority: 'high' | 'medium' | 'low';
}

export interface OpportunityMatrixData {
  topic: string;
  x: number; // Market competitiveness (average competitor score)
  y: number; // Your performance
  size: number; // Total market mentions
}

/**
 * Calculate average competitor score for a topic
 */
export const calculateAvgCompetitorScore = (competitorData: CompetitiveGapAnalysis['competitorData']): number => {
  if (competitorData.length === 0) return 0;
  return competitorData.reduce((sum, comp) => sum + comp.score, 0) / competitorData.length;
};

/**
 * Calculate gap between your brand and average competitor
 */
export const calculateGapSize = (yourBrandScore: number, avgCompetitorScore: number): number => {
  return yourBrandScore - avgCompetitorScore;
};

/**
 * Classify gap type based on size and context
 */
export const classifyGapType = (gapSize: number, yourBrandScore: number): 'advantage' | 'opportunity' | 'competitive' => {
  // Consider both gap size and absolute performance
  const isLowPerformance = yourBrandScore < 30; // Low absolute performance needs attention
  
  if (gapSize > GAP_THRESHOLDS.advantage.min) {
    return 'advantage';
  }
  
  if (gapSize < GAP_THRESHOLDS.opportunity.max || (gapSize < -5 && isLowPerformance)) {
    return 'opportunity'; // Lower threshold if overall performance is poor
  }
  
  return 'competitive';
};

/**
 * Classify gap priority based on multiple factors
 */
export const classifyGapPriority = (
  gapSize: number, 
  yourBrandScore: number, 
  avgCompetitorScore: number
): 'high' | 'medium' | 'low' => {
  const absGapSize = Math.abs(gapSize);
  const isLowPerformance = yourBrandScore < 30;
  const isHighCompetitiveArea = avgCompetitorScore > 60; // Competitive topics are higher priority
  
  // High priority conditions
  if (absGapSize > GAP_THRESHOLDS.priority.high || 
      (absGapSize > 10 && isLowPerformance) ||
      (absGapSize > 15 && isHighCompetitiveArea)) {
    return 'high';
  }
  
  // Medium priority conditions  
  if (absGapSize > GAP_THRESHOLDS.priority.medium ||
      (absGapSize > 8 && (isLowPerformance || isHighCompetitiveArea))) {
    return 'medium';
  }
  
  return 'low';
};

/**
 * Process gap analysis data with classifications and validation
 */
export const processGapAnalysis = (gapAnalysis: CompetitiveGapAnalysis[]): GapClassification[] => {
  // Validate input data
  const validatedGapAnalysis = gapAnalysis.map(gap => ({
    ...gap,
    yourBrandScore: Math.max(0, Math.min(100, isNaN(gap.yourBrandScore) ? 0 : gap.yourBrandScore)),
    competitorData: gap.competitorData.map(comp => ({
      ...comp,
      score: Math.max(0, Math.min(100, isNaN(comp.score) ? 0 : comp.score)),
      totalMentions: Math.max(0, isNaN(comp.totalMentions) ? 0 : comp.totalMentions)
    }))
  }));

  // Process with enhanced classification
  return validatedGapAnalysis.map(gap => {
    const avgCompetitor = calculateAvgCompetitorScore(gap.competitorData);
    const gapSize = calculateGapSize(gap.yourBrandScore, avgCompetitor);
    
    return {
      topicId: gap.topicId,
      topicName: gap.topicName,
      yourBrandScore: gap.yourBrandScore,
      competitorData: gap.competitorData,
      avgCompetitor,
      gapSize,
      gapType: classifyGapType(gapSize, gap.yourBrandScore),
      priority: classifyGapPriority(gapSize, gap.yourBrandScore, avgCompetitor),
    };
  });
};

/**
 * Generate opportunity matrix data for scatter plot visualization
 */
export const generateOpportunityMatrix = (gapAnalysis: CompetitiveGapAnalysis[]): OpportunityMatrixData[] => {
  return gapAnalysis.map(gap => ({
    topic: gap.topicName,
    x: calculateAvgCompetitorScore(gap.competitorData), // Market competitiveness (average)
    y: gap.yourBrandScore, // Your performance
    size: gap.competitorData.reduce((sum, comp) => sum + comp.totalMentions, 0), // Market size
  }));
};

/**
 * Generate summary statistics from gap analysis
 */
export const generateGapSummary = (gapClassification: GapClassification[]) => {
  const advantages = gapClassification.filter(gap => gap.gapType === 'advantage');
  const opportunities = gapClassification.filter(gap => gap.gapType === 'opportunity');
  const highPriorityGaps = gapClassification.filter(gap => gap.priority === 'high');
  
  const biggestOpportunity = opportunities.reduce((prev, current) => 
    prev && Math.abs(prev.gapSize) > Math.abs(current.gapSize) ? prev : current, 
    opportunities[0]
  );
  
  const strongestAdvantage = advantages.reduce((prev, current) => 
    prev && prev.gapSize > current.gapSize ? prev : current, 
    advantages[0]
  );

  return {
    totalTopics: gapClassification.length,
    opportunities: opportunities.length,
    advantages: advantages.length,
    highPriorityGaps: highPriorityGaps.length,
    biggestOpportunity,
    strongestAdvantage,
  };
};