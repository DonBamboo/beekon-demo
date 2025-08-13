import { createContext, useState, useCallback, ReactNode } from 'react';

interface LoadingState {
  [key: string]: {
    isLoading: boolean;
    isInitialLoad: boolean;
    error?: Error | null;
    lastUpdate?: number;
  };
}

interface LoadingContextType {
  // Get loading state for a specific resource
  getLoadingState: (resourceId: string) => {
    isLoading: boolean;
    isInitialLoad: boolean;
    error?: Error | null;
  };
  
  // Set loading state for a resource
  setLoadingState: (resourceId: string, state: {
    isLoading: boolean;
    error?: Error | null;
  }) => void;
  
  // Check if any resource is in initial loading state
  hasInitialLoading: () => boolean;
  
  // Check if specific resources are loading
  areResourcesLoading: (resourceIds: string[]) => boolean;
  
  // Clear loading state for a resource
  clearLoadingState: (resourceId: string) => void;
  
  // Wait for multiple resources to finish loading
  waitForResources: (resourceIds: string[]) => Promise<void>;
  
  // Reset all loading states
  resetAllStates: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

interface LoadingProviderProps {
  children: ReactNode;
}

export function LoadingProvider({ children }: LoadingProviderProps) {
  const [loadingStates, setLoadingStates] = useState<LoadingState>({});
  const [resolveCallbacks, setResolveCallbacks] = useState<Map<string, (() => void)[]>>(new Map());

  const getLoadingState = useCallback((resourceId: string) => {
    const state = loadingStates[resourceId];
    return {
      isLoading: state?.isLoading ?? false,
      isInitialLoad: state?.isInitialLoad ?? true,
      error: state?.error ?? null,
    };
  }, [loadingStates]);

  const setLoadingState = useCallback((resourceId: string, newState: {
    isLoading: boolean;
    error?: Error | null;
  }) => {
    setLoadingStates(prev => {
      const existing = prev[resourceId];
      const updated = {
        ...existing,
        isLoading: newState.isLoading,
        error: newState.error ?? null,
        isInitialLoad: existing?.isInitialLoad ?? true,
        lastUpdate: Date.now(),
      };

      // If loading is complete and this was an initial load, mark it as no longer initial
      if (!newState.isLoading && existing?.isInitialLoad) {
        updated.isInitialLoad = false;
      }

      return {
        ...prev,
        [resourceId]: updated,
      };
    });

    // Trigger callbacks if loading is complete
    if (!newState.isLoading) {
      const callbacks = resolveCallbacks.get(resourceId) || [];
      callbacks.forEach(callback => callback());
      setResolveCallbacks(prev => {
        const updated = new Map(prev);
        updated.delete(resourceId);
        return updated;
      });
    }
  }, [resolveCallbacks]);

  const hasInitialLoading = useCallback(() => {
    return Object.values(loadingStates).some(state => state.isLoading && state.isInitialLoad);
  }, [loadingStates]);

  const areResourcesLoading = useCallback((resourceIds: string[]) => {
    return resourceIds.some(id => loadingStates[id]?.isLoading);
  }, [loadingStates]);

  const clearLoadingState = useCallback((resourceId: string) => {
    setLoadingStates(prev => {
      const updated = { ...prev };
      delete updated[resourceId];
      return updated;
    });
  }, []);

  const waitForResources = useCallback((resourceIds: string[]) => {
    return new Promise<void>((resolve) => {
      const pendingResources = resourceIds.filter(id => loadingStates[id]?.isLoading);
      
      if (pendingResources.length === 0) {
        resolve();
        return;
      }

      let completedCount = 0;
      const checkCompletion = () => {
        completedCount++;
        if (completedCount === pendingResources.length) {
          resolve();
        }
      };

      pendingResources.forEach(resourceId => {
        setResolveCallbacks(prev => {
          const updated = new Map(prev);
          const existing = updated.get(resourceId) || [];
          updated.set(resourceId, [...existing, checkCompletion]);
          return updated;
        });
      });
    });
  }, [loadingStates]);

  const resetAllStates = useCallback(() => {
    setLoadingStates({});
    setResolveCallbacks(new Map());
  }, []);

  const contextValue: LoadingContextType = {
    getLoadingState,
    setLoadingState,
    hasInitialLoading,
    areResourcesLoading,
    clearLoadingState,
    waitForResources,
    resetAllStates,
  };

  return (
    <LoadingContext.Provider value={contextValue}>
      {children}
    </LoadingContext.Provider>
  );
}

// Export the context for the separate hooks file
export { LoadingContext };