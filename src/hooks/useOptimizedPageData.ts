import React, {
  useCallback,
  useEffect,
  useState,
  useMemo,
  useRef,
} from "react";
import {
  useAppState,
  useSelectedWebsite,
  usePageFilters,
} from "@/contexts/AppStateContext";
import { useWebsiteData } from "./useSharedData";
import { batchAPI } from "@/services/batchService";
import { analysisService } from "@/services/analysisService";
import { dashboardService } from "@/services/dashboardService";
import { deduplicateById } from "@/lib/utils";
import type { UIAnalysisResult } from "@/types/database";

// Analysis page optimized hook
export function useOptimizedAnalysisData() {
  const { selectedWebsiteId } = useSelectedWebsite();
  const { filters, setFilters } = usePageFilters("analysis");
  const { getFromCache, setCache } = useAppState();

  // Use shared data for topics and LLM providers (cached across pages)
  const {
    topics,
    llmProviders,
    loading: sharedDataLoading,
  } = useWebsiteData(selectedWebsiteId);

  // State for analysis-specific data
  const [analysisResults, setAnalysisResults] = useState<UIAnalysisResult[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(!!selectedWebsiteId);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Transform filters from global state format to service-expected format
  const transformedFilters = useMemo(() => {
    const baseFilters = { ...filters };

    // Transform dateRange from string to object format expected by services
    if (filters.dateRange && filters.dateRange !== "all") {
      const days = parseInt(filters.dateRange.replace("d", ""));
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      baseFilters.dateRange = {
        start: startDate.toISOString(),
        end: now.toISOString(),
      };
    } else {
      baseFilters.dateRange = undefined;
    }

    return baseFilters;
  }, [filters]);

  // Cache keys
  const resultsCacheKey = `analysis_results_${selectedWebsiteId}_${JSON.stringify(
    transformedFilters
  )}`;
  const metadataCacheKey = `analysis_metadata_${selectedWebsiteId}`;

  // Check if we have cached data for instant rendering - remove unstable getFromCache dependency
  const cachedResults = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<UIAnalysisResult[]>(resultsCacheKey);
  }, [selectedWebsiteId, resultsCacheKey]);

  // Stable reference to previous filters to prevent unnecessary updates
  const prevFiltersRef = useRef(transformedFilters);
  const filtersChanged =
    JSON.stringify(prevFiltersRef.current) !==
    JSON.stringify(transformedFilters);
  if (filtersChanged) {
    prevFiltersRef.current = transformedFilters;
  }

  // Load analysis data with cache-first approach - stabilized dependencies
  const loadAnalysisData = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) {
        setAnalysisResults([]);
        return;
      }

      // Get current cache state
      const currentCachedResults =
        getFromCache<UIAnalysisResult[]>(resultsCacheKey);

      // First, check cache for instant rendering
      if (!forceRefresh && currentCachedResults) {
        setAnalysisResults(currentCachedResults);
        setIsInitialLoad(false);
        setIsLoading(false);
        return;
      }

      // Show loading only if no cached data
      if (!currentCachedResults) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // Use current transformed filters (from ref for stability)
        const currentFilters = prevFiltersRef.current;

        // Use batch API for efficient loading with transformed filters
        const batchResponse = await batchAPI.loadAnalysisPage(
          selectedWebsiteId,
          currentFilters
        );
        const data = batchResponse.data as any;

        // Update results with deduplication
        const rawResults = data.recentResults || [];
        const results = deduplicateById(rawResults);
        setAnalysisResults(results);

        // Cache the deduplicated results
        setCache(resultsCacheKey, results, 5 * 60 * 1000); // 5 minutes cache

        // Cache metadata for other components
        if (data.metadata) {
          setCache(metadataCacheKey, data.metadata, 15 * 60 * 1000);
        }
      } catch (error) {
        console.error("Failed to load analysis data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    },
    [
      selectedWebsiteId,
      resultsCacheKey,
      metadataCacheKey,
      getFromCache,
      setCache,
    ]
  );

  // Load more results for infinite scroll
  const loadMoreResults = useCallback(async () => {
    if (!selectedWebsiteId || isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const offset = analysisResults.length;
      // Use stable filter reference for pagination
      const currentFilters = prevFiltersRef.current;
      const additionalResults =
        await analysisService.getAnalysisResultsPaginated(selectedWebsiteId, {
          ...currentFilters,
          limit: 20,
          offset,
        });

      // Deduplicate results to prevent duplicate keys
      const combinedResults = [
        ...analysisResults,
        ...additionalResults.results,
      ];
      const newResults = deduplicateById(combinedResults);
      setAnalysisResults(newResults);
      setHasMore(additionalResults.hasMore);

      // Update cache with deduplicated results
      setCache(resultsCacheKey, newResults, 5 * 60 * 1000);
    } catch (error) {
      console.error("Failed to load more results:", error);
      setError(
        error instanceof Error ? error : new Error("Failed to load more")
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedWebsiteId,
    analysisResults,
    hasMore,
    isLoading,
    setCache,
    resultsCacheKey,
  ]);

  // Enhanced cache-first navigation for instant website switching
  useEffect(() => {
    if (!selectedWebsiteId) {
      setAnalysisResults([]);
      setIsLoading(false);
      setIsInitialLoad(false);
      setError(null);
      setHasMore(true);
      return;
    }

    // Check cache first before resetting any loading states
    const cachedData = getFromCache<UIAnalysisResult[]>(resultsCacheKey);
    if (cachedData && cachedData.length > 0) {
      // We have cached data - use it immediately without showing loading
      setAnalysisResults(cachedData);
      setIsInitialLoad(false);
      setIsLoading(false);
      setError(null);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Analysis: Using cached data for instant navigation", {
          websiteId: selectedWebsiteId,
          cachedResults: cachedData.length,
          cacheKey: resultsCacheKey
        });
      }
      return;
    }

    // No cache found - set loading state and fetch fresh data
    setIsLoading(true);
    setError(null);
    loadAnalysisData();
    
    if (process.env.NODE_ENV === "development") {
      console.log("Analysis: No cache found, loading fresh data", {
        websiteId: selectedWebsiteId,
        cacheKey: resultsCacheKey
      });
    }
  }, [selectedWebsiteId, filtersChanged, resultsCacheKey, getFromCache, loadAnalysisData]);

  // Detect website changes and clear local state for smooth navigation
  const prevWebsiteIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const prevWebsiteId = prevWebsiteIdRef.current;
    prevWebsiteIdRef.current = selectedWebsiteId;

    // Only reset local state when actually switching to a different website, not on initial load
    if (
      prevWebsiteId &&
      selectedWebsiteId &&
      prevWebsiteId !== selectedWebsiteId
    ) {
      // Clear local state for loading transition (but preserve cache)
      setAnalysisResults([]);
      setIsInitialLoad(true);
      setError(null);
      setHasMore(true);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Analysis: Website changed, clearing local state", {
          from: prevWebsiteId,
          to: selectedWebsiteId,
          note: "Cache preserved for future navigation"
        });
      }
    }
  }, [selectedWebsiteId]);

  return {
    // Data
    analysisResults,
    topics,
    llmProviders,

    // Loading states (optimized - only show when no cache)
    isLoading: isLoading && !cachedResults,
    isInitialLoad: isInitialLoad && !cachedResults,
    sharedDataLoading,

    // State
    error,
    hasMore,

    // Actions
    loadMore: loadMoreResults,
    refresh: () => loadAnalysisData(true),

    // Filters
    filters,
    setFilters,

    // Cache status
    hasCachedData: !!cachedResults,
  };
}

// Dashboard page optimized hook
export function useOptimizedDashboardData() {
  const { selectedWebsiteId } = useSelectedWebsite();
  const { filters, setFilters } = usePageFilters("dashboard");
  const { getFromCache, setCache } = useAppState();

  // State for dashboard data
  const [metrics, setMetrics] = useState<any>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [topicPerformance, setTopicPerformance] = useState<any[]>([]);
  const [error, setError] = useState<Error | null>(null);
  
  // Initialize loading state as true if we have a website to load data for
  const [isLoading, setIsLoading] = useState(!!selectedWebsiteId);

  // Transform dashboard filters if needed
  const transformedFilters = useMemo(() => {
    const baseFilters = { ...filters };
    // Dashboard filters are simpler, just ensure period is handled correctly
    return baseFilters;
  }, [filters]);

  const cacheKey = `dashboard_data_${selectedWebsiteId}_${transformedFilters.period}`;

  // Check cached data - remove unstable getFromCache dependency
  const cachedData = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<any>(cacheKey);
  }, [selectedWebsiteId, cacheKey]);

  const loadDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) return;

      // Get current cache state
      const currentCachedData = getFromCache<any>(cacheKey);

      // Instant render from cache
      if (!forceRefresh && currentCachedData) {
        setMetrics(currentCachedData.metrics);
        setTimeSeriesData(currentCachedData.timeSeriesData);
        setTopicPerformance(currentCachedData.topicPerformance);
        setIsLoading(false);
        return;
      }

      // Show loading only if no cached data
      if (!currentCachedData) {
        setIsLoading(true);
      }

      try {
        // CRITICAL FIX: Dashboard service expects arrays, not single strings
        const [metrics, timeSeriesData, topicPerformance] = await Promise.all([
          dashboardService.getDashboardMetrics(
            [selectedWebsiteId],
            transformedFilters.dateRange
          ),
          dashboardService.getTimeSeriesData(
            [selectedWebsiteId],
            transformedFilters.period || "7d"
          ),
          dashboardService.getTopicPerformance([selectedWebsiteId], 10),
        ]);

        const data = { metrics, timeSeriesData, topicPerformance };

        setMetrics(data.metrics);
        setTimeSeriesData(data.timeSeriesData || []);
        setTopicPerformance(data.topicPerformance || []);

        // Cache the complete dashboard data
        const dashboardData = {
          metrics: data.metrics,
          timeSeriesData: data.timeSeriesData || [],
          topicPerformance: data.topicPerformance || [],
          llmPerformance: data.llmPerformance || [],
          websitePerformance: data.websitePerformance || [],
        };

        setCache(cacheKey, dashboardData, 10 * 60 * 1000); // 10 minutes cache
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    },
    [
      selectedWebsiteId,
      JSON.stringify(transformedFilters),
      getFromCache,
      setCache,
      cacheKey,
    ]
  );

  // Handle initial loading state and cached data
  useEffect(() => {
    if (!selectedWebsiteId) {
      setIsLoading(false);
      return;
    }

    const currentCachedData = getFromCache<any>(cacheKey);
    if (currentCachedData) {
      // We have cached data, use it immediately and stop loading
      setMetrics(currentCachedData.metrics);
      setTimeSeriesData(currentCachedData.timeSeriesData);
      setTopicPerformance(currentCachedData.topicPerformance);
      setIsLoading(false);
    } else {
      // No cached data, ensure loading state is true and load data
      setIsLoading(true);
      loadDashboardData();
    }
  }, [selectedWebsiteId, cacheKey, getFromCache, loadDashboardData]);

  // Detect website changes and reload data immediately
  const { clearCache: clearDashboardCache } = useAppState();
  const prevDashboardWebsiteIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const prevWebsiteId = prevDashboardWebsiteIdRef.current;
    prevDashboardWebsiteIdRef.current = selectedWebsiteId;

    // Only reload when actually switching to a different website, not on initial load
    if (
      prevWebsiteId &&
      selectedWebsiteId &&
      prevWebsiteId !== selectedWebsiteId
    ) {
      if (process.env.NODE_ENV === "development") {
        console.log("Dashboard: Website changed, reloading data immediately", {
          from: prevWebsiteId,
          to: selectedWebsiteId,
        });
      }
      
      // Clear local state first to prevent showing stale data
      setMetrics(null);
      setTimeSeriesData([]);
      setTopicPerformance([]);
      setError(null);
      
      // Always reload data immediately - no complex visibility logic
      loadDashboardData(true);
      
      // Clear global cache for the previous website using pattern matching
      clearDashboardCache(`dashboard_data_${prevWebsiteId}`);
    }
  }, [selectedWebsiteId, loadDashboardData, clearDashboardCache]);

  return {
    // Data
    metrics,
    timeSeriesData,
    topicPerformance,

    // Loading states (optimized)
    isLoading: isLoading && !cachedData,

    // State
    error,

    // Actions
    refresh: () => loadDashboardData(true),

    // Filters
    filters,
    setFilters,

    // Cache status
    hasCachedData: !!cachedData,
  };
}

// Competitors page optimized hook
export function useOptimizedCompetitorsData() {
  const { selectedWebsiteId } = useSelectedWebsite();
  const { filters, setFilters } = usePageFilters("competitors");
  const { getFromCache, setCache } = useAppState();

  // Use shared topics data
  const { topics } = useWebsiteData(selectedWebsiteId);

  // State for competitors data
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(!!selectedWebsiteId);
  const [error, setError] = useState<Error | null>(null);

  // Transform competitors filters from global state format to service format
  const transformedFilters = useMemo(() => {
    const baseFilters = { ...filters };

    // Transform dateFilter to dateRange if needed
    if (filters.dateFilter && filters.dateFilter !== "all") {
      const days = parseInt(filters.dateFilter.replace("d", ""));
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      baseFilters.dateRange = {
        start: startDate.toISOString(),
        end: now.toISOString(),
      };
      delete baseFilters.dateFilter; // Remove the string version
    } else {
      baseFilters.dateRange = undefined;
      delete baseFilters.dateFilter;
    }

    return baseFilters;
  }, [filters]);

  // Stable reference to previous filters to prevent unnecessary updates
  const prevCompetitorFiltersRef = useRef(transformedFilters);
  const competitorFiltersChanged =
    JSON.stringify(prevCompetitorFiltersRef.current) !==
    JSON.stringify(transformedFilters);
  if (competitorFiltersChanged) {
    prevCompetitorFiltersRef.current = transformedFilters;
  }

  const cacheKey = `competitors_data_${selectedWebsiteId}_${JSON.stringify(
    prevCompetitorFiltersRef.current
  )}`;

  // Check cached data - remove unstable getFromCache dependency
  const cachedData = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<any>(cacheKey);
  }, [selectedWebsiteId, cacheKey]);

  const loadCompetitorsData = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) return;

      // Get current cache state
      const currentCachedData = getFromCache<any>(cacheKey);

      // Instant render from cache
      if (!forceRefresh && currentCachedData) {
        // Ensure cached data has the correct structure with analysisStatus
        const transformedCachedCompetitors = (
          currentCachedData.competitors || []
        ).map((competitor: any) => {
          // If already has analysisStatus, keep it; otherwise derive it
          if (competitor.analysisStatus) {
            return competitor;
          }
          const performance = (currentCachedData.performance || []).find(
            (p: any) => p.domain === competitor.competitor_domain
          );
          return {
            ...competitor,
            analysisStatus: performance ? "completed" : ("pending" as const),
            performance,
            addedAt: competitor.created_at || new Date().toISOString(),
          };
        });

        // Deduplicate cached competitors by ID to prevent React key conflicts
        const competitorsWithStatus = transformedCachedCompetitors.filter(
          (competitor: any, index: number, array: any[]) =>
            array.findIndex((c: any) => c.id === competitor.id) === index
        );

        setCompetitors(competitorsWithStatus);
        setPerformance(currentCachedData.performance);
        setAnalytics(currentCachedData.analytics);
        setIsLoading(false);
        return;
      }

      if (!currentCachedData) {
        setIsLoading(true);
      }

      try {
        // Use stable filter reference
        const currentFilters = prevCompetitorFiltersRef.current;
        const batchResponse = await batchAPI.loadCompetitorsPage(
          selectedWebsiteId,
          currentFilters
        );
        const data = batchResponse.data as any;

        // Transform competitors to include analysisStatus (like the old coordinated hook)
        const transformedCompetitors = (data.competitors || []).map(
          (competitor: any) => {
            const performance = (data.performance || []).find(
              (p: any) => p.domain === competitor.competitor_domain
            );
            return {
              ...competitor,
              analysisStatus: performance ? "completed" : ("pending" as const),
              performance,
              addedAt: competitor.created_at || new Date().toISOString(),
            };
          }
        );

        // Deduplicate competitors by ID to prevent React key conflicts
        const competitorsWithStatus = transformedCompetitors.filter(
          (competitor: any, index: number, array: any[]) =>
            array.findIndex((c: any) => c.id === competitor.id) === index
        );

        setCompetitors(competitorsWithStatus);
        setPerformance(data.performance || []);
        setAnalytics(data.analytics);

        // Cache competitors data with transformed structure
        const competitorsData = {
          competitors: competitorsWithStatus, // Use transformed data
          performance: data.performance || [],
          analytics: data.analytics,
          topics: data.topics || [], // Include topics for cross-page sharing
        };

        setCache(cacheKey, competitorsData, 10 * 60 * 1000); // 10 minutes cache
      } catch (error) {
        console.error("Failed to load competitors data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    },
    [selectedWebsiteId, cacheKey, getFromCache, setCache]
  );

  // Enhanced cache-first navigation for instant website switching - Competitors
  useEffect(() => {
    if (!selectedWebsiteId) {
      setCompetitors([]);
      setPerformance([]);
      setAnalytics(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check cache first before resetting any loading states
    const cachedData = getFromCache<any>(cacheKey);
    if (cachedData) {
      // We have cached data - use it immediately without showing loading
      const transformedCachedCompetitors = (
        cachedData.competitors || []
      ).map((competitor: any) => {
        // If already has analysisStatus, keep it; otherwise derive it
        if (competitor.analysisStatus) {
          return competitor;
        }
        const performance = (cachedData.performance || []).find(
          (p: any) => p.domain === competitor.competitor_domain
        );
        return {
          ...competitor,
          analysisStatus: performance ? "completed" : ("pending" as const),
          performance,
          addedAt: competitor.created_at || new Date().toISOString(),
        };
      });

      // Deduplicate cached competitors by ID to prevent React key conflicts
      const competitorsWithStatus = transformedCachedCompetitors.filter(
        (competitor: any, index: number, array: any[]) =>
          array.findIndex((c: any) => c.id === competitor.id) === index
      );

      setCompetitors(competitorsWithStatus);
      setPerformance(cachedData.performance || []);
      setAnalytics(cachedData.analytics);
      setIsLoading(false);
      setError(null);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Competitors: Using cached data for instant navigation", {
          websiteId: selectedWebsiteId,
          cachedCompetitors: competitorsWithStatus.length,
          cacheKey: cacheKey
        });
      }
      return;
    }

    // No cache found - set loading state and fetch fresh data
    setIsLoading(true);
    setError(null);
    loadCompetitorsData();
    
    if (process.env.NODE_ENV === "development") {
      console.log("Competitors: No cache found, loading fresh data", {
        websiteId: selectedWebsiteId,
        cacheKey: cacheKey
      });
    }
  }, [selectedWebsiteId, competitorFiltersChanged, cacheKey, getFromCache, loadCompetitorsData]);

  // Detect website changes and clear local state for smooth navigation
  const prevCompetitorsWebsiteIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const prevWebsiteId = prevCompetitorsWebsiteIdRef.current;
    prevCompetitorsWebsiteIdRef.current = selectedWebsiteId;

    // Only reset local state when actually switching to a different website, not on initial load
    if (
      prevWebsiteId &&
      selectedWebsiteId &&
      prevWebsiteId !== selectedWebsiteId
    ) {
      // Clear local state for loading transition (but preserve cache)
      setCompetitors([]);
      setPerformance([]);
      setAnalytics(null);
      setError(null);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Competitors: Website changed, clearing local state", {
          from: prevWebsiteId,
          to: selectedWebsiteId,
          note: "Cache preserved for future navigation"
        });
      }
    }
  }, [selectedWebsiteId]);

  return {
    // Data
    competitors,
    performance,
    analytics,
    topics, // Shared across pages

    // Loading states (optimized)
    isLoading: isLoading && !cachedData,

    // State
    error,

    // Actions
    refresh: () => loadCompetitorsData(true),

    // Filters
    filters,
    setFilters,

    // Cache status
    hasCachedData: !!cachedData,
  };
}
