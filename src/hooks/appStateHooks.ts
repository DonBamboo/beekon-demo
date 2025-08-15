import { useContext } from 'react';
import { AppStateContext } from '@/contexts/AppStateContext';
import type { AppState } from '@/contexts/AppStateContext';

// Custom hook to use app state
export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}

// Convenience hooks for specific state slices
export function useGlobalCache() {
  const { getFromCache, setCache, clearCache, invalidateDependentCaches } = useAppState();
  return { getFromCache, setCache, clearCache, invalidateDependentCaches };
}

export function usePageFilters<T>(page: keyof AppState['ui']['filters']) {
  const { state, setPageFilters } = useAppState();
  return {
    filters: state.ui.filters[page] as T,
    setFilters: (filters: T) => setPageFilters(page, filters),
  };
}

export function useSelectedWebsite() {
  const { state, setSelectedWebsite } = useAppState();
  return {
    selectedWebsiteId: state.workspace.selectedWebsiteId,
    websites: state.workspace.websites,
    setSelectedWebsite,
    selectedWebsite: state.workspace.websites.find(w => w.id === state.workspace.selectedWebsiteId),
  };
}

export function useCompetitorStatus() {
  const { 
    state,
    updateCompetitorStatus,
    getCompetitorStatus,
    isCompetitorMonitored,
    getMonitoredCompetitors,
    clearCompetitorStatus 
  } = useAppState();
  
  return {
    competitorStatusMap: state.competitors.statusMap,
    monitoredCompetitors: state.competitors.monitoredCompetitors,
    updateCompetitorStatus,
    getCompetitorStatus,
    isCompetitorMonitored,
    getMonitoredCompetitors,
    clearCompetitorStatus,
  };
}