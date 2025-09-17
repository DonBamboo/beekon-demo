import { CompetitorStatusValue } from "@/types/database";

/**
 * Maps various status string values to the standard CompetitorStatusValue type
 * Handles inconsistencies between database values, service responses, and legacy code
 */
export function normalizeCompetitorStatus(status: string | null | undefined): CompetitorStatusValue {
  if (!status) {
    return "pending";
  }

  // Normalize to lowercase for consistent comparison
  const normalizedStatus = status.toLowerCase().trim();

  switch (normalizedStatus) {
    case "completed":
    case "complete":
    case "finished":
    case "done":
      return "completed";

    case "analyzing":
    case "in_progress":
    case "in-progress":
    case "running":
    case "processing":
      return "analyzing";

    case "failed":
    case "error":
    case "cancelled":
    case "canceled":
    case "stopped":
      return "failed";

    case "pending":
    case "waiting":
    case "queued":
    case "scheduled":
    default:
      return "pending";
  }
}

/**
 * Determines if a competitor status indicates active/completed analysis
 * Used for filtering and counting active competitors
 */
export function isCompetitorActive(status: CompetitorStatusValue): boolean {
  return status === "completed" || status === "analyzing";
}

/**
 * Gets a human-readable label for the competitor status
 */
export function getCompetitorStatusLabel(status: CompetitorStatusValue): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "analyzing":
      return "Analyzing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

/**
 * Determines status priority for sorting (higher number = higher priority)
 */
export function getCompetitorStatusPriority(status: CompetitorStatusValue): number {
  switch (status) {
    case "analyzing":
      return 4; // Highest priority - currently running
    case "failed":
      return 3; // High priority - needs attention
    case "completed":
      return 2; // Medium priority - finished
    case "pending":
      return 1; // Low priority - waiting
    default:
      return 0;
  }
}

/**
 * Maps database analysis_status field to UI-friendly status
 * Handles the specific mapping from database function results
 */
export function mapDatabaseStatusToUI(databaseStatus: string | null | undefined): CompetitorStatusValue {
  // Database might return various values, normalize them
  return normalizeCompetitorStatus(databaseStatus);
}

/**
 * Derives competitor status from analysis data when database status is not available
 * This is a fallback for cases where we need to infer status from other fields
 */
export function deriveStatusFromAnalysisData(
  analysisCount: number,
  mentionCount: number,
  lastAnalyzedAt: string | null | undefined,
  hasActiveAnalysis?: boolean
): CompetitorStatusValue {
  // If actively running analysis
  if (hasActiveAnalysis) {
    return "analyzing";
  }

  // If has recent analysis (within 7 days) and mentions
  if (lastAnalyzedAt && mentionCount > 0) {
    const lastAnalyzed = new Date(lastAnalyzedAt);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (lastAnalyzed > sevenDaysAgo) {
      return "analyzing"; // Recent activity
    }
  }

  // If has completed analysis with mentions
  if (analysisCount > 0 && mentionCount > 0) {
    return "completed";
  }

  // If has analysis but no mentions (might be failed or still processing)
  if (analysisCount > 0) {
    return "analyzing";
  }

  // Default to pending if no analysis data
  return "pending";
}