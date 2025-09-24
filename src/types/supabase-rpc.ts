/**
 * Type definitions for Supabase RPC function calls
 * This file provides proper typing for RPC functions to eliminate 'any' type usage
 */


// Base RPC function names that exist in the database
export type RPCFunctionName =
  | 'get_topics_optimized'
  | 'get_dashboard_metrics'
  | 'get_dashboard_time_series'
  | 'get_topic_performance_dashboard'
  | 'get_llm_performance_dashboard'
  | 'get_website_performance_dashboard';


// RPC Parameters
export interface DashboardMetricsParams {
  p_website_ids: string[];
  p_date_start: string;
  p_date_end: string;
}

export interface TimeSeriesParams {
  p_website_ids: string[];
  p_days: number;
}

export interface TopicsOptimizedParams {
  p_website_id: string;
}

export interface TopicPerformanceDashboardParams {
  p_website_ids: string[];
  p_limit: number;
}

export interface LLMPerformanceDashboardParams {
  p_website_ids: string[];
}

export interface WebsitePerformanceDashboardParams {
  p_website_ids: string[];
}

// RPC Response Types
export interface DashboardMetricsResult {
  overall_visibility_score: number;
  average_ranking: number;
  total_mentions: number;
  sentiment_score: number;
  total_analyses: number;
  active_websites: number;
  top_performing_topic: string | null;
  improvement_trend: number;
}

export interface TimeSeriesResult {
  date: string;
  visibility_score: number;
  mentions: number;
  sentiment: number;
  average_rank: number;
}

export interface TopicPerformanceResult {
  topic: string;
  visibility: number;
  mentions: number;
  average_rank: number;
  sentiment: number;
  trend: number;
}

export interface LLMPerformanceResult {
  provider: string;
  mention_rate: number;
  average_rank: number;
  sentiment: number;
  total_analyses: number;
}

export interface WebsitePerformanceResult {
  website_id: string;
  domain: string;
  display_name: string;
  visibility: number;
  mentions: number;
  sentiment: number;
  last_analyzed: string;
}

export interface TopicOptimizedResult {
  id: string;
  topic: string;
  description: string;
  website_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Type for extended Supabase schema with custom RPC functions
export interface ExtendedSupabaseSchema {
  rpc: (
    functionName: RPCFunctionName,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
}

// Helper type for RPC function calls with proper typing
export type RPCCall<T extends RPCFunctionName> =
  T extends 'get_dashboard_metrics' ? { params: DashboardMetricsParams; result: DashboardMetricsResult } :
  T extends 'get_dashboard_time_series' ? { params: TimeSeriesParams; result: TimeSeriesResult[] } :
  T extends 'get_topics_optimized' ? { params: TopicsOptimizedParams; result: TopicOptimizedResult[] } :
  T extends 'get_topic_performance_dashboard' ? { params: TopicPerformanceDashboardParams; result: TopicPerformanceResult[] } :
  T extends 'get_llm_performance_dashboard' ? { params: LLMPerformanceDashboardParams; result: LLMPerformanceResult[] } :
  T extends 'get_website_performance_dashboard' ? { params: WebsitePerformanceDashboardParams; result: WebsitePerformanceResult[] } :
  never;