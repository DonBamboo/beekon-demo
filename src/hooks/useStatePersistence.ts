import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppState, usePageFilters } from "@/hooks/appStateHooks";
import { persistentStorage } from "@/lib/storage";
import type {
  AnalysisFilters,
  CompetitorFilters,
  DashboardFilters,
} from "@/contexts/AppStateContext";

// Navigation context for intelligent prefetching
interface NavigationContext {
  from: string;
  to: string;
  timestamp: number;
  userAction: "direct" | "navigation" | "back" | "forward";
}

// Navigation state structure
interface NavigationState {
  scrollPositions?: Record<string, { x: number; y: number; timestamp: number }>;
  history?: NavigationContext[];
  selectedWebsiteId?: string;
}

// State persistence configuration per page
interface PageConfig {
  persistFilters: boolean;
  persistScrollPosition: boolean;
  prefetchData: boolean;
  restoreOnNavigate: boolean;
}

const PAGE_CONFIGS: Record<string, PageConfig> = {
  "/analysis": {
    persistFilters: true,
    persistScrollPosition: true,
    prefetchData: true,
    restoreOnNavigate: true,
  },
  "/competitors": {
    persistFilters: true,
    persistScrollPosition: true,
    prefetchData: true,
    restoreOnNavigate: true,
  },
  "/dashboard": {
    persistFilters: true,
    persistScrollPosition: false, // Dashboard is typically short
    prefetchData: true,
    restoreOnNavigate: true,
  },
  "/websites": {
    persistFilters: false, // Simple page, no complex filters
    persistScrollPosition: true,
    prefetchData: false,
    restoreOnNavigate: false,
  },
  "/settings": {
    persistFilters: false,
    persistScrollPosition: false,
    prefetchData: false,
    restoreOnNavigate: false,
  },
};

/**
 * Hook for managing cross-page state persistence
 * Handles filter states, navigation context, and intelligent data prefetching
 */
export function useStatePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, navigateToPage } = useAppState();

  const currentPage = location.pathname;
  const config = PAGE_CONFIGS[currentPage] || PAGE_CONFIGS["/"];

  // Persist filter states when they change
  const persistFiltersForPage = useCallback(
    (page: string, filters: Record<string, unknown>) => {
      if (!PAGE_CONFIGS[page]?.persistFilters) return;

      const success = persistentStorage.savePageFilters(
        page.replace("/", ""),
        filters
      );
      if (!success) {
        console.warn(`Failed to persist filters for page: ${page}`);
      }
    },
    []
  );

  // Restore filter states when navigating to a page
  const restoreFiltersForPage = useCallback(
    (page: string): Record<string, unknown> | null => {
      if (!PAGE_CONFIGS[page]?.restoreOnNavigate) return null;

      const savedFilters = persistentStorage.loadPageFilters(
        page.replace("/", "")
      );
      return savedFilters as Record<string, unknown> | null;
    },
    []
  );

  // Save scroll position before navigation
  const saveScrollPosition = useCallback(() => {
    if (!config?.persistScrollPosition) return;

    const scrollData = {
      x: window.scrollX,
      y: window.scrollY,
      timestamp: Date.now(),
    };

    const currentState =
      persistentStorage.loadNavigationState() as NavigationState | null;
    persistentStorage.saveNavigationState({
      ...currentState,
      scrollPositions: {
        ...(currentState?.scrollPositions || {}),
        [currentPage]: scrollData,
      },
    });
  }, [currentPage, config?.persistScrollPosition]);

  // Restore scroll position after navigation
  const restoreScrollPosition = useCallback(() => {
    if (!config?.persistScrollPosition) return;

    const navState =
      persistentStorage.loadNavigationState() as NavigationState | null;
    const scrollData = navState?.scrollPositions?.[currentPage];

    if (scrollData) {
      // Delay scroll restore to allow page to render
      setTimeout(() => {
        window.scrollTo(scrollData.x, scrollData.y);
      }, 100);
    }
  }, [currentPage, config?.persistScrollPosition]);

  // Track navigation patterns for intelligent prefetching
  const trackNavigation = useCallback(
    (from: string, to: string, action: NavigationContext["userAction"]) => {
      const navigationContext: NavigationContext = {
        from,
        to,
        timestamp: Date.now(),
        userAction: action,
      };

      const navState =
        (persistentStorage.loadNavigationState() as NavigationState | null) || {
          history: [],
        };
      const updatedHistory = [
        ...(navState.history || []),
        navigationContext,
      ].slice(-20); // Keep last 20

      persistentStorage.saveNavigationState({
        ...navState,
        history: updatedHistory,
        current: to,
        previous: from,
      });
    },
    []
  );

  // Get navigation patterns for prefetching predictions
  const getNavigationPatterns = useCallback((): Array<{
    to: string;
    probability: number;
  }> => {
    const navState =
      persistentStorage.loadNavigationState() as NavigationState | null;
    if (!navState?.history) return [];

    const patterns = new Map<string, number>();
    const fromCurrent = navState.history.filter(
      (h: NavigationContext) => h.from === currentPage
    );

    fromCurrent.forEach((nav: NavigationContext) => {
      const count = patterns.get(nav.to) || 0;
      patterns.set(nav.to, count + 1);
    });

    const total = fromCurrent.length;
    return Array.from(patterns.entries())
      .map(([to, count]) => ({ to, probability: count / total }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3); // Top 3 most likely destinations
  }, [currentPage]);

  // Enhanced navigation with state management
  const navigateWithState = useCallback(
    (
      to: string,
      options?: {
        replace?: boolean;
        preserveFilters?: boolean;
        prefetch?: boolean;
      }
    ) => {
      // Save current page state
      if (config?.persistScrollPosition) {
        saveScrollPosition();
      }

      // Track navigation pattern
      trackNavigation(currentPage, to, "direct");

      // Update app state navigation
      navigateToPage(to);

      // Navigate using router
      navigate(to, { replace: options?.replace });

      // Prefetch data for destination if enabled
      if (options?.prefetch && PAGE_CONFIGS[to]?.prefetchData) {
        prefetchDataForPage(to);
      }
    },
    [
      currentPage,
      config,
      saveScrollPosition,
      trackNavigation,
      navigateToPage,
      navigate,
    ]
  ); // prefetchDataForPage is stable (empty deps)

  // Prefetch data based on navigation patterns
  const prefetchDataForPage = useCallback(async (page: string) => {
    // This would trigger data loading for the destination page
    // Implementation depends on the specific data needs of each page
    console.log(`Prefetching data for page: ${page}`);

    // Example: Prefetch shared data that might be needed
    if (page === "/analysis" || page === "/competitors") {
      // Trigger topics and LLM providers loading
      // This would be implemented by the shared data hooks
    }
  }, []);

  // Auto-save filters when they change
  useEffect(() => {
    const filters = state.ui.filters;

    // Save each page's filters
    Object.entries(filters).forEach(([page, pageFilters]) => {
      persistFiltersForPage(`/${page}`, pageFilters);
    });
  }, [state.ui.filters, persistFiltersForPage]);

  // Restore state on page load
  useEffect(() => {
    // Restore filters for current page
    const savedFilters = restoreFiltersForPage(currentPage);
    if (savedFilters) {
      // This would need to be handled by the AppStateContext
      console.log(`Restoring filters for ${currentPage}:`, savedFilters);
    }

    // Restore scroll position
    restoreScrollPosition();

    // Update navigation state
    navigateToPage(currentPage);
  }, [
    currentPage,
    restoreFiltersForPage,
    restoreScrollPosition,
    navigateToPage,
  ]);

  // Intelligent prefetching based on patterns
  useEffect(() => {
    if (!config?.prefetchData) return;

    const patterns = getNavigationPatterns();
    patterns.forEach(({ to, probability }) => {
      if (probability > 0.3) {
        // Only prefetch if >30% probability
        prefetchDataForPage(to);
      }
    });
  }, [
    currentPage,
    config?.prefetchData,
    getNavigationPatterns,
    prefetchDataForPage,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (config?.persistScrollPosition) {
        saveScrollPosition();
      }
    };
  }, [config?.persistScrollPosition, saveScrollPosition]);

  return {
    // Navigation with state management
    navigateWithState,

    // State persistence
    persistFilters: persistFiltersForPage,
    restoreFilters: restoreFiltersForPage,

    // Scroll management
    saveScrollPosition,
    restoreScrollPosition,

    // Navigation patterns
    getNavigationPatterns,
    trackNavigation,

    // Prefetching
    prefetchDataForPage,

    // Current page info
    currentPage,
    config,
  };
}

/**
 * Hook specifically for Analysis page filter persistence
 */
export function useAnalysisFilterPersistence() {
  const { filters, setFilters } = usePageFilters<AnalysisFilters>("analysis");
  const { persistFilters, restoreFilters } = useStatePersistence();

  const persistAndSetFilters = useCallback(
    (newFilters: AnalysisFilters) => {
      setFilters(newFilters);
      persistFilters("/analysis", newFilters);
    },
    [setFilters, persistFilters]
  );

  // Auto-restore on mount
  useEffect(() => {
    const savedFilters = restoreFilters("/analysis");
    if (savedFilters) {
      setFilters(savedFilters as AnalysisFilters);
    }
  }, [restoreFilters, setFilters]);

  return {
    filters,
    setFilters: persistAndSetFilters,
  };
}

/**
 * Hook specifically for Competitors page filter persistence
 */
export function useCompetitorFilterPersistence() {
  const { filters, setFilters } =
    usePageFilters<CompetitorFilters>("competitors");
  const { persistFilters, restoreFilters } = useStatePersistence();

  const persistAndSetFilters = useCallback(
    (newFilters: CompetitorFilters) => {
      setFilters(newFilters);
      persistFilters("/competitors", newFilters);
    },
    [setFilters, persistFilters]
  );

  // Auto-restore on mount
  useEffect(() => {
    const savedFilters = restoreFilters("/competitors");
    if (savedFilters) {
      setFilters(savedFilters as CompetitorFilters);
    }
  }, [restoreFilters, setFilters]);

  return {
    filters,
    setFilters: persistAndSetFilters,
  };
}

/**
 * Hook specifically for Dashboard page filter persistence
 */
export function useDashboardFilterPersistence() {
  const { filters, setFilters } = usePageFilters<DashboardFilters>("dashboard");
  const { persistFilters, restoreFilters } = useStatePersistence();

  const persistAndSetFilters = useCallback(
    (newFilters: DashboardFilters) => {
      setFilters(newFilters);
      persistFilters("/dashboard", newFilters);
    },
    [setFilters, persistFilters]
  );

  // Auto-restore on mount
  useEffect(() => {
    const savedFilters = restoreFilters("/dashboard");
    if (savedFilters) {
      setFilters(savedFilters as DashboardFilters);
    }
  }, [restoreFilters, setFilters]);

  return {
    filters,
    setFilters: persistAndSetFilters,
  };
}

/**
 * Hook for managing selected website persistence across sessions
 */
export function useWebsitePersistence() {
  const { state, setSelectedWebsite } = useAppState();

  // Persist selected website
  const persistSelectedWebsite = useCallback(
    (websiteId: string) => {
      setSelectedWebsite(websiteId);
      const currentPrefs = persistentStorage.loadUserPreferences() || {};
      persistentStorage.saveUserPreferences({
        ...currentPrefs,
        selectedWebsiteId: websiteId,
      });
    },
    [setSelectedWebsite]
  );

  // Restore selected website on app load
  useEffect(() => {
    const preferences = persistentStorage.loadUserPreferences() as {
      selectedWebsiteId?: string;
    } | null;
    const savedWebsiteId = preferences?.selectedWebsiteId;

    if (savedWebsiteId && state.workspace.websites.length > 0) {
      const websiteExists = state.workspace.websites.some(
        (w) => w.id === savedWebsiteId
      );
      if (
        websiteExists &&
        savedWebsiteId !== state.workspace.selectedWebsiteId
      ) {
        setSelectedWebsite(savedWebsiteId);
      }
    }
  }, [
    state.workspace.websites,
    state.workspace.selectedWebsiteId,
    setSelectedWebsite,
  ]);

  return {
    selectedWebsiteId: state.workspace.selectedWebsiteId,
    setSelectedWebsite: persistSelectedWebsite,
  };
}
