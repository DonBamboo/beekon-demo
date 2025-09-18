import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWorkspace } from "./useWorkspace";
import { useToast } from "./use-toast";
import {
  competitorService,
  type CompetitorAnalytics,
} from "@/services/competitorService";
import type { CompetitorPerformance } from "@/types/database";
import { Competitor, CompetitorWithStatus } from "@/types/database";
import type { CompetitorServicePerformance } from "@/services/competitorService";

// Utility function to map service performance to database performance
function mapServiceToDbPerformance(servicePerf: CompetitorServicePerformance): CompetitorPerformance {
  return {
    // Database fields
    visibility_score: servicePerf.visibilityScore,
    avg_rank: servicePerf.averageRank,
    total_mentions: servicePerf.mentionCount,
    sentiment_score: servicePerf.sentimentScore,

    // UI-compatible fields
    competitorId: servicePerf.competitorId,
    domain: servicePerf.domain,
    name: servicePerf.name,
    shareOfVoice: servicePerf.shareOfVoice,
    averageRank: servicePerf.averageRank,
    mentionCount: servicePerf.mentionCount,
    sentimentScore: servicePerf.sentimentScore,
    visibilityScore: servicePerf.visibilityScore,
    trend: servicePerf.trend,
    trendPercentage: servicePerf.trendPercentage,
    lastAnalyzed: servicePerf.lastAnalyzed,
    isActive: servicePerf.isActive,
  };
}

export interface CompetitorFilters {
  dateRange?: { start: string; end: string };
  sortBy?: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore";
  sortOrder?: "asc" | "desc";
  showInactive?: boolean;
}

// Remove duplicate interface - import from types/database.ts instead

interface CompetitorsData {
  competitors: Competitor[];
  competitorsWithStatus: CompetitorWithStatus[];
  performance: CompetitorPerformance[];
  analytics: CompetitorAnalytics | null;
}

export function useCompetitorsCoordinated(
  websiteId: string,
  filters: CompetitorFilters = {}
) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();

  const targetWebsiteId = websiteId || websites?.[0]?.id;

  // Request deduplication cache
  const requestCacheRef = useRef<Map<string, Promise<CompetitorsData>>>(
    new Map()
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const previousParamsRef = useRef<string>("");

  const [data, setData] = useState<CompetitorsData>({
    competitors: [],
    competitorsWithStatus: [],
    performance: [],
    analytics: null,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadAllData = useCallback(
    async (isRefresh = false) => {
      if (workspaceLoading || !targetWebsiteId) {
        return;
      }

      // Create a unique request key for deduplication
      const requestKey = `${targetWebsiteId}-${JSON.stringify(
        filters
      )}-${isRefresh}`;

      // Check if identical request is already in progress
      if (requestCacheRef.current.has(requestKey)) {
        return requestCacheRef.current.get(requestKey);
      }

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Set loading states appropriately to prevent flickering
      if (!isRefresh && isInitialLoad) {
        setIsLoading(true);
      } else if (isRefresh) {
        setIsRefreshing(true);
      }

      setError(null);

      // Create the request promise and cache it
      const requestPromise = (async (): Promise<CompetitorsData> => {
        try {
          // Load all competitor data in parallel
          const [competitorsResult, performanceResult, analyticsResult] =
            await Promise.all([
              competitorService.getCompetitors(targetWebsiteId),
              competitorService.getCompetitorPerformance(
                targetWebsiteId,
                filters.dateRange
              ),
              competitorService.getCompetitiveAnalysis(
                targetWebsiteId,
                filters.dateRange
              ),
            ]);

          // Create competitors with status
          const competitorsWithStatus: CompetitorWithStatus[] =
            competitorsResult.map((competitor) => {
              const performance = performanceResult.find(
                (p) => p.domain === competitor.competitor_domain
              );
              return {
                ...competitor,
                analysisStatus: performance
                  ? "completed"
                  : ("pending" as const),
                performance,
                addedAt: competitor.created_at || new Date().toISOString(),
              };
            });

          // Apply sorting to competitors with status
          if (filters.sortBy && filters.sortOrder) {
            competitorsWithStatus.sort((a, b) => {
              let comparison = 0;
              const aPerf = a.performance;
              const bPerf = b.performance;

              switch (filters.sortBy) {
                case "shareOfVoice":
                  // Note: shareOfVoice needs to be calculated from database fields
                  comparison = 0; // TODO: Implement shareOfVoice calculation
                  break;
                case "averageRank":
                  comparison =
                    (aPerf?.avg_rank || 0) - (bPerf?.avg_rank || 0);
                  break;
                case "mentionCount":
                  comparison =
                    (aPerf?.total_mentions || 0) - (bPerf?.total_mentions || 0);
                  break;
                case "sentimentScore":
                  comparison =
                    (aPerf?.sentiment_score || 0) - (bPerf?.sentiment_score || 0);
                  break;
              }

              return filters.sortOrder === "desc" ? -comparison : comparison;
            });
          }

          const resultData: CompetitorsData = {
            competitors: competitorsResult,
            competitorsWithStatus,
            performance: performanceResult.map(mapServiceToDbPerformance),
            analytics: analyticsResult,
          };

          // Set all data at once to prevent multiple re-renders
          setData(resultData);

          if (isRefresh) {
            toast({
              title: "Competitors data updated",
              description:
                "Latest competitor data has been loaded successfully.",
            });
          }

          // Mark as no longer initial load after first successful load
          if (isInitialLoad) {
            setIsInitialLoad(false);
          }

          return resultData;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw error; // Let abort errors bubble up
          }

          const errorObj =
            error instanceof Error
              ? error
              : new Error("Failed to load competitor data");
          setError(errorObj);

          toast({
            title: "Error loading competitors",
            description: errorObj.message,
            variant: "destructive",
          });

          throw errorObj;
        } finally {
          setIsLoading(false);
          setIsRefreshing(false);
          // Remove from cache when completed (success or error)
          requestCacheRef.current.delete(requestKey);
        }
      })();

      // Cache the promise
      requestCacheRef.current.set(requestKey, requestPromise);

      return requestPromise;
    },
    [targetWebsiteId, filters, workspaceLoading, isInitialLoad, toast]
  );

  const refresh = useCallback(() => {
    loadAllData(true);
  }, [loadAllData]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Serialize parameters for comparison
  const paramsKey = useMemo(() => {
    return JSON.stringify({ targetWebsiteId, filters });
  }, [targetWebsiteId, filters]);

  // Load data immediately when parameters change (no debouncing)
  useEffect(() => {
    const hasParamsChanged = previousParamsRef.current !== paramsKey;

    if (hasParamsChanged) {
      const previousParams = previousParamsRef.current
        ? JSON.parse(previousParamsRef.current)
        : {};
      const currentParams = JSON.parse(paramsKey);
      const websiteChanged =
        previousParams.targetWebsiteId !== currentParams.targetWebsiteId;

      previousParamsRef.current = paramsKey;

      if (websiteChanged) {
        // Immediate optimistic update for website changes
        setData({
          competitors: [],
          competitorsWithStatus: [],
          performance: [],
          analytics: null,
        });
        setError(null);
        setIsInitialLoad(true);
        setIsLoading(true); // Set loading state immediately for visual feedback

        // Load data immediately - no debouncing for website changes
        loadAllData().catch((err) => {
          if (err?.name !== "AbortError") {
            // Failed to load competitors data - error handled by component
          }
        });
      } else {
        // For non-website changes (filters), load immediately as well
        // The request deduplication will handle rapid changes automatically
        loadAllData().catch((err) => {
          if (err?.name !== "AbortError") {
            // Failed to load competitors data - error handled by component
          }
        });
      }
    }
  }, [paramsKey, loadAllData]);

  const hasData = useMemo(() => {
    return (
      data.competitors.length > 0 ||
      data.performance.length > 0 ||
      data.analytics !== null
    );
  }, [data]);

  // Cleanup on unmount
  useEffect(() => {
    const currentCache = requestCacheRef.current;
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear request cache
      currentCache.clear();
    };
  }, []);

  return {
    ...data,
    isLoading,
    isInitialLoad,
    isRefreshing,
    error,
    hasData,
    refetch: refresh,
    refresh,
    clearError,
    targetWebsiteId,
  };
}
