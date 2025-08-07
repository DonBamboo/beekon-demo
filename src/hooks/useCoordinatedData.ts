import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useResourceLoading, useCoordinatedLoading } from '@/contexts/LoadingContext';

// Generic hook for coordinating multiple async operations
interface CoordinatedDataOptions {
  /** Resource identifier for loading state */
  resourceId: string;
  /** Individual data loaders with their identifiers */
  loaders: Array<{
    id: string;
    loader: () => Promise<unknown>;
    dependencies?: unknown[];
  }>;
  /** Whether to wait for all loaders before showing content */
  waitForAll?: boolean;
  /** Debounce delay for dependency changes */
  debounceMs?: number;
}

interface CoordinatedDataResult<T = unknown> {
  data: Record<string, T>;
  isLoading: boolean;
  isInitialLoad: boolean;
  errors: Record<string, Error>;
  hasData: boolean;
  refresh: () => Promise<void>;
  refreshLoader: (loaderId: string) => Promise<void>;
}

export function useCoordinatedData<T = unknown>({
  resourceId,
  loaders,
  waitForAll = true,
  debounceMs = 300,
}: CoordinatedDataOptions): CoordinatedDataResult<T> {
  const [data, setData] = useState<Record<string, T>>({});
  const [errors, setErrors] = useState<Record<string, Error>>({});
  const [individualLoadingStates, setIndividualLoadingStates] = useState<Record<string, boolean>>({});

  const loaderIds = loaders.map(l => `${resourceId}-${l.id}`);
  const mainResource = useResourceLoading(resourceId);
  const coordinated = useCoordinatedLoading(loaderIds);

  // Debounced dependency change handler
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const executeLoader = useCallback(async (loader: CoordinatedDataOptions['loaders'][0]) => {
    try {
      setIndividualLoadingStates(prev => ({ ...prev, [loader.id]: true }));
      
      const result = await loader.loader();
      
      setData(prev => ({ ...prev, [loader.id]: result }));
      setErrors(prev => {
        const updated = { ...prev };
        delete updated[loader.id];
        return updated;
      });
      
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setErrors(prev => ({ ...prev, [loader.id]: errorObj }));
    } finally {
      setIndividualLoadingStates(prev => ({ ...prev, [loader.id]: false }));
    }
  }, []);

  const executeAllLoaders = useCallback(async () => {
    mainResource.startLoading();
    
    try {
      if (waitForAll) {
        // Execute all loaders in parallel but wait for all to complete
        await Promise.allSettled(loaders.map(executeLoader));
        await coordinated.waitForAll();
      } else {
        // Execute loaders independently
        loaders.forEach(executeLoader);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      mainResource.finishLoading(errorObj);
      return;
    }

    // Only finish main loading if we're waiting for all or if no loaders are still running
    if (waitForAll || !coordinated.isAnyLoading) {
      mainResource.finishLoading();
    }
  }, [loaders, executeLoader, mainResource, coordinated, waitForAll]);

  const refresh = useCallback(async () => {
    setData({});
    setErrors({});
    await executeAllLoaders();
  }, [executeAllLoaders]);

  const refreshLoader = useCallback(async (loaderId: string) => {
    const loader = loaders.find(l => l.id === loaderId);
    if (loader) {
      await executeLoader(loader);
    }
  }, [loaders, executeLoader]);

  // Handle dependency changes with debouncing  
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      executeAllLoaders();
    }, debounceMs);

    setDebounceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [executeAllLoaders, debounceMs, debounceTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]); // Include debounceTimer as dependency for proper cleanup

  const hasData = useMemo(() => {
    return Object.keys(data).length > 0 && Object.values(data).some(value => 
      value !== null && value !== undefined
    );
  }, [data]);

  const isLoading = waitForAll ? mainResource.isLoading : coordinated.isAnyLoading;

  return {
    data,
    isLoading,
    isInitialLoad: mainResource.isInitialLoad,
    errors,
    hasData,
    refresh,
    refreshLoader,
  };
}

// Specialized hook for Dashboard data coordination
export function useDashboardCoordinatedData(filters: Record<string, unknown>) {
  return useCoordinatedData({
    resourceId: 'dashboard-data',
    waitForAll: true,
    debounceMs: 300,
    loaders: [
      {
        id: 'metrics',
        loader: async () => {
          const { dashboardService } = await import('@/services/dashboardService');
          return dashboardService.getMetrics(filters);
        },
        dependencies: [filters],
      },
      {
        id: 'timeSeriesData',
        loader: async () => {
          const { dashboardService } = await import('@/services/dashboardService');
          return dashboardService.getTimeSeriesData(filters);
        },
        dependencies: [filters],
      },
      {
        id: 'topicPerformance',
        loader: async () => {
          const { dashboardService } = await import('@/services/dashboardService');
          return dashboardService.getTopicPerformance(filters);
        },
        dependencies: [filters],
      },
      {
        id: 'llmPerformance',
        loader: async () => {
          const { dashboardService } = await import('@/services/dashboardService');
          return dashboardService.getLLMPerformance(filters);
        },
        dependencies: [filters],
      },
      {
        id: 'websitePerformance',
        loader: async () => {
          const { dashboardService } = await import('@/services/dashboardService');
          return dashboardService.getWebsitePerformance(filters);
        },
        dependencies: [filters],
      },
    ],
  });
}