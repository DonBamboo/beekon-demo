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
} from "@/hooks/appStateHooks";
import { useWorkspace } from "@/hooks/useWorkspace";
import type {
  CompetitorFilters,
  AnalysisFilters as UIAnalysisFilters,
  DashboardFilters,
} from "@/contexts/AppStateContext";
import type { AnalysisFilters } from "@/hooks/useAnalysisQuery";
import { useWebsiteData } from "./useSharedData";
import { batchAPI } from "@/services/batchService";
import { analysisService } from "@/services/analysisService";
import {
  dashboardService,
  type DashboardMetrics as ServiceDashboardMetrics,
} from "@/services/dashboardService";
import { deduplicateById } from "@/lib/utils";
import type { UIAnalysisResult } from "@/types/database";
import { normalizeCompetitorStatus } from "@/utils/competitorStatusUtils";

// Type interfaces for competitor data
interface Competitor {
  id: string;
  competitor_domain: string;
  name?: string;
  [key: string]: unknown;
}

interface CompetitorProfile {
  domain: string;
  name?: string;
  [key: string]: unknown;
}

interface TimeSeriesDataPoint {
  [key: string]: unknown;
}

interface TopicPerformanceData {
  [key: string]: unknown;
}

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

  // Refs to store latest functions and prevent infinite loops
  const loadAnalysisDataRef = useRef<
    ((forceRefresh?: boolean) => Promise<void>) | null
  >(null);
  const isLoadingAnalysisRef = useRef(false);

  // Transform filters from global state format to service-expected format
  const transformedFilters = useMemo((): AnalysisFilters => {
    const uiFilters = filters as UIAnalysisFilters;
    const serviceFilters: AnalysisFilters = {};

    // Map UI filters to service filters
    if (uiFilters.topic) serviceFilters.topic = uiFilters.topic;
    if (uiFilters.llm) serviceFilters.llmProvider = uiFilters.llm;
    if (uiFilters.searchQuery)
      serviceFilters.searchQuery = uiFilters.searchQuery;

    // Transform dateRange from string to object format expected by services
    if (uiFilters.dateRange && uiFilters.dateRange !== "all") {
      const days = parseInt(uiFilters.dateRange.replace("d", ""));
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      serviceFilters.dateRange = {
        start: startDate.toISOString(),
        end: now.toISOString(),
      };
    }

    return serviceFilters;
  }, [filters]);

  // Smart cache key strategy: base cache for website, filtered cache for specific filters
  const baseCacheKey = `analysis_results_${selectedWebsiteId}`;
  const filteredCacheKey = `analysis_filtered_${selectedWebsiteId}_${JSON.stringify(
    transformedFilters
  )}`;

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
      return { data: filteredCache, source: "filtered", key: filteredCacheKey };
    }

    // Priority 2: Try base cache (unfiltered data for this website)
    const baseCache = getFromCache<UIAnalysisResult[]>(baseCacheKey);
    if (baseCache && baseCache.length > 0) {
      return { data: baseCache, source: "base", key: baseCacheKey };
    }

    return null;
  }, [selectedWebsiteId, filteredCacheKey, baseCacheKey, getFromCache]);

  // Stable reference to previous filters to prevent unnecessary updates
  const prevFiltersRef = useRef<AnalysisFilters>(transformedFilters);
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

      // Prevent concurrent analysis data loading
      if (isLoadingAnalysisRef.current && !forceRefresh) {
        return;
      }

      isLoadingAnalysisRef.current = true;

      try {
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

          // OPTIMIZED: Use materialized view service for lightning-fast pagination
          const response =
            await analysisService.getAnalysisResultsPaginatedOptimized(
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
          // Failed to load analysis data
          setError(error instanceof Error ? error : new Error("Unknown error"));
        } finally {
          setIsLoading(false);
          setIsInitialLoad(false);
          isLoadingAnalysisRef.current = false;
        }
      } catch (error) {
        // Failed to load analysis data
        setError(error instanceof Error ? error : new Error("Unknown error"));
        setIsLoading(false);
        setIsInitialLoad(false);
        isLoadingAnalysisRef.current = false;
      }
    },
    [selectedWebsiteId, baseCacheKey, filteredCacheKey, getCachedData, setCache]
  );

  // Store the latest loadAnalysisData function in ref to break dependency chain
  useEffect(() => {
    loadAnalysisDataRef.current = loadAnalysisData;
  }, [loadAnalysisData]);

  // Load more results for infinite scroll
  const loadMoreResults = useCallback(async () => {
    if (!selectedWebsiteId || isLoadingMore || !hasMore || !cursor) {
      return;
    }

    setIsLoadingMore(true);
    try {
      // Use stable filter reference for pagination
      const currentFilters = prevFiltersRef.current;

      const additionalResults =
        await analysisService.getAnalysisResultsPaginatedOptimized(
          selectedWebsiteId,
          {
            cursor,
            limit: 20,
            filters: currentFilters,
          }
        );

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
      // Failed to load more results
      console.error("❌ loadMoreResults error:", error);
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

      // Using cached data for instant navigation
      return;
    }

    // No cache found - set loading state and fetch fresh data
    setIsLoading(true);
    setIsLoadingMore(false); // Reset pagination state when loading fresh data for new website
    setCursor(null); // Reset cursor for fresh data load
    setError(null);
    if (loadAnalysisDataRef.current) {
      loadAnalysisDataRef.current();
    }

    // No cache found, loading fresh data
  }, [selectedWebsiteId, getCachedData, baseCacheKey, filteredCacheKey]); // Removed loadAnalysisData dependency

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

      // Using filtered cache for filter change
      return;
    }

    // No filtered cache found - need to reload with new filters
    // No filtered cache, reloading with new filters

    setIsLoading(true);
    setIsLoadingMore(false); // Reset pagination state when loading fresh data due to filter change
    setCursor(null); // Reset cursor for fresh filtered data load
    setError(null);
    if (loadAnalysisDataRef.current) {
      loadAnalysisDataRef.current();
    }
  }, [
    filtersChanged,
    selectedWebsiteId,
    filteredCacheKey,
    getFromCache,
    transformedFilters,
  ]); // Removed loadAnalysisData dependency

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
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { filters, setFilters } = usePageFilters("dashboard");
  const { getFromCache, setCache } = useAppState();

  // State for dashboard data
  const [metrics, setMetrics] = useState<ServiceDashboardMetrics | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>(
    []
  );
  const [topicPerformance, setTopicPerformance] = useState<
    TopicPerformanceData[]
  >([]);
  const [error, setError] = useState<Error | null>(null);

  // Initialize loading state based on workspace loading state
  const [isLoading, setIsLoading] = useState(workspaceLoading);

  // Refs to store latest functions and prevent infinite loops
  const loadDashboardDataRef = useRef<
    ((forceRefresh?: boolean) => Promise<void>) | null
  >(null);
  const isLoadingDashboardRef = useRef(false);

  // Calculate website IDs from all workspace websites
  const websiteIds = useMemo(
    () => websites?.map((w) => w.id) || [],
    [websites]
  );

  // Transform dashboard filters if needed
  const transformedFilters = useMemo(() => {
    const typedFilters = filters as DashboardFilters;
    const baseFilters = { ...typedFilters };
    // Dashboard filters are simpler, just ensure period is handled correctly
    return baseFilters;
  }, [filters]);

  const cacheKey = `dashboard_data_${websiteIds.join(",")}_${
    transformedFilters.period
  }`;

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (websiteIds.length === 0) return false;
    const cached = getFromCache<Record<string, unknown>>(cacheKey);
    return !!(
      cached &&
      (cached.metrics ||
        (Array.isArray(cached.timeSeriesData) &&
          cached.timeSeriesData.length > 0) ||
        (Array.isArray(cached.topicPerformance) &&
          cached.topicPerformance.length > 0))
    );
  }, [websiteIds.length, cacheKey, getFromCache]);

  // Check cached data - remove unstable getFromCache dependency
  const cachedData = useMemo(() => {
    if (websiteIds.length === 0) return null;
    return getFromCache<Record<string, unknown>>(cacheKey);
  }, [websiteIds.length, cacheKey, getFromCache]);

  const loadDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (workspaceLoading || websiteIds.length === 0) return;

      // Prevent concurrent dashboard data loading
      if (isLoadingDashboardRef.current && !forceRefresh) {
        return;
      }

      isLoadingDashboardRef.current = true;

      // Get current cache state
      const currentCachedData = getFromCache<Record<string, unknown>>(cacheKey);

      // Instant render from cache
      if (!forceRefresh && currentCachedData) {
        setMetrics(currentCachedData.metrics as ServiceDashboardMetrics);
        setTimeSeriesData(
          currentCachedData.timeSeriesData as TimeSeriesDataPoint[]
        );
        setTopicPerformance(
          currentCachedData.topicPerformance as TopicPerformanceData[]
        );
        setIsLoading(false);
        return;
      }

      // Show loading only if no cached data
      if (!currentCachedData) {
        setIsLoading(true);
      }

      try {
        // FIXED: Dashboard service now uses all workspace websites
        const [metrics, timeSeriesData, topicPerformance] = await Promise.all([
          dashboardService.getDashboardMetrics(
            websiteIds,
            transformedFilters.dateRange
          ),
          dashboardService.getTimeSeriesData(
            websiteIds,
            transformedFilters.period || "7d"
          ),
          dashboardService.getTopicPerformance(websiteIds, 10),
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
        };

        setCache(cacheKey, dashboardData, 10 * 60 * 1000); // 10 minutes cache
      } catch (error) {
        // Failed to load dashboard data
        setError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
        isLoadingDashboardRef.current = false;
      }
    },
    [
      websiteIds,
      workspaceLoading,
      transformedFilters.dateRange,
      transformedFilters.period,
      getFromCache,
      setCache,
      cacheKey,
    ]
  );

  // Store the latest loadDashboardData function in ref to break dependency chain
  useEffect(() => {
    loadDashboardDataRef.current = loadDashboardData;
  }, [loadDashboardData]);

  // Handle initial loading state and cached data
  useEffect(() => {
    if (workspaceLoading || websiteIds.length === 0) {
      setIsLoading(false);
      return;
    }

    const currentCachedData = getFromCache<Record<string, unknown>>(cacheKey);
    if (currentCachedData) {
      // We have cached data, use it immediately and stop loading
      setMetrics(currentCachedData.metrics as ServiceDashboardMetrics | null);
      setTimeSeriesData(
        currentCachedData.timeSeriesData as TimeSeriesDataPoint[]
      );
      setTopicPerformance(
        currentCachedData.topicPerformance as TopicPerformanceData[]
      );
      setIsLoading(false);
    } else {
      // No cached data, ensure loading state is true and load data
      setIsLoading(true);
      if (loadDashboardDataRef.current) {
        loadDashboardDataRef.current();
      }
    }
  }, [workspaceLoading, websiteIds.length, cacheKey, getFromCache]); // Removed loadDashboardData dependency

  // Filter change detection for dashboard
  const prevDashboardFiltersRef = useRef<DashboardFilters>(transformedFilters);
  const dashboardFiltersChanged =
    JSON.stringify(prevDashboardFiltersRef.current) !==
    JSON.stringify(transformedFilters);
  if (dashboardFiltersChanged) {
    prevDashboardFiltersRef.current = transformedFilters;
  }

  // Separate effect for dashboard filter changes - reloads when period changes
  useEffect(() => {
    // Only handle filter changes if we have websites and filters actually changed
    if (websiteIds.length === 0 || !dashboardFiltersChanged) return;

    // Check if we have cached data for these specific filters
    const currentCachedData = getFromCache<Record<string, unknown>>(cacheKey);
    if (currentCachedData) {
      // We have cache for these exact filters - use it immediately
      setMetrics(currentCachedData.metrics as ServiceDashboardMetrics | null);
      setTimeSeriesData(
        currentCachedData.timeSeriesData as TimeSeriesDataPoint[]
      );
      setTopicPerformance(
        currentCachedData.topicPerformance as TopicPerformanceData[]
      );
      setIsLoading(false);
      setError(null);
      return;
    }

    // No cached data found - need to reload with new filters
    setIsLoading(true);
    setError(null);
    if (loadDashboardDataRef.current) {
      loadDashboardDataRef.current();
    }
  }, [
    dashboardFiltersChanged,
    websiteIds.length,
    cacheKey,
    getFromCache,
    transformedFilters,
  ]);

  // Detect website changes and reload data immediately
  const { clearCache: clearDashboardCache } = useAppState();
  const prevWebsiteIdsRef = React.useRef<string[]>([]);
  useEffect(() => {
    const prevWebsiteIds = prevWebsiteIdsRef.current;
    const currentWebsiteIds = [...websiteIds];
    prevWebsiteIdsRef.current = currentWebsiteIds;

    // Only reload when the website list actually changes, not on initial load
    if (
      prevWebsiteIds.length > 0 &&
      (prevWebsiteIds.length !== currentWebsiteIds.length ||
        !prevWebsiteIds.every((id) => currentWebsiteIds.includes(id)))
    ) {
      // Website list changed, reloading data immediately

      // Clear local state first to prevent showing stale data
      setMetrics(null);
      setTimeSeriesData([]);
      setTopicPerformance([]);
      setError(null);

      // Always reload data immediately
      if (loadDashboardDataRef.current) {
        loadDashboardDataRef.current(true);
      }

      // Clear global cache for the previous website list
      clearDashboardCache(`dashboard_data_${prevWebsiteIds.join(",")}`);
    }
  }, [websiteIds, clearDashboardCache]);

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
  const { filters, setFilters } =
    usePageFilters<CompetitorFilters>("competitors");
  const { getFromCache, setCache, clearCache } = useAppState();

  // Use shared topics data
  const { topics } = useWebsiteData(selectedWebsiteId);

  // State for competitors data
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [performance, setPerformance] = useState<CompetitorProfile[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(!!selectedWebsiteId);
  const [error, setError] = useState<Error | null>(null);

  // Refs to store latest functions and prevent infinite loops
  const loadCompetitorsDataRef = useRef<
    ((forceRefresh?: boolean) => Promise<void>) | null
  >(null);
  const isLoadingCompetitorsRef = useRef(false);

  // Transform competitors filters from global state format to service format
  const transformedFilters = useMemo(() => {
    const typedFilters = filters as CompetitorFilters;
    const baseFilters = { ...typedFilters };

    // Transform dateFilter to dateRange
    const days = parseInt(typedFilters.dateFilter.replace("d", ""));
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    baseFilters.dateRange = {
      start: startDate.toISOString(),
      end: now.toISOString(),
    };
    delete (baseFilters as Record<string, unknown>).dateFilter;

    return baseFilters;
  }, [filters]);

  // IMPROVED: Stable reference to previous original filters for comparison
  const prevCompetitorFiltersRef = useRef(filters as CompetitorFilters);

  // CRITICAL FIX: Compare original filter values instead of dynamic date ranges
  // This avoids the problem where date ranges are recalculated on every render
  const competitorFiltersChanged = useMemo(() => {
    const prevOriginal = prevCompetitorFiltersRef.current;
    const currentOriginal = filters as CompetitorFilters;

    // Compare original filter string values instead of calculated dates
    const dateFilterChanged =
      prevOriginal.dateFilter !== currentOriginal.dateFilter;
    const sortByChanged = prevOriginal.sortBy !== currentOriginal.sortBy;
    const sortOrderChanged =
      prevOriginal.sortOrder !== currentOriginal.sortOrder;

    const hasChanged = dateFilterChanged || sortByChanged || sortOrderChanged;

    return hasChanged;
  }, [filters]); // Use original filters as dependency, not transformed ones

  // Update the ref only when filters actually change
  if (competitorFiltersChanged) {
    prevCompetitorFiltersRef.current = filters as CompetitorFilters;
  }

  // Smart cache key strategy: base cache for website, filtered cache for specific filters
  const competitorsBaseCacheKey = `competitors_data_${selectedWebsiteId}`;
  // Create stable cache key based on meaningful filter values only
  const createCacheKey = useCallback(
    (filters: CompetitorFilters | null) => {
      if (!selectedWebsiteId) return "";

      // Extract only the meaningful filter values that affect data
      const dateFilter = filters?.dateFilter || "all";
      const sortBy = filters?.sortBy || "shareOfVoice";
      const sortOrder = filters?.sortOrder || "desc";

      // Create deterministic key without full object serialization
      return `competitors_filtered_${selectedWebsiteId}_${dateFilter}_${sortBy}_${sortOrder}`;
    },
    [selectedWebsiteId]
  );

  // FIXED: Use current transformed filters for cache key generation instead of previous ref
  // This ensures cache keys reflect the latest filter changes immediately
  const competitorsFilteredCacheKey = createCacheKey(
    filters as CompetitorFilters
  );

  // VALIDATION: Ensure all cache keys are properly formed and contain website ID
  const validateCacheKey = useCallback(
    (key: string, context: string) => {
      if (!key) {
        console.error(`🚨 Invalid cache key (empty) in context: ${context}`);
        return false;
      }
      if (!key.includes(selectedWebsiteId || "")) {
        console.error(
          `🚨 Cache key missing website ID in context: ${context}`,
          { key, expectedWebsiteId: selectedWebsiteId }
        );
        return false;
      }
      return true;
    },
    [selectedWebsiteId]
  );

  // SYNCHRONIZATION: Ensure all cache operations use synchronized keys
  const getSynchronizedCacheKeys = useCallback(() => {
    const baseCacheKey = `competitors_data_${selectedWebsiteId}`;
    const filteredCacheKey = createCacheKey(filters as CompetitorFilters);

    // Validate keys before returning
    if (!validateCacheKey(baseCacheKey, "base cache key generation")) {
      throw new Error("Invalid base cache key generated");
    }
    if (!validateCacheKey(filteredCacheKey, "filtered cache key generation")) {
      throw new Error("Invalid filtered cache key generated");
    }

    return { baseCacheKey, filteredCacheKey };
  }, [selectedWebsiteId, filters, createCacheKey, validateCacheKey]);

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!selectedWebsiteId) return false;

    // Check filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<Record<string, unknown>>(
      competitorsFilteredCacheKey
    );
    const filteredCompetitors = Array.isArray(filteredCache?.competitors)
      ? filteredCache.competitors
      : [];
    const filteredPerformance = Array.isArray(filteredCache?.performance)
      ? filteredCache.performance
      : [];
    if (
      filteredCache &&
      (filteredCompetitors.length > 0 || filteredPerformance.length > 0)
    ) {
      return true;
    }

    // Check base cache (unfiltered data for this website)
    const baseCache = getFromCache<Record<string, unknown>>(
      competitorsBaseCacheKey
    );
    const baseCompetitors = Array.isArray(baseCache?.competitors)
      ? baseCache.competitors
      : [];
    const basePerformance = Array.isArray(baseCache?.performance)
      ? baseCache.performance
      : [];
    if (
      baseCache &&
      (baseCompetitors.length > 0 || basePerformance.length > 0)
    ) {
      return true;
    }

    return false;
  }, [
    selectedWebsiteId,
    competitorsFilteredCacheKey,
    competitorsBaseCacheKey,
    getFromCache,
  ]);

  // Check multiple cache levels for instant rendering
  const getCompetitorsCachedData = useCallback(() => {
    if (!selectedWebsiteId) return null;

    // CRITICAL FIX: Always use current cache keys instead of potentially stale ones
    // Generate cache keys dynamically using current filter state
    const currentFilteredCacheKey = createCacheKey(
      filters as CompetitorFilters
    );
    const currentBaseCacheKey = `competitors_data_${selectedWebsiteId}`;

    // Website validation: Ensure cache keys match current website to prevent cross-contamination
    if (
      !currentFilteredCacheKey.includes(selectedWebsiteId) ||
      !currentBaseCacheKey.includes(selectedWebsiteId)
    ) {
      console.warn(
        "🚨 Cache key website mismatch detected, returning null to force fresh fetch"
      );
      return null;
    }

    // Priority 1: Try filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<Record<string, unknown>>(
      currentFilteredCacheKey
    );
    const filteredCompetitors = Array.isArray(filteredCache?.competitors)
      ? filteredCache.competitors
      : [];
    const filteredPerformance = Array.isArray(filteredCache?.performance)
      ? filteredCache.performance
      : [];
    if (
      filteredCache &&
      (filteredCompetitors.length > 0 || filteredPerformance.length > 0)
    ) {
      // CROSS-WEBSITE PREVENTION: Validate cached data belongs to current website
      const isValidCacheForWebsite = filteredCompetitors.every(
        (competitor: Competitor) => {
          const isFromCurrentWebsite =
            competitor.website_id === selectedWebsiteId;
          if (!isFromCurrentWebsite) {
            console.warn(
              "🚨 Cross-website contamination detected in filtered cache:",
              {
                competitorId: competitor.id,
                competitorWebsiteId: competitor.website_id,
                currentWebsiteId: selectedWebsiteId,
              }
            );
          }
          return isFromCurrentWebsite;
        }
      );

      if (!isValidCacheForWebsite) {
        console.warn(
          "🧹 Clearing contaminated filtered cache for website protection"
        );
        clearCache(currentFilteredCacheKey);
        return null;
      }

      return {
        data: filteredCache,
        source: "filtered",
        key: currentFilteredCacheKey,
      };
    }

    // Priority 2: Try base cache (unfiltered data for this website)
    const baseCache =
      getFromCache<Record<string, unknown>>(currentBaseCacheKey);
    const baseCompetitors = Array.isArray(baseCache?.competitors)
      ? baseCache.competitors
      : [];
    const basePerformance = Array.isArray(baseCache?.performance)
      ? baseCache.performance
      : [];
    if (
      baseCache &&
      (baseCompetitors.length > 0 || basePerformance.length > 0)
    ) {
      // CROSS-WEBSITE PREVENTION: Validate base cached data belongs to current website
      const isValidBaseCacheForWebsite = baseCompetitors.every(
        (competitor: Competitor) => {
          const isFromCurrentWebsite =
            competitor.website_id === selectedWebsiteId;
          if (!isFromCurrentWebsite) {
            console.warn(
              "🚨 Cross-website contamination detected in base cache:",
              {
                competitorId: competitor.id,
                competitorWebsiteId: competitor.website_id,
                currentWebsiteId: selectedWebsiteId,
              }
            );
          }
          return isFromCurrentWebsite;
        }
      );

      if (!isValidBaseCacheForWebsite) {
        console.warn(
          "🧹 Clearing contaminated base cache for website protection"
        );
        clearCache(currentBaseCacheKey);
        return null;
      }

      return { data: baseCache, source: "base", key: currentBaseCacheKey };
    }

    return null;
  }, [selectedWebsiteId, filters, createCacheKey, getFromCache, clearCache]);

  const loadCompetitorsData = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) return;

      // Prevent concurrent competitors data loading
      if (isLoadingCompetitorsRef.current && !forceRefresh) {
        return;
      }

      isLoadingCompetitorsRef.current = true;

      try {
        // Check smart cache only if not forcing refresh
        if (!forceRefresh) {
          const cachedResult = getCompetitorsCachedData();
          if (cachedResult) {
            const currentCachedData = cachedResult.data;

            // Ensure cached data has the correct structure with analysisStatus
            const cachedCompetitors = Array.isArray(
              currentCachedData.competitors
            )
              ? currentCachedData.competitors
              : [];

            // Validate and filter cached competitors
            const validCachedCompetitors = cachedCompetitors.filter(
              (competitor: Competitor) => {
                const isValid =
                  competitor.id &&
                  (competitor.competitor_domain || competitor.name);
                if (!isValid) {
                  console.warn(
                    "Invalid cached competitor data found:",
                    competitor
                  );
                }
                return isValid;
              }
            );

            const transformedCachedCompetitors = validCachedCompetitors.map(
              (competitor: Competitor) => {
                // FIXED: Use database status directly from performance data instead of deriving
                const cachedPerformance = Array.isArray(
                  currentCachedData.performance
                )
                  ? currentCachedData.performance
                  : [];
                const performance = cachedPerformance.find(
                  (p: CompetitorProfile & { analysisStatus?: string }) =>
                    p.domain === competitor.competitor_domain
                );

                return {
                  ...competitor,
                  // FIXED: Use normalized status mapping with proper fallback logic
                  analysisStatus: normalizeCompetitorStatus(
                    performance?.analysisStatus ||
                      competitor.analysisStatus ||
                      competitor.analysis_status
                  ),
                  performance,
                  addedAt: competitor.created_at || new Date().toISOString(),
                };
              }
            );

            // Deduplicate cached competitors by ID to prevent React key conflicts
            const competitorsWithStatus = transformedCachedCompetitors.filter(
              (competitor: Competitor, index: number, array: Competitor[]) =>
                array.findIndex((c: Competitor) => c.id === competitor.id) ===
                index
            );

            setCompetitors(competitorsWithStatus);
            const performanceData = Array.isArray(currentCachedData.performance)
              ? currentCachedData.performance
              : [];
            setPerformance(performanceData);

            // Validate and ensure cached analytics data structure has required arrays
            const analyticsData = currentCachedData.analytics as Record<
              string,
              unknown
            > | null;
            const validatedAnalytics = analyticsData
              ? {
                  ...analyticsData,
                  insights: Array.isArray(analyticsData.insights)
                    ? analyticsData.insights
                    : [],
                  shareOfVoiceData: Array.isArray(
                    analyticsData.shareOfVoiceData
                  )
                    ? analyticsData.shareOfVoiceData
                    : [],
                  marketShareData: Array.isArray(analyticsData.marketShareData)
                    ? analyticsData.marketShareData
                    : [],
                  timeSeriesData: Array.isArray(analyticsData.timeSeriesData)
                    ? analyticsData.timeSeriesData
                    : [],
                  gapAnalysis: Array.isArray(analyticsData.gapAnalysis)
                    ? analyticsData.gapAnalysis
                    : [],
                  competitiveGaps: Array.isArray(analyticsData.competitiveGaps)
                    ? analyticsData.competitiveGaps
                    : [],
                }
              : null;
            setAnalytics(validatedAnalytics);
            setIsLoading(false);

            // Using cached data for instant navigation
            return;
          }
        }

        // No cache found or forcing refresh - fetch fresh data
        setIsLoading(true);
        setError(null);

        try {
          // FIXED: Use current transformed filters for API calls instead of previous ref
          // This ensures API calls use the latest filter changes immediately
          const currentFilters = transformedFilters;
          const batchResponse = await batchAPI.loadCompetitorsPage(
            selectedWebsiteId,
            currentFilters
          );

          // Handle batch API errors
          if (batchResponse.error) {
            throw new Error(`Batch API error: ${batchResponse.error}`);
          }

          const data = batchResponse.data as Record<string, unknown>;

          // Handle empty or invalid data gracefully
          if (!data || typeof data !== "object") {
            throw new Error("Invalid data structure received from server");
          }

          // Transform competitors to include analysisStatus (like the old coordinated hook)
          const dataCompetitors = Array.isArray(data.competitors)
            ? data.competitors
            : [];
          const dataPerformance = Array.isArray(data.performance)
            ? data.performance
            : [];

          // Handle empty performance data (common with restrictive date filters)
          if (dataCompetitors.length > 0 && dataPerformance.length === 0) {
            // Add helpful context for developers
            const context = {
              competitorCount: dataCompetitors.length,
              hasAnalytics: !!data.analytics,
              possibleCauses: [
                "Date range filters are too restrictive",
                "Analysis is still in progress for some competitors",
                "No recent analysis data available for current filter period",
              ],
              recommendation:
                "Try expanding the date range or check competitor analysis status",
            };

            if (process.env.NODE_ENV !== "production") {
              console.info("📊 Performance data context:", context);
            }
          }

          // Validate and filter out invalid competitors
          const validCompetitors = dataCompetitors.filter(
            (competitor: Competitor) => {
              const isValid =
                competitor.id &&
                (competitor.competitor_domain || competitor.name);
              if (!isValid) {
                console.warn("❌ Invalid competitor data found:", competitor);
              }
              return isValid;
            }
          );

          // Warn if no valid competitors found
          if (validCompetitors.length === 0 && dataCompetitors.length > 0) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("⚠️ No valid competitors found after filtering", {
                originalCount: dataCompetitors.length,
                invalidCompetitors: dataCompetitors.map((c) => ({
                  id: c.id,
                  domain: c.competitor_domain,
                  name: c.name,
                  isValid: !!(c.id && (c.competitor_domain || c.name)),
                })),
              });
            }
          }

          const transformedCompetitors = validCompetitors.map(
            (competitor: Competitor) => {
              const performance = dataPerformance.find(
                (p: CompetitorProfile & { analysisStatus?: string }) =>
                  p.domain === competitor.competitor_domain
              );
              return {
                ...competitor,
                // FIXED: Use analysis status from performance data (from database) instead of deriving
                analysisStatus: normalizeCompetitorStatus(
                  performance?.analysisStatus ||
                    competitor.analysisStatus ||
                    competitor.analysis_status
                ),
                performance,
                addedAt: competitor.created_at || new Date().toISOString(),
              };
            }
          );

          // Deduplicate competitors by ID to prevent React key conflicts
          const competitorsWithStatus = transformedCompetitors.filter(
            (competitor: Competitor, index: number, array: Competitor[]) =>
              array.findIndex((c: Competitor) => c.id === competitor.id) ===
              index
          );

          setCompetitors(competitorsWithStatus);
          setPerformance(dataPerformance);
          // Validate and ensure analytics data structure has required arrays
          const analyticsData = data.analytics as Record<
            string,
            unknown
          > | null;
          const validatedAnalytics = analyticsData
            ? {
                ...analyticsData,
                insights: Array.isArray(analyticsData.insights)
                  ? analyticsData.insights
                  : [],
                shareOfVoiceData: Array.isArray(analyticsData.shareOfVoiceData)
                  ? analyticsData.shareOfVoiceData
                  : [],
                marketShareData: Array.isArray(analyticsData.marketShareData)
                  ? analyticsData.marketShareData
                  : [],
                timeSeriesData: Array.isArray(analyticsData.timeSeriesData)
                  ? analyticsData.timeSeriesData
                  : [],
                gapAnalysis: Array.isArray(analyticsData.gapAnalysis)
                  ? analyticsData.gapAnalysis
                  : [],
                competitiveGaps: Array.isArray(analyticsData.competitiveGaps)
                  ? analyticsData.competitiveGaps
                  : [],
              }
            : null;
          setAnalytics(validatedAnalytics);

          // Smart caching strategy: Cache both base and filtered data
          const competitorsData = {
            competitors: competitorsWithStatus, // Use transformed data
            performance: data.performance || [],
            analytics: data.analytics,
            topics: data.topics || [], // Include topics for cross-page sharing
          };

          // SYNCHRONIZED CACHING: Use validated cache keys for consistency
          try {
            const { baseCacheKey, filteredCacheKey } =
              getSynchronizedCacheKeys();

            // Base cache (for website switching)
            setCache(baseCacheKey, competitorsData, 10 * 60 * 1000); // 10 minutes cache

            // Filtered cache (for exact filter match)
            setCache(filteredCacheKey, competitorsData, 5 * 60 * 1000); // 5 minutes cache
          } catch (error) {
            console.error("❌ Cache key synchronization failed:", error);
            // Fallback to original cache keys if synchronization fails
            setCache(competitorsBaseCacheKey, competitorsData, 10 * 60 * 1000);
            setCache(
              competitorsFilteredCacheKey,
              competitorsData,
              5 * 60 * 1000
            );
          }
        } catch (error) {
          console.error("❌ Failed to process competitors data:", error);
          setError(
            error instanceof Error ? error : new Error("Failed to process data")
          );
        } finally {
          setIsLoading(false);
          isLoadingCompetitorsRef.current = false;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("❌ Failed to load competitors data:", {
          error: errorMessage,
          websiteId: selectedWebsiteId,
          filters: transformedFilters,
        });

        // Provide user-friendly error messages based on common issues
        let friendlyError = errorMessage;
        if (
          errorMessage.includes("timeout") ||
          errorMessage.includes("30 seconds")
        ) {
          friendlyError =
            "Request timed out. This may be due to date filters excluding available data. Try selecting a wider date range.";
        } else if (errorMessage.includes("Batch API error")) {
          friendlyError =
            "Server error occurred while loading competitor data. Please try again.";
        }

        setError(new Error(friendlyError));
        setIsLoading(false);
        isLoadingCompetitorsRef.current = false;
      }
    },
    [
      selectedWebsiteId,
      competitorsBaseCacheKey,
      competitorsFilteredCacheKey,
      getCompetitorsCachedData,
      setCache,
      getSynchronizedCacheKeys,
      transformedFilters,
    ]
  );

  // Store the latest loadCompetitorsData function in ref to break dependency chain
  useEffect(() => {
    loadCompetitorsDataRef.current = loadCompetitorsData;
  }, [loadCompetitorsData]);

  // Smart cache-first navigation for instant website switching - Competitors
  const prevWebsiteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevWebsiteId = prevWebsiteIdRef.current;
    const currentWebsiteId = selectedWebsiteId;

    // CRITICAL FIX: Website switching cache invalidation
    // Clear all cache entries for the previous website when switching to prevent cross-contamination
    if (prevWebsiteId && prevWebsiteId !== currentWebsiteId) {
      // Clear all cache entries that contain the previous website ID
      const prevBaseCacheKey = `competitors_data_${prevWebsiteId}`;
      const prevFilterVariations = [
        `competitors_filtered_${prevWebsiteId}_7d_shareOfVoice_desc`,
        `competitors_filtered_${prevWebsiteId}_30d_shareOfVoice_desc`,
        `competitors_filtered_${prevWebsiteId}_90d_shareOfVoice_desc`,
        `competitors_filtered_${prevWebsiteId}_7d_marketShare_desc`,
        `competitors_filtered_${prevWebsiteId}_30d_marketShare_desc`,
        `competitors_filtered_${prevWebsiteId}_90d_marketShare_desc`,
        `competitors_filtered_${prevWebsiteId}_7d_contentGap_desc`,
        `competitors_filtered_${prevWebsiteId}_30d_contentGap_desc`,
        `competitors_filtered_${prevWebsiteId}_90d_contentGap_desc`,
      ];

      // Clear base cache
      clearCache(prevBaseCacheKey);

      // Clear common filter combinations
      prevFilterVariations.forEach((key) => clearCache(key));
    }

    // Update the ref to current website ID
    prevWebsiteIdRef.current = currentWebsiteId;

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
      const cachedCompetitors = Array.isArray(cachedData.competitors)
        ? cachedData.competitors
        : [];
      const cachedPerformanceData = Array.isArray(cachedData.performance)
        ? cachedData.performance
        : [];
      const transformedCachedCompetitors = cachedCompetitors.map(
        (competitor: Competitor) => {
          // FIXED: Use database status from performance data instead of deriving
          const performance = cachedPerformanceData.find(
            (p: CompetitorProfile & { analysisStatus?: string }) =>
              p.domain === competitor.competitor_domain
          );
          return {
            ...competitor,
            // Use analysis status from performance data (from database) or fallback to existing
            analysisStatus:
              performance?.analysisStatus ||
              competitor.analysisStatus ||
              "pending",
            performance,
            addedAt: competitor.created_at || new Date().toISOString(),
          };
        }
      );

      // Deduplicate cached competitors by ID to prevent React key conflicts
      const competitorsWithStatus = transformedCachedCompetitors.filter(
        (competitor: Competitor, index: number, array: Competitor[]) =>
          array.findIndex((c: Competitor) => c.id === competitor.id) === index
      );

      setCompetitors(competitorsWithStatus);
      setPerformance(cachedPerformanceData);

      // Validate and ensure analytics data structure has required arrays
      const analyticsData = cachedData.analytics as Record<
        string,
        unknown
      > | null;
      const validatedAnalytics = analyticsData
        ? {
            ...analyticsData,
            insights: Array.isArray(analyticsData.insights)
              ? analyticsData.insights
              : [],
            shareOfVoiceData: Array.isArray(analyticsData.shareOfVoiceData)
              ? analyticsData.shareOfVoiceData
              : [],
            marketShareData: Array.isArray(analyticsData.marketShareData)
              ? analyticsData.marketShareData
              : [],
            timeSeriesData: Array.isArray(analyticsData.timeSeriesData)
              ? analyticsData.timeSeriesData
              : [],
            gapAnalysis: Array.isArray(analyticsData.gapAnalysis)
              ? analyticsData.gapAnalysis
              : [],
            competitiveGaps: Array.isArray(analyticsData.competitiveGaps)
              ? analyticsData.competitiveGaps
              : [],
          }
        : null;
      setAnalytics(validatedAnalytics);
      setIsLoading(false);
      setError(null);

      // Using cached data for instant navigation
      return;
    }

    // No cache found - set loading state and fetch fresh data
    setIsLoading(true);
    setError(null);
    loadCompetitorsData();

    // No cache found, loading fresh data
  }, [
    selectedWebsiteId,
    getCompetitorsCachedData,
    loadCompetitorsData,
    competitorsBaseCacheKey,
    competitorsFilteredCacheKey,
    clearCache,
  ]);

  // Separate effect for competitor filter changes - CRITICAL: invalidate cache for date changes
  useEffect(() => {
    // Only handle filter changes if we have a website selected and filters actually changed
    if (!selectedWebsiteId || !competitorFiltersChanged) return;

    // CRITICAL FIX: For any filter changes that affect data, invalidate cache and force fresh data
    // This ensures users see up-to-date data for their selected filters
    const prev = prevCompetitorFiltersRef.current;
    const current = filters as CompetitorFilters;
    const isDateFilterChange = prev.dateFilter !== current.dateFilter;
    const isSortChange =
      prev.sortBy !== current.sortBy || prev.sortOrder !== current.sortOrder;

    if (isDateFilterChange || isSortChange) {
      // Generate comprehensive list of cache keys to clear
      const dateVariations = ["7d", "30d", "90d"];
      const sortByVariations = ["shareOfVoice", "marketShare", "contentGap"];
      const sortOrderVariations = ["desc", "asc"];

      const cacheKeysToInvalidate = new Set<string>();

      // Add base cache key
      cacheKeysToInvalidate.add(competitorsBaseCacheKey);

      // Add old and new filter cache keys
      const oldCacheKey = createCacheKey(prev);
      const newCacheKey = createCacheKey(current);
      cacheKeysToInvalidate.add(oldCacheKey);
      cacheKeysToInvalidate.add(newCacheKey);

      // For date filter changes, invalidate all combinations with the new date
      if (isDateFilterChange) {
        sortByVariations.forEach((sortBy) => {
          sortOrderVariations.forEach((sortOrder) => {
            const key = `competitors_filtered_${selectedWebsiteId}_${current.dateFilter}_${sortBy}_${sortOrder}`;
            cacheKeysToInvalidate.add(key);
          });
        });

        // Also clear the previous date filter combinations
        sortByVariations.forEach((sortBy) => {
          sortOrderVariations.forEach((sortOrder) => {
            const key = `competitors_filtered_${selectedWebsiteId}_${prev.dateFilter}_${sortBy}_${sortOrder}`;
            cacheKeysToInvalidate.add(key);
          });
        });
      }

      // For sort changes, invalidate all date combinations with the new sort
      if (isSortChange) {
        dateVariations.forEach((dateFilter) => {
          const key = `competitors_filtered_${selectedWebsiteId}_${dateFilter}_${current.sortBy}_${current.sortOrder}`;
          cacheKeysToInvalidate.add(key);
        });

        // Also clear the previous sort combinations
        dateVariations.forEach((dateFilter) => {
          const key = `competitors_filtered_${selectedWebsiteId}_${dateFilter}_${prev.sortBy}_${prev.sortOrder}`;
          cacheKeysToInvalidate.add(key);
        });
      }

      // Clear all identified cache keys
      cacheKeysToInvalidate.forEach((key) => {
        if (key) {
          // Only clear non-empty keys
          clearCache(key);
        }
      });

      // Force immediate data reload without checking cache
      setIsLoading(true);
      setError(null);
      if (loadCompetitorsDataRef.current) {
        loadCompetitorsDataRef.current(true); // forceRefresh = true
      }
      return;
    }

    // For non-date changes (like sort), check if we have filtered cache
    const filteredCache = getFromCache<Record<string, unknown>>(
      competitorsFilteredCacheKey
    );
    const filteredCompetitors = Array.isArray(filteredCache?.competitors)
      ? filteredCache.competitors
      : [];
    const filteredPerformance = Array.isArray(filteredCache?.performance)
      ? filteredCache.performance
      : [];
    if (
      filteredCache &&
      (filteredCompetitors.length > 0 || filteredPerformance.length > 0)
    ) {
      // We have cache for these exact filters - use it immediately

      // Validate and filter cached competitors
      const validFilteredCompetitors = filteredCompetitors.filter(
        (competitor: Competitor) => {
          const isValid =
            competitor.id && (competitor.competitor_domain || competitor.name);
          if (!isValid) {
            console.warn(
              "Invalid filtered cached competitor data found:",
              competitor
            );
          }
          return isValid;
        }
      );

      const transformedCachedCompetitors = validFilteredCompetitors.map(
        (competitor: Competitor) => {
          // FIXED: Use database status from performance data instead of deriving
          const performance = filteredPerformance.find(
            (p: CompetitorProfile & { analysisStatus?: string }) =>
              p.domain === competitor.competitor_domain
          );
          return {
            ...competitor,
            // Use analysis status from performance data (from database) or fallback to existing
            analysisStatus:
              performance?.analysisStatus ||
              competitor.analysisStatus ||
              "pending",
            performance,
            addedAt: competitor.created_at || new Date().toISOString(),
          };
        }
      );

      const competitorsWithStatus = transformedCachedCompetitors.filter(
        (competitor: Competitor, index: number, array: Competitor[]) =>
          array.findIndex((c: Competitor) => c.id === competitor.id) === index
      );

      setCompetitors(competitorsWithStatus);
      setPerformance(filteredPerformance);
      const analyticsData = filteredCache.analytics as Record<
        string,
        unknown
      > | null;
      setAnalytics(analyticsData || null);
      setIsLoading(false);
      setError(null);

      // Using filtered cache for filter change
      return;
    }

    // No filtered cache found - need to reload with new filters
    setIsLoading(true);
    setError(null);
    if (loadCompetitorsDataRef.current) {
      loadCompetitorsDataRef.current();
    }
  }, [
    competitorFiltersChanged,
    selectedWebsiteId,
    competitorsFilteredCacheKey,
    competitorsBaseCacheKey,
    getFromCache,
    clearCache,
    transformedFilters,
    createCacheKey,
    filters,
  ]); // FIXED: Added all required dependencies to ensure effect runs properly

  // CRITICAL FALLBACK: Direct filter change handler for immediate data refresh
  // This provides a backup mechanism if the main useEffect doesn't trigger properly
  useEffect(() => {
    if (!selectedWebsiteId) return;

    // Only trigger on actual filter changes, not initial mount
    if (prevCompetitorFiltersRef.current && competitorFiltersChanged) {
      setIsLoading(true);
      setError(null);

      if (loadCompetitorsDataRef.current) {
        loadCompetitorsDataRef.current(true); // Force refresh
      }
    }
  }, [filters, selectedWebsiteId, competitorFiltersChanged]); // Direct dependency on filters for immediate response

  // Listen for competitor status update events to force data refresh
  useEffect(() => {
    const handleCompetitorStatusUpdate = (event: CustomEvent) => {
      const { websiteId } = event.detail;

      // Only refresh data if the update is for the current website
      if (websiteId === selectedWebsiteId) {
        // Force refresh by clearing caches and reloading data
        if (loadCompetitorsDataRef.current) {
          loadCompetitorsDataRef.current(true);
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "competitorStatusUpdate",
        handleCompetitorStatusUpdate as EventListener
      );
      return () => {
        window.removeEventListener(
          "competitorStatusUpdate",
          handleCompetitorStatusUpdate as EventListener
        );
      };
    }
    return undefined;
  }, [selectedWebsiteId, loadCompetitorsData]);

  // CRITICAL FIX: Listen for competitor deletion events to immediately update UI
  useEffect(() => {
    const handleCompetitorDeleted = (event: CustomEvent) => {
      const { competitorId, websiteId } = event.detail;

      // Only handle deletion if it's for the current website
      if (websiteId === selectedWebsiteId) {
        // Step 1: Optimistic update - immediately remove competitor from local state
        setCompetitors((prevCompetitors) => {
          const updatedCompetitors = prevCompetitors.filter(
            (comp) => comp.id !== competitorId
          );
          return updatedCompetitors;
        });

        // Step 2: Remove competitor from performance data
        setPerformance((prevPerformance) => {
          const updatedPerformance = prevPerformance.filter(
            (perf: CompetitorProfile & { competitorId?: string }) =>
              perf.competitorId !== competitorId && perf.domain !== competitorId // Handle domain-based matching
          );
          return updatedPerformance;
        });

        // Step 3: Clear all related custom cache entries
        try {
          const { baseCacheKey, filteredCacheKey } = getSynchronizedCacheKeys();

          // Clear base and filtered caches
          clearCache(baseCacheKey);
          clearCache(filteredCacheKey);

          // Clear additional cache variations that might contain the deleted competitor
          const dateVariations = ["7d", "30d", "90d"];
          const sortByVariations = [
            "shareOfVoice",
            "averageRank",
            "mentionCount",
            "sentimentScore",
          ];
          const sortOrderVariations = ["desc", "asc"];

          const cacheKeysToInvalidate = new Set<string>();
          cacheKeysToInvalidate.add(baseCacheKey);
          cacheKeysToInvalidate.add(filteredCacheKey);

          // Add comprehensive cache variations
          dateVariations.forEach((date) => {
            sortByVariations.forEach((sortBy) => {
              sortOrderVariations.forEach((sortOrder) => {
                const cacheKey = `competitors_filtered_${selectedWebsiteId}_${date}_${sortBy}_${sortOrder}`;
                cacheKeysToInvalidate.add(cacheKey);
              });
            });
          });

          // Clear all identified cache entries
          cacheKeysToInvalidate.forEach((key) => clearCache(key));
        } catch (cacheError) {
          console.error(`❌ Error clearing custom cache entries:`, cacheError);
        }

        // Step 4: Trigger immediate data refresh to confirm deletion
        if (loadCompetitorsDataRef.current) {
          // Use setTimeout to avoid potential race conditions with backend cleanup
          setTimeout(() => {
            if (loadCompetitorsDataRef.current) {
              loadCompetitorsDataRef.current(true); // Force refresh
            }
          }, 500); // Small delay to allow backend cleanup to complete
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "competitorDeleted",
        handleCompetitorDeleted as EventListener
      );
      return () => {
        window.removeEventListener(
          "competitorDeleted",
          handleCompetitorDeleted as EventListener
        );
      };
    }
    return undefined;
  }, [
    selectedWebsiteId,
    getSynchronizedCacheKeys,
    clearCache,
    setCompetitors,
    setPerformance,
  ]);

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
