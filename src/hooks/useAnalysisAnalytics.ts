/**
 * Hook for stable analysis analytics independent of pagination
 * This ensures analytics remain consistent regardless of infinite scroll state
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelectedWebsite, usePageFilters } from '@/hooks/appStateHooks';
import { useAppState } from '@/hooks/appStateHooks';
import { analyticsService, AnalysisAnalytics } from '@/services/analyticsService';
import type { AnalysisFilters } from '@/contexts/AppStateContext';

export function useAnalysisAnalytics() {
  const { selectedWebsiteId } = useSelectedWebsite();
  const { filters } = usePageFilters('analysis');
  const { getFromCache, setCache } = useAppState();

  const [analytics, setAnalytics] = useState<AnalysisAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoize filters to prevent unnecessary requests
  const stableFilters = useMemo(() => filters as AnalysisFilters, [filters]);
  
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
  const loadAnalytics = useCallback(async (forceRefresh = false) => {
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
      console.error('Failed to load analysis analytics:', err);
      setError(err instanceof Error ? err : new Error('Failed to load analytics'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedWebsiteId, stableFilters, cachedAnalytics, analyticsCacheKey, setCache]);

  // Load analytics when website or filters change
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Refresh analytics (force reload)
  const refreshAnalytics = useCallback(() => {
    loadAnalytics(true);
  }, [loadAnalytics]);

  return {
    analytics,
    isLoading,
    error,
    refreshAnalytics,
    hasCachedData: !!cachedAnalytics,
  };
}