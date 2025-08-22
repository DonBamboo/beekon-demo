import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

// Query key patterns for consistent cache management
export const queryKeyPatterns = {
  // Dashboard related
  dashboard: ['dashboard'],
  dashboardMetrics: (websiteIds: string[], filters?: Record<string, unknown>) => ['dashboard', 'metrics', websiteIds, filters],
  dashboardTimeSeries: (websiteIds: string[], period: string) => ['dashboard', 'timeSeries', websiteIds, period],
  dashboardTopics: (websiteIds: string[], limit: number) => ['dashboard', 'topics', websiteIds, limit],
  dashboardLLM: (websiteIds: string[]) => ['dashboard', 'llm', websiteIds],
  dashboardWebsites: (websiteIds: string[]) => ['dashboard', 'websites', websiteIds],

  // Analysis related  
  analysis: ['analysis'],
  analysisResults: (websiteId: string, filters?: Record<string, unknown>) => ['analysis', 'results', websiteId, filters],
  analysisPaginated: (websiteId: string, cursor?: string, filters?: Record<string, unknown>) => 
    ['analysis', 'paginated', websiteId, cursor, filters],

  // Competitors related
  competitors: ['competitors'],
  competitorList: (websiteId: string) => ['competitors', 'list', websiteId],
  competitorPerformance: (websiteId: string, dateRange?: { start: string; end: string }) => 
    ['competitors', 'performance', websiteId, dateRange],
  competitorAnalytics: (websiteId: string, dateRange?: { start: string; end: string }) => 
    ['competitors', 'analytics', websiteId, dateRange],

  // Websites related
  websites: ['websites'],
  websiteList: () => ['websites', 'list'],
  websiteMetrics: (websiteId: string) => ['websites', 'metrics', websiteId],

  // Workspaces related
  workspaces: ['workspaces'],
  currentWorkspace: () => ['workspaces', 'current'],
};

// Hook for optimized query management
export function useQueryOptimization() {
  const queryClient = useQueryClient();

  // Invalidate related queries when data changes
  const invalidateRelated = useCallback((pattern: string[], websiteId?: string) => {
    // Invalidate exact matches
    queryClient.invalidateQueries({ queryKey: pattern });
    
    // Invalidate related patterns based on context
    if (websiteId) {
      // If a website-specific change, invalidate dashboard data for that website
      queryClient.invalidateQueries({ 
        queryKey: queryKeyPatterns.dashboard,
        predicate: (query) => {
          const queryKey = query.queryKey;
          return queryKey.includes(websiteId) || 
                 (Array.isArray(queryKey[2]) && queryKey[2].includes(websiteId));
        }
      });
    }
  }, [queryClient]);

  // Smart prefetch based on user navigation patterns
  const prefetchRelatedData = useCallback(async (currentPage: string, websiteId?: string) => {
    const commonPrefetches: Promise<unknown>[] = [];

    switch (currentPage) {
      case 'dashboard':
        // When on dashboard, prefetch analysis data for quick navigation
        if (websiteId) {
          commonPrefetches.push(
            queryClient.prefetchQuery({
              queryKey: queryKeyPatterns.analysisResults(websiteId),
              staleTime: 2 * 60 * 1000, // 2 minutes
            })
          );
        }
        break;

      case 'analysis':
        // When on analysis, prefetch competitors data
        if (websiteId) {
          commonPrefetches.push(
            queryClient.prefetchQuery({
              queryKey: queryKeyPatterns.competitorList(websiteId),
              staleTime: 5 * 60 * 1000, // 5 minutes
            })
          );
        }
        break;

      case 'competitors':
        // When on competitors, prefetch dashboard metrics
        if (websiteId) {
          commonPrefetches.push(
            queryClient.prefetchQuery({
              queryKey: queryKeyPatterns.dashboardMetrics([websiteId]),
              staleTime: 5 * 60 * 1000, // 5 minutes
            })
          );
        }
        break;
    }

    // Execute all prefetches in parallel
    try {
      await Promise.allSettled(commonPrefetches);
    } catch (error) {
      // Prefetch failures should not break the app

    }
  }, [queryClient]);

  // Optimize cache by removing stale entries
  const optimizeCache = useCallback(() => {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    queryClient.getQueryCache().getAll().forEach(query => {
      const lastUpdate = query.state.dataUpdatedAt || 0;
      if (now - lastUpdate > staleThreshold && query.getObserversCount() === 0) {
        queryClient.removeQueries({ queryKey: query.queryKey });
      }
    });
  }, [queryClient]);

  // Batch multiple cache invalidations to reduce re-renders
  const batchInvalidate = useCallback((patterns: string[][]) => {
    // Use manual batching for React Query v5
    patterns.forEach(pattern => {
      queryClient.invalidateQueries({ queryKey: pattern });
    });
  }, [queryClient]);

  // Get cache statistics for debugging
  const getCacheStats = useCallback(() => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    const stats = {
      totalQueries: queries.length,
      activeQueries: queries.filter(q => q.getObserversCount() > 0).length,
      staleQueries: queries.filter(q => q.isStale()).length,
      errorQueries: queries.filter(q => q.state.status === 'error').length,
      successQueries: queries.filter(q => q.state.status === 'success').length,
      loadingQueries: queries.filter(q => q.state.status === 'pending').length,
    };

    return stats;
  }, [queryClient]);

  return {
    invalidateRelated,
    prefetchRelatedData,
    optimizeCache,
    batchInvalidate,
    getCacheStats,
    queryClient,
  };
}

// Auto-cleanup hook to manage memory usage
export function useQueryCleanup() {
  const { optimizeCache } = useQueryOptimization();

  // Run cleanup every 5 minutes
  const cleanupInterval = setInterval(() => {
    optimizeCache();
  }, 5 * 60 * 1000);

  return () => clearInterval(cleanupInterval);
}