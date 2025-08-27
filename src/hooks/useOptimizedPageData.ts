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
import type { CompetitorFilters, AnalysisFilters as UIAnalysisFilters, DashboardFilters } from "@/contexts/AppStateContext";
import type { AnalysisFilters } from "@/hooks/useAnalysisQuery";
import { useWebsiteData } from "./useSharedData";
import { batchAPI } from "@/services/batchService";
import { analysisService } from "@/services/analysisService";
import { dashboardService, type DashboardMetrics as ServiceDashboardMetrics } from "@/services/dashboardService";
import { deduplicateById } from "@/lib/utils";
import type { UIAnalysisResult } from "@/types/database";

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
  const loadAnalysisDataRef = useRef<((forceRefresh?: boolean) => Promise<void>) | null>(null);
  const isLoadingAnalysisRef = useRef(false);

  // Transform filters from global state format to service-expected format
  const transformedFilters = useMemo((): AnalysisFilters => {
    const uiFilters = filters as UIAnalysisFilters;
    const serviceFilters: AnalysisFilters = {};

    // Map UI filters to service filters
    if (uiFilters.topic) serviceFilters.topic = uiFilters.topic;
    if (uiFilters.llm) serviceFilters.llmProvider = uiFilters.llm;
    if (uiFilters.searchQuery) serviceFilters.searchQuery = uiFilters.searchQuery;

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
  const filteredCacheKey = `analysis_filtered_${selectedWebsiteId}_${JSON.stringify(transformedFilters)}`;

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
          isLoadingAnalysisRef.current = false;
        }
      } catch (error) {
        console.error("Failed to load analysis data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
        setIsLoading(false);
        setIsInitialLoad(false);
        isLoadingAnalysisRef.current = false;
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

  // Store the latest loadAnalysisData function in ref to break dependency chain
  useEffect(() => {
    loadAnalysisDataRef.current = loadAnalysisData;
  }, [loadAnalysisData]);

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
    if (loadAnalysisDataRef.current) {
      loadAnalysisDataRef.current();
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("Analysis: No cache found, loading fresh data", {
        websiteId: selectedWebsiteId,
        baseCacheKey,
        filteredCacheKey
      });
    }
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
    if (loadAnalysisDataRef.current) {
      loadAnalysisDataRef.current();
    }
  }, [filtersChanged, selectedWebsiteId, filteredCacheKey, getFromCache, transformedFilters]); // Removed loadAnalysisData dependency

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
  const [metrics, setMetrics] = useState<ServiceDashboardMetrics | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>([]);
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformanceData[]>([]);
  const [error, setError] = useState<Error | null>(null);
  
  // Initialize loading state as true if we have a website to load data for
  const [isLoading, setIsLoading] = useState(!!selectedWebsiteId);

  // Refs to store latest functions and prevent infinite loops
  const loadDashboardDataRef = useRef<((forceRefresh?: boolean) => Promise<void>) | null>(null);
  const isLoadingDashboardRef = useRef(false);

  // Transform dashboard filters if needed
  const transformedFilters = useMemo(() => {
    const typedFilters = filters as DashboardFilters;
    const baseFilters = { ...typedFilters };
    // Dashboard filters are simpler, just ensure period is handled correctly
    return baseFilters;
  }, [filters]);

  const cacheKey = `dashboard_data_${selectedWebsiteId}_${transformedFilters.period}`;

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!selectedWebsiteId) return false;
    const cached = getFromCache<Record<string, unknown>>(cacheKey);
    return !!(cached && (cached.metrics || Array.isArray(cached.timeSeriesData) && cached.timeSeriesData.length > 0 || Array.isArray(cached.topicPerformance) && cached.topicPerformance.length > 0));
  }, [selectedWebsiteId, cacheKey, getFromCache]);

  // Check cached data - remove unstable getFromCache dependency  
  const cachedData = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<Record<string, unknown>>(cacheKey);
  }, [selectedWebsiteId, cacheKey, getFromCache]);

  const loadDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!selectedWebsiteId) return;

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
        setTimeSeriesData(currentCachedData.timeSeriesData as TimeSeriesDataPoint[]);
        setTopicPerformance(currentCachedData.topicPerformance as TopicPerformanceData[]);
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
        };

        setCache(cacheKey, dashboardData, 10 * 60 * 1000); // 10 minutes cache
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
        isLoadingDashboardRef.current = false;
      }
    },
    [
      selectedWebsiteId,
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
    if (!selectedWebsiteId) {
      setIsLoading(false);
      return;
    }

    const currentCachedData = getFromCache<Record<string, unknown>>(cacheKey);
    if (currentCachedData) {
      // We have cached data, use it immediately and stop loading
      setMetrics(currentCachedData.metrics as ServiceDashboardMetrics | null);
      setTimeSeriesData(currentCachedData.timeSeriesData as TimeSeriesDataPoint[]);
      setTopicPerformance(currentCachedData.topicPerformance as TopicPerformanceData[]);
      setIsLoading(false);
    } else {
      // No cached data, ensure loading state is true and load data
      setIsLoading(true);
      if (loadDashboardDataRef.current) {
        loadDashboardDataRef.current();
      }
    }
  }, [selectedWebsiteId, cacheKey, getFromCache]); // Removed loadDashboardData dependency

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
      if (loadDashboardDataRef.current) {
        loadDashboardDataRef.current(true);
      }
      
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
  const { filters, setFilters } = usePageFilters<CompetitorFilters>("competitors");
  const { getFromCache, setCache } = useAppState();

  // Use shared topics data
  const { topics } = useWebsiteData(selectedWebsiteId);

  // State for competitors data
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [performance, setPerformance] = useState<CompetitorProfile[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(!!selectedWebsiteId);
  const [error, setError] = useState<Error | null>(null);

  // Refs to store latest functions and prevent infinite loops
  const loadCompetitorsDataRef = useRef<((forceRefresh?: boolean) => Promise<void>) | null>(null);
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
    const filteredCache = getFromCache<Record<string, unknown>>(competitorsFilteredCacheKey);
    const filteredCompetitors = Array.isArray(filteredCache?.competitors) ? filteredCache.competitors : [];
    const filteredPerformance = Array.isArray(filteredCache?.performance) ? filteredCache.performance : [];
    if (filteredCache && (filteredCompetitors.length > 0 || filteredPerformance.length > 0)) {
      return true;
    }
    
    // Check base cache (unfiltered data for this website)
    const baseCache = getFromCache<Record<string, unknown>>(competitorsBaseCacheKey);
    const baseCompetitors = Array.isArray(baseCache?.competitors) ? baseCache.competitors : [];
    const basePerformance = Array.isArray(baseCache?.performance) ? baseCache.performance : [];
    if (baseCache && (baseCompetitors.length > 0 || basePerformance.length > 0)) {
      return true;
    }
    
    return false;
  }, [selectedWebsiteId, competitorsFilteredCacheKey, competitorsBaseCacheKey, getFromCache]);

  // Check multiple cache levels for instant rendering
  const getCompetitorsCachedData = useCallback(() => {
    if (!selectedWebsiteId) return null;
    
    // Priority 1: Try filtered cache first (exact match for current filters)
    const filteredCache = getFromCache<Record<string, unknown>>(competitorsFilteredCacheKey);
    const filteredCompetitors = Array.isArray(filteredCache?.competitors) ? filteredCache.competitors : [];
    const filteredPerformance = Array.isArray(filteredCache?.performance) ? filteredCache.performance : [];
    if (filteredCache && (filteredCompetitors.length > 0 || filteredPerformance.length > 0)) {
      return { data: filteredCache, source: 'filtered', key: competitorsFilteredCacheKey };
    }
    
    // Priority 2: Try base cache (unfiltered data for this website)
    const baseCache = getFromCache<Record<string, unknown>>(competitorsBaseCacheKey);
    const baseCompetitors = Array.isArray(baseCache?.competitors) ? baseCache.competitors : [];
    const basePerformance = Array.isArray(baseCache?.performance) ? baseCache.performance : [];
    if (baseCache && (baseCompetitors.length > 0 || basePerformance.length > 0)) {
      return { data: baseCache, source: 'base', key: competitorsBaseCacheKey };
    }
    
    return null;
  }, [selectedWebsiteId, competitorsFilteredCacheKey, competitorsBaseCacheKey, getFromCache]);

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
          const cachedCompetitors = Array.isArray(currentCachedData.competitors) ? currentCachedData.competitors : [];
          const transformedCachedCompetitors = cachedCompetitors.map((competitor: Competitor) => {
            // If already has analysisStatus, keep it; otherwise derive it
            if (competitor.analysisStatus) {
              return competitor;
            }
            const cachedPerformance = Array.isArray(currentCachedData.performance) ? currentCachedData.performance : [];
            const performance = cachedPerformance.find(
              (p: CompetitorProfile) => p.domain === competitor.competitor_domain
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
            (competitor: Competitor, index: number, array: Competitor[]) =>
              array.findIndex((c: Competitor) => c.id === competitor.id) === index
          );

          setCompetitors(competitorsWithStatus);
          const performanceData = Array.isArray(currentCachedData.performance) ? currentCachedData.performance : [];
          setPerformance(performanceData);
          
          // Validate and ensure cached analytics data structure has required arrays
          const analyticsData = currentCachedData.analytics as Record<string, unknown> | null;
          const validatedAnalytics = analyticsData ? {
            ...analyticsData,
            insights: Array.isArray(analyticsData.insights) ? analyticsData.insights : [],
            shareOfVoiceData: Array.isArray(analyticsData.shareOfVoiceData) ? analyticsData.shareOfVoiceData : [],
            marketShareData: Array.isArray(analyticsData.marketShareData) ? analyticsData.marketShareData : [],
            timeSeriesData: Array.isArray(analyticsData.timeSeriesData) ? analyticsData.timeSeriesData : [],
            gapAnalysis: Array.isArray(analyticsData.gapAnalysis) ? analyticsData.gapAnalysis : [],
            competitiveGaps: Array.isArray(analyticsData.competitiveGaps) ? analyticsData.competitiveGaps : [],
          } : null;
          
          setAnalytics(validatedAnalytics);
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
        const data = batchResponse.data as Record<string, unknown>;

        // Transform competitors to include analysisStatus (like the old coordinated hook)
        const dataCompetitors = Array.isArray(data.competitors) ? data.competitors : [];
        const dataPerformance = Array.isArray(data.performance) ? data.performance : [];
        const transformedCompetitors = dataCompetitors.map(
          (competitor: Competitor) => {
            const performance = dataPerformance.find(
              (p: CompetitorProfile) => p.domain === competitor.competitor_domain
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
          (competitor: Competitor, index: number, array: Competitor[]) =>
            array.findIndex((c: Competitor) => c.id === competitor.id) === index
        );

        setCompetitors(competitorsWithStatus);
        setPerformance(dataPerformance);
        
        // Validate and ensure analytics data structure has required arrays
        const analyticsData = data.analytics as Record<string, unknown> | null;
        const validatedAnalytics = analyticsData ? {
          ...analyticsData,
          insights: Array.isArray(analyticsData.insights) ? analyticsData.insights : [],
          shareOfVoiceData: Array.isArray(analyticsData.shareOfVoiceData) ? analyticsData.shareOfVoiceData : [],
          marketShareData: Array.isArray(analyticsData.marketShareData) ? analyticsData.marketShareData : [],
          timeSeriesData: Array.isArray(analyticsData.timeSeriesData) ? analyticsData.timeSeriesData : [],
          gapAnalysis: Array.isArray(analyticsData.gapAnalysis) ? analyticsData.gapAnalysis : [],
          competitiveGaps: Array.isArray(analyticsData.competitiveGaps) ? analyticsData.competitiveGaps : [],
        } : null;
        
        setAnalytics(validatedAnalytics);

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
          isLoadingCompetitorsRef.current = false;
        }
      } catch (error) {
        console.error("Failed to load competitors data:", error);
        setError(error instanceof Error ? error : new Error("Unknown error"));
        setIsLoading(false);
        isLoadingCompetitorsRef.current = false;
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

  // Store the latest loadCompetitorsData function in ref to break dependency chain
  useEffect(() => {
    loadCompetitorsDataRef.current = loadCompetitorsData;
  }, [loadCompetitorsData]);

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
      const cachedCompetitors = Array.isArray(cachedData.competitors) ? cachedData.competitors : [];
      const cachedPerformanceData = Array.isArray(cachedData.performance) ? cachedData.performance : [];
      const transformedCachedCompetitors = cachedCompetitors.map((competitor: Competitor) => {
        // If already has analysisStatus, keep it; otherwise derive it
        if (competitor.analysisStatus) {
          return competitor;
        }
        const performance = cachedPerformanceData.find(
          (p: CompetitorProfile) => p.domain === competitor.competitor_domain
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
        (competitor: Competitor, index: number, array: Competitor[]) =>
          array.findIndex((c: Competitor) => c.id === competitor.id) === index
      );

      setCompetitors(competitorsWithStatus);
      setPerformance(cachedPerformanceData);
      
      // Validate and ensure analytics data structure has required arrays
      const analyticsData = cachedData.analytics as Record<string, unknown> | null;
      const validatedAnalytics = analyticsData ? {
        ...analyticsData,
        insights: Array.isArray(analyticsData.insights) ? analyticsData.insights : [],
        shareOfVoiceData: Array.isArray(analyticsData.shareOfVoiceData) ? analyticsData.shareOfVoiceData : [],
        marketShareData: Array.isArray(analyticsData.marketShareData) ? analyticsData.marketShareData : [],
        timeSeriesData: Array.isArray(analyticsData.timeSeriesData) ? analyticsData.timeSeriesData : [],
        gapAnalysis: Array.isArray(analyticsData.gapAnalysis) ? analyticsData.gapAnalysis : [],
        competitiveGaps: Array.isArray(analyticsData.competitiveGaps) ? analyticsData.competitiveGaps : [],
      } : null;
      
      setAnalytics(validatedAnalytics);
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
    const filteredCache = getFromCache<Record<string, unknown>>(competitorsFilteredCacheKey);
    const filteredCompetitors = Array.isArray(filteredCache?.competitors) ? filteredCache.competitors : [];
    const filteredPerformance = Array.isArray(filteredCache?.performance) ? filteredCache.performance : [];
    if (filteredCache && (filteredCompetitors.length > 0 || filteredPerformance.length > 0)) {
      // We have cache for these exact filters - use it immediately
      const transformedCachedCompetitors = filteredCompetitors.map((competitor: Competitor) => {
        // If already has analysisStatus, keep it; otherwise derive it
        if (competitor.analysisStatus) {
          return competitor;
        }
        const performance = filteredPerformance.find(
          (p: CompetitorProfile) => p.domain === competitor.competitor_domain
        );
        return {
          ...competitor,
          analysisStatus: performance ? "completed" : ("pending" as const),
          performance,
          addedAt: competitor.created_at || new Date().toISOString(),
        };
      });

      const competitorsWithStatus = transformedCachedCompetitors.filter(
        (competitor: Competitor, index: number, array: Competitor[]) =>
          array.findIndex((c: Competitor) => c.id === competitor.id) === index
      );

      setCompetitors(competitorsWithStatus);
      setPerformance(filteredPerformance);
      const analyticsData = filteredCache.analytics as Record<string, unknown> | null;
      setAnalytics(analyticsData || null);
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
    if (loadCompetitorsDataRef.current) {
      loadCompetitorsDataRef.current();
    }
  }, [competitorFiltersChanged, selectedWebsiteId, competitorsFilteredCacheKey, getFromCache, transformedFilters]); // Removed loadCompetitorsData dependency

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

    if (typeof window !== 'undefined') {
      window.addEventListener('competitorStatusUpdate', handleCompetitorStatusUpdate as EventListener);
      return () => {
        window.removeEventListener('competitorStatusUpdate', handleCompetitorStatusUpdate as EventListener);
      };
    }
    return undefined;
  }, [selectedWebsiteId, loadCompetitorsData]);

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
