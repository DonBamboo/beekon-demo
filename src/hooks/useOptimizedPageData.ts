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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);

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

  // Smart cache key strategy: base cache for website, filtered cache for specific filters
  const baseCacheKey = `analysis_results_${selectedWebsiteId}`;
  const filteredCacheKey = `analysis_filtered_${selectedWebsiteId}_${JSON.stringify(transformedFilters)}`;
  const metadataCacheKey = `analysis_metadata_${selectedWebsiteId}`;

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!selectedWebsiteId) return false;
    
    // Check filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<UIAnalysisResult[]>(filteredCacheKey);
    if (filteredCache && filteredCache.length > 0) {
      return true;
    }
    
    // Check base cache (unfiltered data for this website)
    const baseCache = getFromCache<UIAnalysisResult[]>(baseCacheKey);
    if (baseCache && baseCache.length > 0) {
      return true;
    }
    
    return false;
  }, [selectedWebsiteId, filteredCacheKey, baseCacheKey, getFromCache]);

  // Check multiple cache levels for instant rendering
  const getCachedData = useCallback(() => {
    if (!selectedWebsiteId) return null;
    
    // Priority 1: Try filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<UIAnalysisResult[]>(filteredCacheKey);
    if (filteredCache && filteredCache.length > 0) {
      return { data: filteredCache, source: 'filtered', key: filteredCacheKey };
    }
    
    // Priority 2: Try base cache (unfiltered data for this website)
    const baseCache = getFromCache<UIAnalysisResult[]>(baseCacheKey);
    if (baseCache && baseCache.length > 0) {
      return { data: baseCache, source: 'base', key: baseCacheKey };
    }
    
    return null;
  }, [selectedWebsiteId, filteredCacheKey, baseCacheKey, getFromCache]);

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

      // Check smart cache only if not forcing refresh
      if (!forceRefresh) {
        const cachedResult = getCachedData();
        if (cachedResult) {
          setAnalysisResults(cachedResult.data);
          setIsInitialLoad(false);
          setIsLoading(false);
          return;
        }
      }

      // No cache found or forcing refresh - fetch fresh data
      setIsLoading(true);
      setError(null);

      try {
        // Use current transformed filters (from ref for stability)
        const currentFilters = prevFiltersRef.current;

        // Use analysis service for consistent cursor-based pagination
        const response = await analysisService.getAnalysisResultsPaginated(
          selectedWebsiteId,
          {
            limit: 20,
            filters: currentFilters,
          }
        );

        // Update results with deduplication
        const results = deduplicateById(response.results);
        setAnalysisResults(results);
        setHasMore(response.hasMore);
        setCursor(response.nextCursor);

        // Smart caching strategy: Cache both base and filtered data
        // Base cache (for website switching)
        setCache(baseCacheKey, results, 10 * 60 * 1000); // 10 minutes cache
        
        // Filtered cache (for exact filter match)
        setCache(filteredCacheKey, results, 5 * 60 * 1000); // 5 minutes cache
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
      baseCacheKey,
      filteredCacheKey,
      getCachedData,
      setCache,
    ]
  );

  // Load more results for infinite scroll
  const loadMoreResults = useCallback(async () => {
    if (!selectedWebsiteId || isLoadingMore || !hasMore || !cursor) return;

    setIsLoadingMore(true);
    try {
      // Use stable filter reference for pagination
      const currentFilters = prevFiltersRef.current;
      const additionalResults =
        await analysisService.getAnalysisResultsPaginated(selectedWebsiteId, {
          cursor,
          limit: 20,
          filters: currentFilters,
        });

      // Deduplicate results to prevent duplicate keys
      const combinedResults = [
        ...analysisResults,
        ...additionalResults.results,
      ];
      const newResults = deduplicateById(combinedResults);
      setAnalysisResults(newResults);
      setHasMore(additionalResults.hasMore);
      setCursor(additionalResults.nextCursor);

      // Update cache with deduplicated results (both base and filtered cache)
      setCache(baseCacheKey, newResults, 10 * 60 * 1000);
      setCache(filteredCacheKey, newResults, 5 * 60 * 1000);
    } catch (error) {
      console.error("Failed to load more results:", error);
      setError(
        error instanceof Error ? error : new Error("Failed to load more")
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    selectedWebsiteId,
    cursor,
    analysisResults,
    hasMore,
    isLoadingMore,
    setCache,
    baseCacheKey,
    filteredCacheKey,
  ]);

  // Smart cache-first navigation for instant website switching
  useEffect(() => {
    if (!selectedWebsiteId) {
      setAnalysisResults([]);
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsInitialLoad(false);
      setError(null);
      setHasMore(true);
      setCursor(null);
      return;
    }

    // Check cache hierarchy: filtered cache > base cache > fresh fetch
    const cachedResult = getCachedData();
    if (cachedResult) {
      // We have cached data - use it immediately without showing loading
      setAnalysisResults(cachedResult.data);
      setIsInitialLoad(false);
      setIsLoading(false);
      setError(null);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Analysis: Using cached data for instant navigation", {
          websiteId: selectedWebsiteId,
          cachedResults: cachedResult.data.length,
          source: cachedResult.source,
          cacheKey: cachedResult.key
        });
      }
      return;
    }

    // No cache found - set loading state and fetch fresh data
    setIsLoading(true);
    setIsLoadingMore(false); // Reset pagination state when loading fresh data for new website
    setCursor(null); // Reset cursor for fresh data load
    setError(null);
    loadAnalysisData();
    
    if (process.env.NODE_ENV === "development") {
      console.log("Analysis: No cache found, loading fresh data", {
        websiteId: selectedWebsiteId,
        baseCacheKey,
        filteredCacheKey
      });
    }
  }, [selectedWebsiteId, getCachedData, loadAnalysisData, baseCacheKey, filteredCacheKey]);

  // Separate effect for filter changes - preserves website cache, only reloads if no filtered cache
  useEffect(() => {
    // Only handle filter changes if we have a website selected and filters actually changed
    if (!selectedWebsiteId || !filtersChanged) return;

    // Check if we have filtered cache for these specific filters
    const filteredCache = getFromCache<UIAnalysisResult[]>(filteredCacheKey);
    if (filteredCache && filteredCache.length > 0) {
      // We have cache for these exact filters - use it immediately
      setAnalysisResults(filteredCache);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Analysis: Using filtered cache for filter change", {
          websiteId: selectedWebsiteId,
          filteredResults: filteredCache.length,
          filteredCacheKey
        });
      }
      return;
    }

    // No filtered cache found - need to reload with new filters
    if (process.env.NODE_ENV === "development") {
      console.log("Analysis: No filtered cache, reloading with new filters", {
        websiteId: selectedWebsiteId,
        filters: transformedFilters,
        filteredCacheKey
      });
    }
    
    setIsLoading(true);
    setIsLoadingMore(false); // Reset pagination state when loading fresh data due to filter change
    setCursor(null); // Reset cursor for fresh filtered data load
    setError(null);
    loadAnalysisData();
  }, [filtersChanged, selectedWebsiteId, filteredCacheKey, getFromCache, transformedFilters, loadAnalysisData]);

  return {
    // Data
    analysisResults,
    topics,
    llmProviders,

    // Loading states (optimized - only show when no cache)
    isLoading: isLoading && !hasSyncCache(),
    isLoadingMore, // Always show pagination loading regardless of cache
    isInitialLoad: isInitialLoad && !hasSyncCache(),
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
    hasCachedData: !!getCachedData(),
    hasSyncCache,
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

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!selectedWebsiteId) return false;
    const cached = getFromCache<any>(cacheKey);
    return !!(cached && (cached.metrics || cached.timeSeriesData?.length > 0 || cached.topicPerformance?.length > 0));
  }, [selectedWebsiteId, cacheKey, getFromCache]);

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
    isLoading: isLoading && !hasSyncCache(),
    
    // State
    error,

    // Actions
    refresh: () => loadDashboardData(true),

    // Filters
    filters,
    setFilters,

    // Cache status
    hasCachedData: !!cachedData,
    hasSyncCache,
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

  // Smart cache key strategy: base cache for website, filtered cache for specific filters
  const competitorsBaseCacheKey = `competitors_data_${selectedWebsiteId}`;
  const competitorsFilteredCacheKey = `competitors_filtered_${selectedWebsiteId}_${JSON.stringify(
    prevCompetitorFiltersRef.current
  )}`;

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!selectedWebsiteId) return false;
    
    // Check filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<any>(competitorsFilteredCacheKey);
    if (filteredCache && (filteredCache.competitors?.length > 0 || filteredCache.performance?.length > 0)) {
      return true;
    }
    
    // Check base cache (unfiltered data for this website)
    const baseCache = getFromCache<any>(competitorsBaseCacheKey);
    if (baseCache && (baseCache.competitors?.length > 0 || baseCache.performance?.length > 0)) {
      return true;
    }
    
    return false;
  }, [selectedWebsiteId, competitorsFilteredCacheKey, competitorsBaseCacheKey, getFromCache]);

  // Check multiple cache levels for instant rendering
  const getCompetitorsCachedData = useCallback(() => {
    if (!selectedWebsiteId) return null;
    
    // Priority 1: Try filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<any>(competitorsFilteredCacheKey);
    if (filteredCache && (filteredCache.competitors?.length > 0 || filteredCache.performance?.length > 0)) {
      return { data: filteredCache, source: 'filtered', key: competitorsFilteredCacheKey };
    }
    
    // Priority 2: Try base cache (unfiltered data for this website)
    const baseCache = getFromCache<any>(competitorsBaseCacheKey);
    if (baseCache && (baseCache.competitors?.length > 0 || baseCache.performance?.length > 0)) {
      return { data: baseCache, source: 'base', key: competitorsBaseCacheKey };
    }
    
    return null;
  }, [selectedWebsiteId, competitorsFilteredCacheKey, competitorsBaseCacheKey, getFromCache]);

  const loadCompetitorsData = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) return;

      // Check smart cache only if not forcing refresh
      if (!forceRefresh) {
        const cachedResult = getCompetitorsCachedData();
        if (cachedResult) {
          const currentCachedData = cachedResult.data;
          
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
          setPerformance(currentCachedData.performance || []);
          setAnalytics(currentCachedData.analytics);
          setIsLoading(false);
          
          if (process.env.NODE_ENV === "development") {
            console.log("Competitors: Using cached data for instant navigation", {
              websiteId: selectedWebsiteId,
              cachedCompetitors: competitorsWithStatus.length,
              source: cachedResult.source,
              cacheKey: cachedResult.key
            });
          }
          return;
        }
      }

      // No cache found or forcing refresh - fetch fresh data
      setIsLoading(true);
      setError(null);

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

        // Smart caching strategy: Cache both base and filtered data
        const competitorsData = {
          competitors: competitorsWithStatus, // Use transformed data
          performance: data.performance || [],
          analytics: data.analytics,
          topics: data.topics || [], // Include topics for cross-page sharing
        };

        // Base cache (for website switching)
        setCache(competitorsBaseCacheKey, competitorsData, 10 * 60 * 1000); // 10 minutes cache
        
        // Filtered cache (for exact filter match)
        setCache(competitorsFilteredCacheKey, competitorsData, 5 * 60 * 1000); // 5 minutes cache
      } catch (error) {
        console.error("Failed to load competitors data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    },
    [
      selectedWebsiteId, 
      competitorsBaseCacheKey, 
      competitorsFilteredCacheKey, 
      getCompetitorsCachedData, 
      setCache
    ]
  );

  // Smart cache-first navigation for instant website switching - Competitors
  useEffect(() => {
    if (!selectedWebsiteId) {
      setCompetitors([]);
      setPerformance([]);
      setAnalytics(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check cache hierarchy: filtered cache > base cache > fresh fetch
    const cachedResult = getCompetitorsCachedData();
    if (cachedResult) {
      const cachedData = cachedResult.data;
      
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
          source: cachedResult.source,
          cacheKey: cachedResult.key
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
        baseCacheKey: competitorsBaseCacheKey,
        filteredCacheKey: competitorsFilteredCacheKey
      });
    }
  }, [selectedWebsiteId, getCompetitorsCachedData, loadCompetitorsData, competitorsBaseCacheKey, competitorsFilteredCacheKey]);

  // Separate effect for competitor filter changes - preserves website cache, only reloads if no filtered cache
  useEffect(() => {
    // Only handle filter changes if we have a website selected and filters actually changed
    if (!selectedWebsiteId || !competitorFiltersChanged) return;

    // Check if we have filtered cache for these specific filters
    const filteredCache = getFromCache<any>(competitorsFilteredCacheKey);
    if (filteredCache && (filteredCache.competitors?.length > 0 || filteredCache.performance?.length > 0)) {
      // We have cache for these exact filters - use it immediately
      const transformedCachedCompetitors = (
        filteredCache.competitors || []
      ).map((competitor: any) => {
        // If already has analysisStatus, keep it; otherwise derive it
        if (competitor.analysisStatus) {
          return competitor;
        }
        const performance = (filteredCache.performance || []).find(
          (p: any) => p.domain === competitor.competitor_domain
        );
        return {
          ...competitor,
          analysisStatus: performance ? "completed" : ("pending" as const),
          performance,
          addedAt: competitor.created_at || new Date().toISOString(),
        };
      });

      const competitorsWithStatus = transformedCachedCompetitors.filter(
        (competitor: any, index: number, array: any[]) =>
          array.findIndex((c: any) => c.id === competitor.id) === index
      );

      setCompetitors(competitorsWithStatus);
      setPerformance(filteredCache.performance || []);
      setAnalytics(filteredCache.analytics);
      setIsLoading(false);
      setError(null);
      
      if (process.env.NODE_ENV === "development") {
        console.log("Competitors: Using filtered cache for filter change", {
          websiteId: selectedWebsiteId,
          filteredCompetitors: competitorsWithStatus.length,
          competitorsFilteredCacheKey
        });
      }
      return;
    }

    // No filtered cache found - need to reload with new filters
    if (process.env.NODE_ENV === "development") {
      console.log("Competitors: No filtered cache, reloading with new filters", {
        websiteId: selectedWebsiteId,
        filters: transformedFilters,
        competitorsFilteredCacheKey
      });
    }
    
    setIsLoading(true);
    setError(null);
    loadCompetitorsData();
  }, [competitorFiltersChanged, selectedWebsiteId, competitorsFilteredCacheKey, getFromCache, transformedFilters, loadCompetitorsData]);

  return {
    // Data
    competitors,
    performance,
    analytics,
    topics, // Shared across pages

    // Loading states (optimized)
    isLoading: isLoading && !hasSyncCache(),

    // State
    error,

    // Actions
    refresh: () => loadCompetitorsData(true),

    // Filters
    filters,
    setFilters,

    // Cache status
    hasCachedData: !!getCompetitorsCachedData(),
    hasSyncCache,
  };
}
