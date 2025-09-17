import React, {
  createContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { Website, Workspace } from "@/hooks/useWorkspace";
import { debugError, debugInfo, addDebugEvent } from '@/lib/debug-utils';

// Cache entry with expiration and metadata
interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  expiresAt: number;
  key: string;
  metadata?: {
    websiteId?: string;
    workspaceId?: string;
    dependencies?: string[];
  };
}

// Shared data types that get cached across pages
export interface Topic {
  id: string;
  name: string;
  resultCount: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  description?: string;
  resultCount: number;
}

export interface WebsiteMetadata {
  id: string;
  domain: string;
  displayName: string;
  lastCrawledAt: string;
  crawlStatus: string;
  isActive: boolean;
}

// Filter states for different pages
export interface AnalysisFilters {
  dateRange: string;
  topic: string;
  llm: string;
  mentionStatus: string;
  sentiment: string;
  analysisSession: string;
  searchQuery: string;
  advancedSearchQuery: string;
  [key: string]: unknown;
}

export interface CompetitorFilters {
  dateFilter: "7d" | "30d" | "90d";
  sortBy: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore";
  [key: string]: unknown;
}

export interface DashboardFilters {
  period: "7d" | "30d" | "90d";
  dateRange?: { start: string; end: string };
  [key: string]: unknown;
}

// Navigation state
export interface NavigationState {
  currentPage: string;
  previousPage?: string;
  navigationHistory: string[];
  lastPageChangeAt: number;
}

// Competitor status information
export interface CompetitorStatus {
  competitorId: string;
  websiteId: string;
  status: "pending" | "analyzing" | "completed" | "failed";
  progress?: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

// Complete application state
export interface AppState {
  // Workspace and website management
  workspace: {
    current: Workspace | null;
    websites: Website[];
    selectedWebsiteId: string | null;
    loading: boolean;
  };

  // Competitor status tracking
  competitors: {
    // Map of competitor ID to status information
    statusMap: Map<string, CompetitorStatus>;
    // Track which competitors are actively being monitored
    monitoredCompetitors: Set<string>;
  };

  // Multi-level cache system
  cache: {
    // L1 Cache - In-memory, fast access
    memory: Map<string, CacheEntry>;

    // Cache metadata for intelligent invalidation
    dependencies: Map<string, Set<string>>; // dependency -> cache keys that depend on it
    expiration: Map<string, number>; // cache key -> expiration timestamp
  };

  // UI state management
  ui: {
    // Filter states per page - persist across navigation
    filters: {
      analysis: AnalysisFilters;
      competitors: CompetitorFilters;
      dashboard: DashboardFilters;
    };

    // Navigation tracking
    navigation: NavigationState;

    // Loading states coordination
    loading: {
      global: boolean;
      pages: Record<string, boolean>;
      operations: Record<string, boolean>;
    };
  };

  // Request management
  requests: {
    // Active requests for deduplication
    active: Map<string, Promise<unknown>>;

    // Request queue for batching
    queue: Map<
      string,
      {
        resolve: (value?: unknown) => void;
        reject: (reason?: unknown) => void;
        timestamp: number;
      }[]
    >;

    // Network optimization settings
    settings: {
      batchingEnabled: boolean;
      dedupEnabled: boolean;
      prefetchEnabled: boolean;
    };
  };
}

// Action types for state management
export type AppStateAction =
  | {
      type: "SET_WORKSPACE";
      payload: {
        workspace: Workspace | null;
        websites: Website[];
        loading: boolean;
      };
    }
  | { type: "SET_SELECTED_WEBSITE"; payload: { websiteId: string } }
  | {
      type: "UPDATE_WEBSITE_STATUS";
      payload: {
        websiteId: string;
        status: string;
        lastCrawledAt?: string | null;
        updatedAt: string;
      };
    }
  | {
      type: "SET_WEBSITES";
      payload: {
        websites: Website[];
      };
    }
  | {
      type: "UPDATE_COMPETITOR_STATUS";
      payload: {
        competitorId: string;
        websiteId: string;
        status: string;
        progress?: number;
        errorMessage?: string | null;
        startedAt?: string | null;
        completedAt?: string | null;
        updatedAt: string;
      };
    }
  | {
      type: "CACHE_SET";
      payload: {
        key: string;
        data: unknown;
        expiresIn: number;
        metadata?: Record<string, unknown>;
      };
    }
  | { type: "CACHE_DELETE"; payload: { key: string } }
  | { type: "CACHE_CLEAR"; payload: { pattern?: string; websiteId?: string } }
  | {
      type: "SET_FILTERS";
      payload: { page: keyof AppState["ui"]["filters"]; filters: unknown };
    }
  | { type: "SET_NAVIGATION"; payload: { page: string } }
  | { type: "SET_LOADING"; payload: { scope: string; loading: boolean } }
  | {
      type: "REQUEST_START";
      payload: { key: string; promise: Promise<unknown> };
    }
  | { type: "REQUEST_END"; payload: { key: string } };

// Default state
const initialState: AppState = {
  workspace: {
    current: null,
    websites: [],
    selectedWebsiteId: null,
    loading: true,
  },
  competitors: {
    statusMap: new Map(),
    monitoredCompetitors: new Set(),
  },
  cache: {
    memory: new Map(),
    dependencies: new Map(),
    expiration: new Map(),
  },
  ui: {
    filters: {
      analysis: {
        dateRange: "7d",
        topic: "all",
        llm: "all",
        mentionStatus: "all",
        sentiment: "all",
        analysisSession: "all",
        searchQuery: "",
        advancedSearchQuery: "",
      },
      competitors: {
        dateFilter: "7d",
        sortBy: "shareOfVoice",
      },
      dashboard: {
        period: "7d",
      },
    },
    navigation: {
      currentPage: "/",
      navigationHistory: ["/"],
      lastPageChangeAt: Date.now(),
    },
    loading: {
      global: false,
      pages: {},
      operations: {},
    },
  },
  requests: {
    active: new Map(),
    queue: new Map(),
    settings: {
      batchingEnabled: true,
      dedupEnabled: true,
      prefetchEnabled: true,
    },
  },
};

// State reducer
function appStateReducer(state: AppState, action: AppStateAction): AppState {
  switch (action.type) {
    case "SET_WORKSPACE": {
      const newWebsites = action.payload.websites;
      let selectedWebsiteId = state.workspace.selectedWebsiteId;

      // Intelligent website selection logic
      if (!selectedWebsiteId && newWebsites.length > 0) {
        // No website selected, select the first one
        selectedWebsiteId = newWebsites[0]?.id || null;
      } else if (selectedWebsiteId && newWebsites.length > 0) {
        // Check if currently selected website still exists in new website list
        const selectedWebsiteStillExists = newWebsites.some(
          (w) => w.id === selectedWebsiteId
        );
        if (!selectedWebsiteStillExists) {
          // Selected website no longer exists, select the first available
          selectedWebsiteId = newWebsites[0]?.id || null;
        }
      } else if (newWebsites.length === 0) {
        // No websites available, clear selection
        selectedWebsiteId = null;
      }

      return {
        ...state,
        workspace: {
          current: action.payload.workspace,
          websites: newWebsites,
          selectedWebsiteId,
          loading: action.payload.loading,
        },
      };
    }

    case "SET_SELECTED_WEBSITE":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          selectedWebsiteId: action.payload.websiteId,
        },
      };

    case "UPDATE_WEBSITE_STATUS": {
      const { websiteId, status, lastCrawledAt, updatedAt } = action.payload;
      
      // Get current website to track status transitions
      const currentWebsite = state.workspace.websites.find(w => w.id === websiteId);
      const previousStatus = currentWebsite?.crawl_status;
      
      const updatedWebsites = state.workspace.websites.map((website) =>
        website.id === websiteId
          ? ({
              ...website,
              crawl_status: status,
              last_crawled_at: lastCrawledAt || website.last_crawled_at,
              updated_at: updatedAt || website.updated_at,
            } as Website)
          : website
      );

      // Enhanced event dispatch with transition information
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('websiteStatusUpdate', { 
            detail: { 
              websiteId, 
              status, 
              previousStatus,
              isCompletion: (previousStatus === 'crawling' && status === 'completed'),
              source: 'app-state-context',
              timestamp: Date.now()
            } 
          }));
        }
      }, 0);

      return {
        ...state,
        workspace: {
          ...state.workspace,
          websites: updatedWebsites,
        },
      };
    }

    case "SET_WEBSITES": {
      return {
        ...state,
        workspace: {
          ...state.workspace,
          websites: action.payload.websites,
        },
      };
    }

    case "UPDATE_COMPETITOR_STATUS": {
      const {
        competitorId,
        websiteId,
        status,
        progress,
        errorMessage,
        startedAt,
        completedAt,
        updatedAt,
      } = action.payload;
      const newStatusMap = new Map(state.competitors.statusMap);
      const newMonitoredCompetitors = new Set(
        state.competitors.monitoredCompetitors
      );

      // Update competitor status
      newStatusMap.set(competitorId, {
        competitorId,
        websiteId,
        status: status as CompetitorStatus["status"],
        progress,
        errorMessage,
        startedAt,
        completedAt,
        updatedAt,
      });

      // Add to monitored set if in active state
      if (status === "pending" || status === "analyzing") {
        newMonitoredCompetitors.add(competitorId);
      } else {
        // Remove from monitored set if in terminal state
        newMonitoredCompetitors.delete(competitorId);
      }

      return {
        ...state,
        competitors: {
          statusMap: newStatusMap,
          monitoredCompetitors: newMonitoredCompetitors,
        },
      };
    }

    case "CACHE_SET": {
      const { key, data, expiresIn, metadata } = action.payload;
      const now = Date.now();
      const expiresAt = now + expiresIn;

      const newMemory = new Map(state.cache.memory);
      const newExpiration = new Map(state.cache.expiration);
      const newDependencies = new Map(state.cache.dependencies);

      // Set cache entry
      newMemory.set(key, {
        data,
        timestamp: now,
        expiresAt,
        key,
        metadata,
      });

      newExpiration.set(key, expiresAt);

      // Track dependencies for invalidation
      if (
        metadata &&
        "dependencies" in metadata &&
        Array.isArray(metadata.dependencies)
      ) {
        (metadata.dependencies as string[]).forEach((dep: string) => {
          if (!newDependencies.has(dep)) {
            newDependencies.set(dep, new Set());
          }
          newDependencies.get(dep)!.add(key);
        });
      }

      return {
        ...state,
        cache: {
          memory: newMemory,
          dependencies: newDependencies,
          expiration: newExpiration,
        },
      };
    }

    case "CACHE_DELETE": {
      const { key } = action.payload;
      const newMemory = new Map(state.cache.memory);
      const newExpiration = new Map(state.cache.expiration);
      const newDependencies = new Map(state.cache.dependencies);

      // Remove cache entry
      newMemory.delete(key);
      newExpiration.delete(key);

      // Clean up dependencies
      newDependencies.forEach((keys, dep) => {
        keys.delete(key);
        if (keys.size === 0) {
          newDependencies.delete(dep);
        }
      });

      return {
        ...state,
        cache: {
          memory: newMemory,
          dependencies: newDependencies,
          expiration: newExpiration,
        },
      };
    }

    case "CACHE_CLEAR": {
      const { pattern, websiteId } = action.payload;
      const newMemory = new Map(state.cache.memory);
      const newExpiration = new Map(state.cache.expiration);
      const newDependencies = new Map(state.cache.dependencies);

      // Clear matching cache entries
      state.cache.memory.forEach((entry, key) => {
        let shouldDelete = false;

        if (pattern && key.includes(pattern)) {
          shouldDelete = true;
        } else if (websiteId && entry.metadata?.websiteId === websiteId) {
          shouldDelete = true;
        } else if (!pattern && !websiteId) {
          shouldDelete = true; // Clear all
        }

        if (shouldDelete) {
          newMemory.delete(key);
          newExpiration.delete(key);

          // Clean up dependencies
          newDependencies.forEach((keys, dep) => {
            keys.delete(key);
            if (keys.size === 0) {
              newDependencies.delete(dep);
            }
          });
        }
      });

      return {
        ...state,
        cache: {
          memory: newMemory,
          dependencies: newDependencies,
          expiration: newExpiration,
        },
      };
    }

    case "SET_FILTERS":
      return {
        ...state,
        ui: {
          ...state.ui,
          filters: {
            ...state.ui.filters,
            [action.payload.page]: action.payload.filters,
          },
        },
      };

    case "SET_NAVIGATION":
      return {
        ...state,
        ui: {
          ...state.ui,
          navigation: {
            currentPage: action.payload.page,
            previousPage: state.ui.navigation.currentPage,
            navigationHistory: [
              ...state.ui.navigation.navigationHistory,
              action.payload.page,
            ].slice(-10), // Keep last 10
            lastPageChangeAt: Date.now(),
          },
        },
      };

    case "SET_LOADING":
      return {
        ...state,
        ui: {
          ...state.ui,
          loading: {
            ...state.ui.loading,
            [action.payload.scope]: action.payload.loading,
          },
        },
      };

    case "REQUEST_START": {
      const newActive = new Map(state.requests.active);
      newActive.set(action.payload.key, action.payload.promise);

      return {
        ...state,
        requests: {
          ...state.requests,
          active: newActive,
        },
      };
    }

    case "REQUEST_END": {
      const newActive = new Map(state.requests.active);
      newActive.delete(action.payload.key);

      return {
        ...state,
        requests: {
          ...state.requests,
          active: newActive,
        },
      };
    }

    default:
      return state;
  }
}

// Context creation
const AppStateContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppStateAction>;
  // Helper functions for common operations
  setSelectedWebsite: (websiteId: string) => void;
  setWebsites: (websites: Website[]) => void;
  updateWebsiteStatus: (
    websiteId: string,
    status: string,
    lastCrawledAt?: string | null,
    updatedAt?: string
  ) => void;
  updateCompetitorStatus: (
    competitorId: string,
    websiteId: string,
    status: string,
    progress?: number,
    errorMessage?: string | null,
    startedAt?: string | null,
    completedAt?: string | null,
    updatedAt?: string
  ) => void;
  getCompetitorStatus: (competitorId: string) => CompetitorStatus | null;
  isCompetitorMonitored: (competitorId: string) => boolean;
  getMonitoredCompetitors: () => string[];
  clearCompetitorStatus: (competitorId?: string) => void;
  getFromCache: <T>(key: string) => T | null;
  setCache: <T>(
    key: string,
    data: T,
    expiresIn: number,
    metadata?: Record<string, unknown>
  ) => void;
  clearCache: (pattern?: string, websiteId?: string) => void;
  invalidateDependentCaches: (dependency: string) => void;
  setPageFilters: <T>(
    page: keyof AppState["ui"]["filters"],
    filters: T
  ) => void;
  navigateToPage: (page: string) => void;
  isRequestActive: (key: string) => boolean;
  getCurrentPage: () => string;
} | null>(null);

// Provider component
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appStateReducer, initialState);

  // Use ref to access current state without causing re-renders
  const stateRef = useRef(state);
  stateRef.current = state;

  // Helper functions
  const setSelectedWebsite = useCallback((websiteId: string) => {
    dispatch({ type: "SET_SELECTED_WEBSITE", payload: { websiteId } });
  }, []);

  const setWebsites = useCallback((websites: Website[]) => {
    dispatch({ type: "SET_WEBSITES", payload: { websites } });
  }, []);

  // Note: updateWebsiteStatus will be defined after other cache functions

  // Ref to track expired cache keys for deferred cleanup
  const expiredKeysRef = useRef<Set<string>>(new Set());

  // Stabilized getFromCache - no dependencies on state
  // Fixed: Defer cache cleanup to avoid setState during render
  const getFromCache = useCallback(<T,>(key: string): T | null => {
    const entry = stateRef.current.cache.memory.get(key);
    if (!entry) return null;

    // Check expiration - defer cleanup to avoid render-time dispatch
    if (Date.now() > entry.expiresAt) {
      expiredKeysRef.current.add(key);
      return null;
    }

    return entry.data as T;
  }, []);

  const setCache = useCallback(
    <T,>(
      key: string,
      data: T,
      expiresIn: number,
      metadata?: Record<string, unknown>
    ) => {
      dispatch({
        type: "CACHE_SET",
        payload: { key, data, expiresIn, metadata },
      });
    },
    []
  );

  const clearCache = useCallback((pattern?: string, websiteId?: string) => {
    dispatch({ type: "CACHE_CLEAR", payload: { pattern, websiteId } });
  }, []);

  // Intelligent cache invalidation based on dependencies - stabilized
  const invalidateDependentCaches = useCallback((dependency: string) => {
    const dependentKeys = stateRef.current.cache.dependencies.get(dependency);
    if (dependentKeys) {
      dependentKeys.forEach((key) => {
        dispatch({ type: "CACHE_DELETE", payload: { key } });
      });
    }
  }, []);

  const setPageFilters = useCallback(
    <T,>(page: keyof AppState["ui"]["filters"], filters: T) => {
      dispatch({ type: "SET_FILTERS", payload: { page, filters } });
    },
    []
  );

  const navigateToPage = useCallback((page: string) => {
    dispatch({ type: "SET_NAVIGATION", payload: { page } });
  }, []);

  const isRequestActive = useCallback((key: string) => {
    return stateRef.current.requests.active.has(key);
  }, []);

  const getCurrentPage = useCallback(() => {
    return stateRef.current.ui.navigation.currentPage;
  }, []);

  // Competitor status management functions
  const updateCompetitorStatus = useCallback(
    (
      competitorId: string,
      websiteId: string,
      status: string,
      progress?: number,
      errorMessage?: string | null,
      startedAt?: string | null,
      completedAt?: string | null,
      updatedAt?: string
    ) => {
      dispatch({
        type: "UPDATE_COMPETITOR_STATUS",
        payload: {
          competitorId,
          websiteId,
          status,
          progress,
          errorMessage,
          startedAt,
          completedAt,
          updatedAt: updatedAt || new Date().toISOString(),
        },
      });

      // Comprehensive cache invalidation for competitor status updates
      invalidateDependentCaches(`competitor_${competitorId}`);
      invalidateDependentCaches(`website_${websiteId}_competitors`);
      
      // Invalidate main competitors data cache to force UI refresh
      clearCache(`competitors_data_${websiteId}`);
      clearCache(`competitors_performance_${websiteId}`);
      clearCache(`competitors_analytics_${websiteId}`);
      
      // Clear all filtered cache variants for this website
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('app_cache_competitors_filtered_' + websiteId)
      );
      cacheKeys.forEach(key => {
        const cacheKey = key.replace('app_cache_', '');
        clearCache(cacheKey);
      });
      
      // Also invalidate optimized page data caches
      clearCache(`optimized_competitors_${websiteId}`);
      
      // Force immediate UI refresh with custom event
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('competitorStatusUpdate', {
            detail: {
              competitorId,
              websiteId,
              status,
              progress,
              source: 'app-state-context',
              timestamp: Date.now()
            }
          }));
        }
      }, 0);
    },
    [invalidateDependentCaches, clearCache]
  );

  const getCompetitorStatus = useCallback(
    (competitorId: string): CompetitorStatus | null => {
      return stateRef.current.competitors.statusMap.get(competitorId) || null;
    },
    []
  );

  const isCompetitorMonitored = useCallback((competitorId: string): boolean => {
    return stateRef.current.competitors.monitoredCompetitors.has(competitorId);
  }, []);

  const getMonitoredCompetitors = useCallback((): string[] => {
    return Array.from(stateRef.current.competitors.monitoredCompetitors);
  }, []);

  const clearCompetitorStatus = useCallback((competitorId?: string) => {
    if (competitorId) {
      // Clear specific competitor status
      const newStatusMap = new Map(stateRef.current.competitors.statusMap);
      const newMonitoredCompetitors = new Set(
        stateRef.current.competitors.monitoredCompetitors
      );

      newStatusMap.delete(competitorId);
      newMonitoredCompetitors.delete(competitorId);

      dispatch({
        type: "UPDATE_COMPETITOR_STATUS",
        payload: {
          competitorId,
          websiteId: "",
          status: "pending",
          updatedAt: new Date().toISOString(),
        },
      });
    } else {
      // Clear all competitor status - we'll need to implement this as a new action if needed
    }
  }, []);

  const updateWebsiteStatus = useCallback(
    (
      websiteId: string,
      status: string,
      lastCrawledAt?: string | null,
      updatedAt?: string
    ) => {
      try {
        // Get current website to track transitions
        const currentWebsite = state.workspace.websites.find(w => w.id === websiteId);
        const previousStatus = currentWebsite?.crawl_status;
        const isCompletion = previousStatus === 'crawling' && status === 'completed';
        
        // Log state update to debug monitor with transition info
        addDebugEvent({
          type: 'app-state',
          category: 'ui',
          source: 'AppStateContext',
          message: isCompletion ? 'Website analysis completed' : 'Website status updated',
          details: {
            websiteId,
            status,
            previousStatus,
            isCompletion,
            lastCrawledAt,
            updatedAt: updatedAt || new Date().toISOString(),
          },
          websiteId,
          severity: isCompletion ? 'medium' : 'low',
        });

        dispatch({
          type: "UPDATE_WEBSITE_STATUS",
          payload: {
            websiteId,
            status,
            lastCrawledAt,
            updatedAt: updatedAt || new Date().toISOString(),
          },
        });

        // Invalidate website-related caches when status updates
        invalidateDependentCaches(`website_${websiteId}`);

        // Also clear workspace cache to trigger refresh of website lists
        clearCache("workspace_");

        debugInfo(
          `Website status updated successfully: ${websiteId} -> ${status}`,
          'AppStateContext',
          {
            websiteId,
            status,
            cachesInvalidated: true,
          },
          'ui'
        );
      } catch (error) {
        debugError(
          `Failed to update website status: ${error instanceof Error ? error.message : String(error)}`,
          'AppStateContext',
          {
            websiteId,
            status,
            error: error instanceof Error ? error.stack : String(error),
          },
          error instanceof Error ? error : undefined,
          'ui'
        );
      }
    },
    [clearCache, invalidateDependentCaches, state.workspace.websites]
  );

  // Intelligent cache cleanup and optimization - FIXED: removed state dependencies to prevent infinite loop
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      let cleanedCount = 0;
      
      // Use current state reference to avoid dependency on changing state
      const currentState = stateRef.current;

      // Clean expired entries
      currentState.cache.expiration.forEach((expiresAt, key) => {
        if (now > expiresAt) {
          dispatch({ type: "CACHE_DELETE", payload: { key } });
          cleanedCount++;
        }
      });

      // Memory management: If cache gets too large (>100 entries), clean oldest entries
      if (currentState.cache.memory.size > 100) {
        const entries = Array.from(currentState.cache.memory.entries());
        const sortedByAge = entries.sort(
          ([, a], [, b]) => a.timestamp - b.timestamp
        );
        const toDelete = sortedByAge.slice(
          0,
          Math.floor(currentState.cache.memory.size * 0.2)
        ); // Remove oldest 20%

        toDelete.forEach(([key]) => {
          dispatch({ type: "CACHE_DELETE", payload: { key } });
          cleanedCount++;
        });
      }

    };

    const interval = setInterval(cleanup, 120000); // Cleanup every 2 minutes
    return () => clearInterval(interval);
  }, []); // Empty dependencies - no longer depends on changing cache state

  // Effect to clean up expired cache entries (deferred from getFromCache)
  useEffect(() => {
    if (expiredKeysRef.current.size > 0) {
      // Process expired keys after render to avoid setState during render warning
      const keysToDelete = Array.from(expiredKeysRef.current);
      expiredKeysRef.current.clear();

      keysToDelete.forEach(key => {
        dispatch({ type: "CACHE_DELETE", payload: { key } });
      });
    }
  }); // No dependencies - run after every render to check for expired keys

  return (
    <AppStateContext.Provider
      value={{
        state,
        dispatch,
        setSelectedWebsite,
        setWebsites,
        updateWebsiteStatus,
        updateCompetitorStatus,
        getCompetitorStatus,
        isCompetitorMonitored,
        getMonitoredCompetitors,
        clearCompetitorStatus,
        getFromCache,
        setCache,
        clearCache,
        invalidateDependentCaches,
        setPageFilters,
        navigateToPage,
        isRequestActive,
        getCurrentPage,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

// Export the context for the separate hooks file
export { AppStateContext };
