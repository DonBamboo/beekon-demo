import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react';
import { Website, Workspace } from '@/hooks/useWorkspace';

// Cache entry with expiration and metadata
interface CacheEntry<T = any> {
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
}

export interface CompetitorFilters {
  dateFilter: "7d" | "30d" | "90d";
  sortBy: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore";
}

export interface DashboardFilters {
  period: "7d" | "30d" | "90d";
  dateRange?: { start: string; end: string };
}

// Navigation state
export interface NavigationState {
  currentPage: string;
  previousPage?: string;
  navigationHistory: string[];
  lastPageChangeAt: number;
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
    active: Map<string, Promise<any>>;
    
    // Request queue for batching
    queue: Map<string, { resolve: Function; reject: Function; timestamp: number }[]>;
    
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
  | { type: 'SET_WORKSPACE'; payload: { workspace: Workspace | null; websites: Website[]; loading: boolean } }
  | { type: 'SET_SELECTED_WEBSITE'; payload: { websiteId: string } }
  | { type: 'CACHE_SET'; payload: { key: string; data: any; expiresIn: number; metadata?: any } }
  | { type: 'CACHE_DELETE'; payload: { key: string } }
  | { type: 'CACHE_CLEAR'; payload: { pattern?: string; websiteId?: string } }
  | { type: 'SET_FILTERS'; payload: { page: keyof AppState['ui']['filters']; filters: any } }
  | { type: 'SET_NAVIGATION'; payload: { page: string } }
  | { type: 'SET_LOADING'; payload: { scope: string; loading: boolean } }
  | { type: 'REQUEST_START'; payload: { key: string; promise: Promise<any> } }
  | { type: 'REQUEST_END'; payload: { key: string } };

// Default state
const initialState: AppState = {
  workspace: {
    current: null,
    websites: [],
    selectedWebsiteId: null,
    loading: true,
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
    case 'SET_WORKSPACE':
      return {
        ...state,
        workspace: {
          current: action.payload.workspace,
          websites: action.payload.websites,
          selectedWebsiteId: state.workspace.selectedWebsiteId || action.payload.websites[0]?.id || null,
          loading: action.payload.loading,
        },
      };
      
    case 'SET_SELECTED_WEBSITE':
      return {
        ...state,
        workspace: {
          ...state.workspace,
          selectedWebsiteId: action.payload.websiteId,
        },
      };
      
    case 'CACHE_SET': {
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
      if (metadata?.dependencies) {
        metadata.dependencies.forEach((dep: string) => {
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
    
    case 'CACHE_DELETE': {
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
    
    case 'CACHE_CLEAR': {
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
    
    case 'SET_FILTERS':
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
      
    case 'SET_NAVIGATION':
      return {
        ...state,
        ui: {
          ...state.ui,
          navigation: {
            currentPage: action.payload.page,
            previousPage: state.ui.navigation.currentPage,
            navigationHistory: [...state.ui.navigation.navigationHistory, action.payload.page].slice(-10), // Keep last 10
            lastPageChangeAt: Date.now(),
          },
        },
      };
      
    case 'SET_LOADING':
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
      
    case 'REQUEST_START': {
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
    
    case 'REQUEST_END': {
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
  getFromCache: <T>(key: string) => T | null;
  setCache: <T>(key: string, data: T, expiresIn: number, metadata?: any) => void;
  clearCache: (pattern?: string, websiteId?: string) => void;
  setPageFilters: <T>(page: keyof AppState['ui']['filters'], filters: T) => void;
  navigateToPage: (page: string) => void;
  isRequestActive: (key: string) => boolean;
} | null>(null);

// Provider component
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appStateReducer, initialState);
  
  // Helper functions
  const setSelectedWebsite = useCallback((websiteId: string) => {
    dispatch({ type: 'SET_SELECTED_WEBSITE', payload: { websiteId } });
  }, []);
  
  const getFromCache = useCallback(<T,>(key: string): T | null => {
    const entry = state.cache.memory.get(key);
    if (!entry) return null;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      dispatch({ type: 'CACHE_DELETE', payload: { key } });
      return null;
    }
    
    return entry.data as T;
  }, [state.cache.memory]);
  
  const setCache = useCallback(<T,>(key: string, data: T, expiresIn: number, metadata?: any) => {
    dispatch({ type: 'CACHE_SET', payload: { key, data, expiresIn, metadata } });
  }, []);
  
  const clearCache = useCallback((pattern?: string, websiteId?: string) => {
    dispatch({ type: 'CACHE_CLEAR', payload: { pattern, websiteId } });
  }, []);
  
  const setPageFilters = useCallback(<T,>(page: keyof AppState['ui']['filters'], filters: T) => {
    dispatch({ type: 'SET_FILTERS', payload: { page, filters } });
  }, []);
  
  const navigateToPage = useCallback((page: string) => {
    dispatch({ type: 'SET_NAVIGATION', payload: { page } });
  }, []);
  
  const isRequestActive = useCallback((key: string) => {
    return state.requests.active.has(key);
  }, [state.requests.active]);
  
  // Cleanup expired cache entries periodically
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      state.cache.expiration.forEach((expiresAt, key) => {
        if (now > expiresAt) {
          dispatch({ type: 'CACHE_DELETE', payload: { key } });
        }
      });
    };
    
    const interval = setInterval(cleanup, 60000); // Cleanup every minute
    return () => clearInterval(interval);
  }, [state.cache.expiration]);
  
  return (
    <AppStateContext.Provider
      value={{
        state,
        dispatch,
        setSelectedWebsite,
        getFromCache,
        setCache,
        clearCache,
        setPageFilters,
        navigateToPage,
        isRequestActive,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

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
  const { getFromCache, setCache, clearCache } = useAppState();
  return { getFromCache, setCache, clearCache };
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