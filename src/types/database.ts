/**
 * Database type aliases for easy import and usage
 * These types are derived from the generated Supabase types
 */
import { Database } from "@/integrations/supabase/types";

// Core database table types
export type Website = Database["beekon_data"]["Tables"]["websites"]["Row"];
export type WebsiteInsert =
  Database["beekon_data"]["Tables"]["websites"]["Insert"];
export type WebsiteUpdate =
  Database["beekon_data"]["Tables"]["websites"]["Update"];

export type Competitor =
  Database["beekon_data"]["Tables"]["competitors"]["Row"];
export type CompetitorInsert =
  Database["beekon_data"]["Tables"]["competitors"]["Insert"];
export type CompetitorUpdate =
  Database["beekon_data"]["Tables"]["competitors"]["Update"];

export type LLMAnalysisResult =
  Database["beekon_data"]["Tables"]["llm_analysis_results"]["Row"];
export type LLMAnalysisResultInsert =
  Database["beekon_data"]["Tables"]["llm_analysis_results"]["Insert"];
export type LLMAnalysisResultUpdate =
  Database["beekon_data"]["Tables"]["llm_analysis_results"]["Update"];

export type Topic = Database["beekon_data"]["Tables"]["topics"]["Row"];
export type TopicInsert = Database["beekon_data"]["Tables"]["topics"]["Insert"];
export type TopicUpdate = Database["beekon_data"]["Tables"]["topics"]["Update"];

export type Prompt = Database["beekon_data"]["Tables"]["prompts"]["Row"];
export type PromptInsert =
  Database["beekon_data"]["Tables"]["prompts"]["Insert"];
export type PromptUpdate =
  Database["beekon_data"]["Tables"]["prompts"]["Update"];

export type Profile = Database["beekon_data"]["Tables"]["profiles"]["Row"];
export type ProfileInsert =
  Database["beekon_data"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate =
  Database["beekon_data"]["Tables"]["profiles"]["Update"];

export type ApiKey = Database["beekon_data"]["Tables"]["api_keys"]["Row"];
export type ApiKeyInsert =
  Database["beekon_data"]["Tables"]["api_keys"]["Insert"];
export type ApiKeyUpdate =
  Database["beekon_data"]["Tables"]["api_keys"]["Update"];

export type WebsiteSettings =
  Database["beekon_data"]["Tables"]["website_settings"]["Row"];
export type WebsiteSettingsInsert =
  Database["beekon_data"]["Tables"]["website_settings"]["Insert"];
export type WebsiteSettingsUpdate =
  Database["beekon_data"]["Tables"]["website_settings"]["Update"];

export type Workspace = Database["beekon_data"]["Tables"]["workspaces"]["Row"];
export type WorkspaceInsert =
  Database["beekon_data"]["Tables"]["workspaces"]["Insert"];
export type WorkspaceUpdate =
  Database["beekon_data"]["Tables"]["workspaces"]["Update"];

export type ExportHistory = Database["beekon_data"]["Tables"]["export_history"]["Row"];
export type ExportHistoryInsert =
  Database["beekon_data"]["Tables"]["export_history"]["Insert"];
export type ExportHistoryUpdate =
  Database["beekon_data"]["Tables"]["export_history"]["Update"];

// Common notification settings type
export interface NotificationSettings {
  email_notifications: boolean;
  weekly_reports: boolean;
  competitor_alerts: boolean;
  analysis_complete: boolean;
}

// Extended user profile with notification settings
export interface UserProfile extends Profile {
  notification_settings: NotificationSettings;
}

// Extended website with computed fields for UI
export interface WebsiteWithMetrics extends Website {
  totalTopics: number;
  avgVisibility: number;
  lastAnalysisDate: string | null;
  competitorCount: number;
  analysisCount: number;
}

// Analysis result types
export interface LLMResult {
  llm_provider: string;
  is_mentioned: boolean;
  rank_position: number | null;
  confidence_score: number | null;
  sentiment_score: number | null;
  summary_text: string | null;
  response_text: string | null;
  analyzed_at: string;
}

export interface AnalysisInsights {
  strengths: string[];
  opportunities: string[];
  recommendations: string[];
  summary: string;
  generatedAt: string;
  sources: {
    summary: 'prompt' | 'calculated';
    strengths: 'prompt' | 'calculated' | 'mixed';
    opportunities: 'prompt' | 'calculated' | 'mixed';
    recommendations: 'prompt' | 'calculated' | 'mixed';
  };
}

export interface AnalysisResult {
  id: string;
  topic_name: string;
  topic_keywords: string[];
  llm_results: LLMResult[];
  total_mentions: number;
  avg_rank: number | null;
  avg_confidence: number | null;
  avg_sentiment: number | null;
  insights?: AnalysisInsights;
}

// UI-specific analysis result format for DetailedAnalysisModal
export interface UIAnalysisResult {
  id: string;
  prompt: string;
  website_id: string;
  topic: string;
  status: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  reporting_text: string | null;
  recommendation_text: string | null;
  prompt_strengths: string[] | null;
  prompt_opportunities: string[] | null;
  llm_results: UILLMResult[];
  insights?: AnalysisInsights;
  // Analysis session information
  analysis_session_id?: string | null;
  analysis_name?: string | null;
  analysis_session_status?: string | null;
}

// UI-specific LLM result format
export interface UILLMResult {
  llm_provider: string;
  is_mentioned: boolean;
  rank_position: number | null;
  confidence_score: number | null;
  sentiment_score: number | null;
  summary_text: string | null;
  response_text: string | null;
  analyzed_at: string;
  isFiltered?: boolean; // Flag to indicate if this result matches the current filter
}

// Competitor analysis result
export interface CompetitorAnalysisResult {
  competitor_domain: string;
  competitor_name: string | null;
  analysis_results: AnalysisResult[];
  overall_mentions: number;
  avg_rank: number | null;
  avg_confidence: number | null;
  last_analyzed_at: string | null;
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

// Filter types
export interface DateRangeFilter {
  from: string;
  to: string;
}

export interface WebsiteFilter {
  website_ids: string[];
  date_range: DateRangeFilter;
  llm_providers: string[];
  analysis_status: "all" | "completed" | "pending" | "failed";
}

// Dashboard metrics
export interface DashboardMetrics {
  total_websites: number;
  total_competitors: number;
  total_analyses: number;
  avg_visibility: number;
  mentions_trend: number;
  rank_trend: number;
  confidence_trend: number;
  sentiment_trend: number;
}

// Export history types
export type ExportStatus = "pending" | "processing" | "completed" | "failed";
export type ExportType = "analysis" | "dashboard" | "website" | "competitor" | "configuration" | "filtered_data";
export type ExportFormat = "pdf" | "csv" | "json" | "excel";

export interface ExportHistoryRecord {
  id: string;
  user_id: string;
  export_type: ExportType;
  format: ExportFormat;
  filename: string;
  file_size: number | null;
  status: ExportStatus;
  filters: Record<string, unknown> | null;
  date_range: { start: string; end: string } | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ExportStatistics {
  user_id: string;
  export_type: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  total_exports: number;
  total_size: number | null;
  avg_size: number | null;
  last_export: string | null;
  successful_exports: number;
  failed_exports: number;
  avg_duration_seconds: number | null;
}

export interface UserExportSummary {
  total_exports: number;
  successful_exports: number;
  failed_exports: number;
  total_size: number;
  avg_size: number;
  last_export: string | null;
  favorite_format: ExportFormat;
  most_exported_type: ExportType;
  export_frequency: number; // exports per day
}

// Type guards
export const isValidWebsite = (obj: unknown): obj is Website => {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "id" in obj &&
    "domain" in obj &&
    "workspace_id" in obj
  );
};

export const isValidCompetitor = (obj: unknown): obj is Competitor => {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "id" in obj &&
    "competitor_domain" in obj &&
    "website_id" in obj
  );
};

export const isValidLLMResult = (obj: unknown): obj is LLMResult => {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "llm_provider" in obj &&
    "is_mentioned" in obj &&
    typeof (obj as Record<string, unknown>).is_mentioned === "boolean"
  );
};
