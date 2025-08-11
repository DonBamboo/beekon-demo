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
  user_id: string;
  workspace_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  configuration: any;
  progress_data: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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
    typeof obj.user_id === "string" &&
    typeof obj.workspace_id === "string" &&
    typeof obj.status === "string" &&
    ["pending", "running", "completed", "failed"].includes(obj.status) &&
    typeof obj.created_at === "string" &&
    typeof obj.updated_at === "string"
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