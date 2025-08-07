// Centralized type guards for better type safety and code organization

import { AnalysisResult, UIAnalysisResult } from "@/types/database";

// Subscription tier types
export type SubscriptionTier = "free" | "starter" | "professional" | "enterprise";

// Type guard for SubscriptionTier
export function isValidSubscriptionTier(value: unknown): value is SubscriptionTier {
  return (
    typeof value === "string" &&
    ["free", "starter", "professional", "enterprise"].includes(value)
  );
}

// Analysis session interface for validation
export interface AnalysisSession {
  id: string;
  analysis_name: string;
  website_id: string;
  created_at: string;
  topics: string[];
  custom_prompts?: string[];
  llm_models: string[];
  analysis_depth: string;
  concurrent_analyses: number;
  include_sentiment: boolean;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

// Type guard for AnalysisSession
export function isValidAnalysisSession(data: unknown): data is AnalysisSession {
  if (!data || typeof data !== "object") {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  
  return (
    typeof obj.id === "string" &&
    typeof obj.analysis_name === "string" &&
    typeof obj.website_id === "string" &&
    typeof obj.created_at === "string" &&
    Array.isArray(obj.topics) &&
    Array.isArray(obj.llm_models) &&
    typeof obj.analysis_depth === "string" &&
    typeof obj.concurrent_analyses === "number" &&
    typeof obj.include_sentiment === "boolean" &&
    typeof obj.status === "string" &&
    ["pending", "in_progress", "completed", "failed"].includes(obj.status)
  );
}

// Type guard for UIAnalysisResult
export function isUIAnalysisResult(result: unknown): result is UIAnalysisResult {
  if (!result || typeof result !== "object") {
    return false;
  }
  
  const obj = result as Record<string, unknown>;
  
  return (
    typeof obj.id === "string" &&
    typeof obj.prompt === "string" &&
    Array.isArray(obj.llm_results)
  );
}

// Type guard for AnalysisResult
export function isAnalysisResult(result: unknown): result is AnalysisResult {
  if (!result || typeof result !== "object") {
    return false;
  }
  
  const obj = result as Record<string, unknown>;
  
  return (
    typeof obj.id === "string" &&
    typeof obj.topic_name === "string" &&
    Array.isArray(obj.llm_results)
  );
}