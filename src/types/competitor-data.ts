/**
 * Type definitions for competitor data structures
 * This file provides proper typing for competitor-related data to eliminate 'any' type usage
 */

// Competitor data from share of voice API (flexible interface covering all possible properties)
export interface ShareOfVoiceCompetitor {
  competitorId?: string;
  id?: string;
  competitorName?: string;
  competitor_name?: string;
  name?: string;
  competitorDomain?: string;
  competitor_domain?: string;
  shareOfVoice: number;
  avgRankPosition?: number | null;
  avg_rank?: number | null;
  totalMentions?: number | null;
  total_mentions?: number | null;
  avgSentimentScore?: number | null;
  sentiment_score?: number | null;
  totalAnalyses?: number | null;
  total_analyses?: number | null;
  lastAnalyzedAt?: string;
  analysis_completed_at?: string;
  is_active?: boolean;
  analysisStatus?: string;
  analysis_status?: string;
  value?: number; // Optional value field for compatibility

  // Index signature to allow additional properties without any
  [key: string]: string | number | boolean | null | undefined;
}

// Active competitor for filtering
export interface ActiveCompetitor {
  id: string;
  name: string;
  competitor_domain: string;
  is_active: boolean;
}

// Competitor rank data for processing
export interface CompetitorRank {
  competitorId: string;
  avgRankPosition?: number;
  avg_rank?: number;
}

// Share of voice data item for analytics
export interface ShareOfVoiceDataItem {
  name: string;
  shareOfVoice: number;
  totalMentions: number;
  totalAnalyses: number;
  competitorId: string;
}

// Competitor performance data
export interface CompetitorPerformanceData {
  competitorId: string;
  domain: string;
  name: string;
  shareOfVoice: number;
  averageRank: number;
  mentionCount: number;
  sentimentScore: number;
  visibilityScore: number;
  trend: "stable" | "up" | "down";
  trendPercentage: number;
  lastAnalyzed: string;
  isActive: boolean;
  analysisStatus: string;
}