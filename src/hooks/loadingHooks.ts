import { useContext, useCallback } from 'react';
import { LoadingContext } from '@/contexts/LoadingContext';

// Loading state interface for type safety
interface LoadingStateEntry {
  isLoading: boolean;
  error?: Error | null;
}

// Hook utilities
export function useLoadingContext() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoadingContext must be used within a LoadingProvider');
  }
  return context;
}

// Hook for managing a specific resource's loading state
export function useResourceLoading(resourceId: string) {
  const { getLoadingState, setLoadingState, clearLoadingState } = useLoadingContext();
  
  const state = getLoadingState(resourceId);
  
  const startLoading = useCallback((error?: Error | null) => {
    setLoadingState(resourceId, { isLoading: true, error });
  }, [resourceId, setLoadingState]);
  
  const finishLoading = useCallback((error?: Error | null) => {
    setLoadingState(resourceId, { isLoading: false, error });
  }, [resourceId, setLoadingState]);
  
  const clearError = useCallback(() => {
    setLoadingState(resourceId, { isLoading: state.isLoading, error: null });
  }, [resourceId, setLoadingState, state.isLoading]);
  
  const cleanup = useCallback(() => {
    clearLoadingState(resourceId);
  }, [resourceId, clearLoadingState]);
  
  return {
    ...state,
    startLoading,
    finishLoading,
    clearError,
    cleanup,
  };
}

// Global loading state hook
export function useGlobalLoadingStates() {
  const { loadingStates, clearAllLoadingStates } = useLoadingContext();
  
  const isAnyLoading = Object.values(loadingStates).some((state: LoadingStateEntry) => state.isLoading);
  const hasAnyError = Object.values(loadingStates).some((state: LoadingStateEntry) => state.error);
  
  return {
    loadingStates,
    isAnyLoading,
    hasAnyError,
    clearAllLoadingStates,
  };
}