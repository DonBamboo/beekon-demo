import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useAppState, useSelectedWebsite, usePageFilters } from '@/contexts/AppStateContext';
import { useWebsiteData } from './useSharedData';
import { batchAPI } from '@/services/batchService';
import { analysisService } from '@/services/analysisService';
import { dashboardService } from '@/services/dashboardService';
import { competitorService } from '@/services/competitorService';
import type { UIAnalysisResult } from '@/types/database';

// Analysis page optimized hook
export function useOptimizedAnalysisData() {
  const { selectedWebsiteId } = useSelectedWebsite();
  const { filters, setFilters } = usePageFilters('analysis');
  const { getFromCache, setCache } = useAppState();
  
  // Use shared data for topics and LLM providers (cached across pages)
  const { topics, llmProviders, loading: sharedDataLoading } = useWebsiteData(selectedWebsiteId);
  
  // State for analysis-specific data
  const [analysisResults, setAnalysisResults] = useState<UIAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
  const resultsCacheKey = `analysis_results_${selectedWebsiteId}_${JSON.stringify(transformedFilters)}`;
  const metadataCacheKey = `analysis_metadata_${selectedWebsiteId}`;
  
  // Check if we have cached data for instant rendering - remove unstable getFromCache dependency
  const cachedResults = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<UIAnalysisResult[]>(resultsCacheKey);
  }, [selectedWebsiteId, resultsCacheKey]);
  
  // Load analysis data with cache-first approach - stabilized dependencies
  const loadAnalysisData = useCallback(async (forceRefresh = false) => {
    if (!selectedWebsiteId) {
      setAnalysisResults([]);
      return;
    }

    // Get current cache state
    const currentCachedResults = getFromCache<UIAnalysisResult[]>(resultsCacheKey);

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
      // Use batch API for efficient loading with transformed filters
      const batchResponse = await batchAPI.loadAnalysisPage(selectedWebsiteId, transformedFilters);
      const data = batchResponse.data as any;
      
      // Update results
      const results = data.recentResults || [];
      setAnalysisResults(results);
      
      // Cache the results
      setCache(resultsCacheKey, results, 5 * 60 * 1000); // 5 minutes cache
      
      // Cache metadata for other components
      if (data.metadata) {
        setCache(metadataCacheKey, data.metadata, 15 * 60 * 1000);
      }
      
    } catch (error) {
      console.error('Failed to load analysis data:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [selectedWebsiteId, JSON.stringify(transformedFilters), getFromCache, setCache, resultsCacheKey, metadataCacheKey]);

  // Load more results for infinite scroll
  const loadMoreResults = useCallback(async () => {
    if (!selectedWebsiteId || isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const offset = analysisResults.length;
      const additionalResults = await analysisService.getAnalysisResultsPaginated(
        selectedWebsiteId, 
        { ...transformedFilters, limit: 20, offset }
      );
      
      const newResults = [...analysisResults, ...additionalResults.results];
      setAnalysisResults(newResults);
      setHasMore(additionalResults.hasMore);
      
      // Update cache with new results
      setCache(resultsCacheKey, newResults, 5 * 60 * 1000);
      
    } catch (error) {
      console.error('Failed to load more results:', error);
      setError(error instanceof Error ? error : new Error('Failed to load more'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedWebsiteId, analysisResults, transformedFilters, hasMore, isLoading, setCache, resultsCacheKey]);

  // Auto-load when website or filters change
  useEffect(() => {
    loadAnalysisData();
  }, [loadAnalysisData]);

  // Detect website changes and refresh data - use ref to track previous website
  const prevWebsiteIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const prevWebsiteId = prevWebsiteIdRef.current;
    prevWebsiteIdRef.current = selectedWebsiteId;
    
    // Only reset data when actually switching to a different website, not on initial load
    if (prevWebsiteId && selectedWebsiteId && prevWebsiteId !== selectedWebsiteId) {
      setAnalysisResults([]);
      setIsInitialLoad(true);
      setError(null);
      setHasMore(true);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Analysis: Website changed, clearing cache', { from: prevWebsiteId, to: selectedWebsiteId });
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
  const { filters, setFilters } = usePageFilters('dashboard');
  const { getFromCache, setCache } = useAppState();
  
  // State for dashboard data
  const [metrics, setMetrics] = useState<any>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [topicPerformance, setTopicPerformance] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
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

  const loadDashboardData = useCallback(async (forceRefresh = false) => {
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
        dashboardService.getDashboardMetrics([selectedWebsiteId], transformedFilters.dateRange),
        dashboardService.getTimeSeriesData([selectedWebsiteId], transformedFilters.period || "7d"),
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
      console.error('Failed to load dashboard data:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedWebsiteId, JSON.stringify(transformedFilters), getFromCache, setCache, cacheKey]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Detect website changes and refresh data - use ref to track previous website
  const prevDashboardWebsiteIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const prevWebsiteId = prevDashboardWebsiteIdRef.current;
    prevDashboardWebsiteIdRef.current = selectedWebsiteId;
    
    // Only reset data when actually switching to a different website, not on initial load
    if (prevWebsiteId && selectedWebsiteId && prevWebsiteId !== selectedWebsiteId) {
      setMetrics(null);
      setTimeSeriesData([]);
      setTopicPerformance([]);
      setError(null);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Dashboard: Website changed, clearing cache', { from: prevWebsiteId, to: selectedWebsiteId });
      }
    }
  }, [selectedWebsiteId]);

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
  const { filters, setFilters } = usePageFilters('competitors');
  const { getFromCache, setCache } = useAppState();
  
  // Use shared topics data
  const { topics } = useWebsiteData(selectedWebsiteId);
  
  // State for competitors data
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
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
  
  const cacheKey = `competitors_data_${selectedWebsiteId}_${JSON.stringify(transformedFilters)}`;
  
  // Check cached data - remove unstable getFromCache dependency  
  const cachedData = useMemo(() => {
    if (!selectedWebsiteId) return null;
    return getFromCache<any>(cacheKey);
  }, [selectedWebsiteId, cacheKey]);

  const loadCompetitorsData = useCallback(async (forceRefresh = false) => {
    if (!selectedWebsiteId) return;

    // Get current cache state
    const currentCachedData = getFromCache<any>(cacheKey);

    // Instant render from cache
    if (!forceRefresh && currentCachedData) {
      // Ensure cached data has the correct structure with analysisStatus
      const transformedCachedCompetitors = (currentCachedData.competitors || []).map((competitor: any) => {
        // If already has analysisStatus, keep it; otherwise derive it
        if (competitor.analysisStatus) {
          return competitor;
        }
        const performance = (currentCachedData.performance || []).find(
          (p: any) => p.domain === competitor.competitor_domain
        );
        return {
          ...competitor,
          analysisStatus: performance ? "completed" : "pending" as const,
          performance,
          addedAt: competitor.created_at || new Date().toISOString(),
        };
      });
      
      // Deduplicate cached competitors by ID to prevent React key conflicts
      const competitorsWithStatus = transformedCachedCompetitors.filter((competitor: any, index: number, array: any[]) => 
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
      const batchResponse = await batchAPI.loadCompetitorsPage(selectedWebsiteId, transformedFilters);
      const data = batchResponse.data as any;
      
      // Transform competitors to include analysisStatus (like the old coordinated hook)
      const transformedCompetitors = (data.competitors || []).map((competitor: any) => {
        const performance = (data.performance || []).find(
          (p: any) => p.domain === competitor.competitor_domain
        );
        return {
          ...competitor,
          analysisStatus: performance ? "completed" : "pending" as const,
          performance,
          addedAt: competitor.created_at || new Date().toISOString(),
        };
      });
      
      // Deduplicate competitors by ID to prevent React key conflicts
      const competitorsWithStatus = transformedCompetitors.filter((competitor: any, index: number, array: any[]) => 
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
      console.error('Failed to load competitors data:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedWebsiteId, JSON.stringify(transformedFilters), getFromCache, setCache, cacheKey]);

  useEffect(() => {
    loadCompetitorsData();
  }, [loadCompetitorsData]);

  // Detect website changes and refresh data - use ref to track previous website
  const prevCompetitorsWebsiteIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const prevWebsiteId = prevCompetitorsWebsiteIdRef.current;
    prevCompetitorsWebsiteIdRef.current = selectedWebsiteId;
    
    // Only reset data when actually switching to a different website, not on initial load
    if (prevWebsiteId && selectedWebsiteId && prevWebsiteId !== selectedWebsiteId) {
      setCompetitors([]);
      setPerformance([]);
      setAnalytics(null);
      setError(null);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Competitors: Website changed, clearing cache', { from: prevWebsiteId, to: selectedWebsiteId });
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