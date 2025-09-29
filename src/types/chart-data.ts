/**
 * Type definitions for chart data structures
 * This file provides proper typing for chart components to eliminate 'any' type usage
 */

// Chart data point for stacked area charts
export interface ChartDataPoint {
  date: string;
  dateFormatted: string;
  [competitorName: string]: string | number; // Dynamic competitor properties
}

// Base chart data interface
export interface BaseChartData {
  name: string;
  value: number;
  fill?: string;
}

// Share of Voice chart data
export interface ShareOfVoiceChartData extends BaseChartData {
  competitorId?: string;
  mentions?: number;
  avgRank?: number;
  dataType?: "market_share" | "share_of_voice";
  normalizedValue?: number;
  rawValue?: number;
  shareOfVoice?: number;
  totalMentions?: number;
  totalAnalyses?: number;
  isOthersGroup?: boolean;
  competitors?: ShareOfVoiceChartData[];
  colorIndex?: number;
}

// Time series data for dashboard charts
export interface TimeSeriesData {
  date: string;
  visibilityScore: number;
  mentions: number;
  sentiment: number;
  averageRank: number;
}

// Topic performance data for dashboard
export interface TopicPerformanceData {
  topic: string;
  visibility: number;
  mentions: number;
  averageRank: number;
  sentiment: number;
  trend: number;
}

// LLM performance data for dashboard
export interface LLMPerformanceData {
  provider: string;
  mentionRate: number;
  averageRank: number;
  sentiment: number;
  totalAnalyses: number;
}

// Website performance data for dashboard
export interface WebsitePerformanceData {
  websiteId: string;
  domain: string;
  displayName: string;
  visibility: number;
  mentions: number;
  sentiment: number;
  lastAnalyzed: string;
}