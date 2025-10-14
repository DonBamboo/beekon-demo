/**
 * Hook for stable analysis analytics independent of pagination
 * This ensures analytics remain consistent regardless of infinite scroll state
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSelectedWebsite, usePageFilters } from "@/hooks/appStateHooks";
import { useAppState } from "@/hooks/appStateHooks";
import {
  analyticsService,
  AnalysisAnalytics,
} from "@/services/analyticsService";
import type { AnalysisFilters as AppStateFilters } from "@/contexts/AppStateContext";
import type { AnalysisFilters as ServiceFilters } from "@/hooks/useAnalysisQuery";

export function useAnalysisAnalytics() {
  const { selectedWebsiteId } = useSelectedWebsite();
  const { filters } = usePageFilters("analysis");
  const { getFromCache, setCache } = useAppState();

  const [analytics, setAnalytics] = useState<AnalysisAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Transform AppState filters to Service filters format
  const transformFilters = useCallback(
    (appFilters: AppStateFilters): ServiceFilters => {
      const serviceFilters: ServiceFilters = {};

      // Handle dateRange transformation
      if (appFilters.dateRange && appFilters.dateRange !== "all") {
        // Convert string date range to object format
        const now = new Date();
        let startDate: Date;

        switch (appFilters.dateRange) {
          case "7d":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "30d":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case "90d":
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case "1y":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days
        }

        serviceFilters.dateRange = {
          start: startDate.toISOString(),
          end: now.toISOString(),
        };
      }

      // Transform other filters
      if (appFilters.topic && appFilters.topic !== "all") {
        serviceFilters.topic = appFilters.topic;
      }

      if (appFilters.llm && appFilters.llm !== "all") {
        serviceFilters.llmProvider = appFilters.llm;
      }

      if (appFilters.searchQuery) {
        serviceFilters.searchQuery = appFilters.searchQuery;
      }

      // Note: mentionStatus, sentiment, and other advanced filters
      // may require extending the ServiceFilters interface
      // For now, we pass through basic filters that are supported

      return serviceFilters;
    },
    []
  );

  // Memoize transformed filters to prevent unnecessary requests
  const stableFilters = useMemo(
    () => transformFilters(filters as AppStateFilters),
    [filters, transformFilters]
  );

  // Create stable cache key based on website and filters
  const analyticsCacheKey = useMemo(() => {
    const filterHash = JSON.stringify(stableFilters);
    return `analysis_analytics_${selectedWebsiteId}_${btoa(filterHash)}`;
  }, [selectedWebsiteId, stableFilters]);

  // Check for cached analytics
  const cachedAnalytics = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<AnalysisAnalytics>(analyticsCacheKey);
  }, [selectedWebsiteId, analyticsCacheKey, getFromCache]);

  // Load analytics data
  const loadAnalytics = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) {
        setAnalytics(null);
        setError(null);
        return;
      }

      // Use cached data if available and not forcing refresh
      if (!forceRefresh && cachedAnalytics) {
        setAnalytics(cachedAnalytics);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const analyticsData = await analyticsService.getAnalysisAnalytics(
          selectedWebsiteId,
          stableFilters
        );

        setAnalytics(analyticsData);

        // Cache the analytics for 10 minutes
        setCache(analyticsCacheKey, analyticsData, 10 * 60 * 1000);
      } catch (err) {
        // Failed to load analysis analytics
        setError(
          err instanceof Error ? err : new Error("Failed to load analytics")
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      selectedWebsiteId,
      stableFilters,
      cachedAnalytics,
      analyticsCacheKey,
      setCache,
    ]
  );

  // Load analytics when website or filters change
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Refresh analytics (force reload)
  const refreshAnalytics = useCallback(() => {
    loadAnalytics(true);
  }, [loadAnalytics]);

  // Invalidate all analytics cache for current website
  const invalidateAnalyticsCache = useCallback(() => {
    // Clear all analytics cache entries for this website
    const allKeys = Array.from(getFromCache<string>("_cache_keys") || []);
    const analyticsKeys = allKeys.filter((key) =>
      key.startsWith(`analysis_analytics_${selectedWebsiteId}_`)
    );

    analyticsKeys.forEach((key) => {
      setCache(key, null, 0); // Expire immediately
    });

    // Force refresh current analytics
    loadAnalytics(true);
  }, [selectedWebsiteId, getFromCache, setCache, loadAnalytics]);

  return {
    analytics,
    isLoading,
    error,
    refreshAnalytics,
    invalidateAnalyticsCache,
    hasCachedData: !!cachedAnalytics,
  };
}
