import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '@/hooks/appStateHooks';
import type { Topic, LLMProvider, WebsiteMetadata } from '@/contexts/AppStateContext';
import { analysisService } from '@/services/analysisService';
import { useToast } from './use-toast';

// Cache durations in milliseconds
const CACHE_DURATIONS = {
  topics: 30 * 60 * 1000,      // 30 minutes - topics don't change often
  llmProviders: 60 * 60 * 1000, // 60 minutes - LLM providers very stable
  websiteMetadata: 15 * 60 * 1000, // 15 minutes - metadata changes more frequently
  analysisResults: 5 * 60 * 1000,  // 5 minutes - analysis data changes frequently
} as const;

/**
 * Shared hook for managing topics data with intelligent caching
 * Reduces duplicate API calls across Analysis page components
 */
export function useTopics(websiteId: string | null) {
  const { getFromCache, setCache, clearCache, isRequestActive, dispatch } = useAppState();
  const { toast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // FIXED: Use useMemo to stabilize cache and request keys to prevent infinite loops
  const cacheKey = useMemo(() => `topics_${websiteId}`, [websiteId]);
  const requestKey = useMemo(() => `fetch_topics_${websiteId}`, [websiteId]);

  const loadTopics = useCallback(async (forceRefresh = false) => {
    if (!websiteId) {
      setTopics([]);
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedTopics = getFromCache<Topic[]>(cacheKey);
      if (cachedTopics) {
        setTopics(cachedTopics);
        return;
      }
    }

    // Check if request is already in progress (deduplication)
    if (isRequestActive(requestKey)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Start request tracking
      const requestPromise = analysisService.getTopicsForWebsite(websiteId);
      dispatch({ type: 'REQUEST_START', payload: { key: requestKey, promise: requestPromise } });

      const websiteTopics = await requestPromise;

      // Transform to include "All Topics" option
      const topicsWithAll: Topic[] = [
        {
          id: "all",
          name: "All Topics", 
          resultCount: websiteTopics.reduce((sum, topic) => sum + topic.resultCount, 0),
        },
        ...websiteTopics,
      ];

      // Update state and cache
      setTopics(topicsWithAll);
      setCache(cacheKey, topicsWithAll, CACHE_DURATIONS.topics, {
        websiteId,
        dependencies: [`website_${websiteId}`, 'topics_global'],
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load topics');
      setError(error);
      
      if (!forceRefresh) {
        toast({
          title: "Error loading topics",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      dispatch({ type: 'REQUEST_END', payload: { key: requestKey } });
    }
  }, [websiteId, getFromCache, setCache, isRequestActive, dispatch, toast, cacheKey, requestKey]);

  // Load topics when websiteId changes
  useEffect(() => {
    if (websiteId) {
      loadTopics();
    }
  }, [websiteId, loadTopics]);

  // Invalidate cache when website changes
  useEffect(() => {
    return () => {
      if (websiteId) {
        clearCache(undefined, websiteId);
      }
    };
  }, [websiteId, clearCache]);

  return {
    topics,
    loading,
    error,
    refetch: () => loadTopics(true),
    clearError: () => setError(null),
  };
}

/**
 * Shared hook for managing LLM providers data with intelligent caching
 * Reduces duplicate API calls across Analysis page components
 */
export function useLLMProviders(websiteId: string | null) {
  const { getFromCache, setCache, isRequestActive, dispatch } = useAppState();
  const { toast } = useToast();
  const [llmProviders, setLLMProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // FIXED: Use useMemo to stabilize cache and request keys to prevent infinite loops
  const cacheKey = useMemo(() => `llm_providers_${websiteId}`, [websiteId]);
  const requestKey = useMemo(() => `fetch_llm_providers_${websiteId}`, [websiteId]);

  const loadLLMProviders = useCallback(async (forceRefresh = false) => {
    if (!websiteId) {
      setLLMProviders([]);
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedProviders = getFromCache<LLMProvider[]>(cacheKey);
      if (cachedProviders) {
        setLLMProviders(cachedProviders);
        return;
      }
    }

    // Check if request is already in progress (deduplication)
    if (isRequestActive(requestKey)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Start request tracking
      const requestPromise = analysisService.getAvailableLLMProviders(websiteId);
      dispatch({ type: 'REQUEST_START', payload: { key: requestKey, promise: requestPromise } });

      const providersData = await requestPromise;

      // Transform to include "All LLMs" option
      const providersWithAll: LLMProvider[] = [
        {
          id: "all",
          name: "All LLMs",
          description: "All available LLM providers",
          resultCount: providersData.reduce((sum, provider) => sum + provider.resultCount, 0),
        },
        ...providersData,
      ];

      // Update state and cache
      setLLMProviders(providersWithAll);
      setCache(cacheKey, providersWithAll, CACHE_DURATIONS.llmProviders, {
        websiteId,
        dependencies: [`website_${websiteId}`, 'llm_providers_global'],
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load LLM providers');
      setError(error);

      if (!forceRefresh) {
        toast({
          title: "Error loading LLM providers", 
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      dispatch({ type: 'REQUEST_END', payload: { key: requestKey } });
    }
  }, [websiteId, getFromCache, setCache, isRequestActive, dispatch, toast, cacheKey, requestKey]);

  // Load LLM providers when websiteId changes
  useEffect(() => {
    if (websiteId) {
      loadLLMProviders();
    }
  }, [websiteId, loadLLMProviders]);

  return {
    llmProviders,
    loading,
    error,
    refetch: () => loadLLMProviders(true),
    clearError: () => setError(null),
  };
}

/**
 * Shared hook for managing website metadata with intelligent caching
 * Provides consistent website information across all components
 */
export function useWebsiteMetadata(websiteId: string | null) {
  const { getFromCache, setCache, isRequestActive, dispatch } = useAppState();
  const { toast } = useToast();
  const [metadata, setMetadata] = useState<WebsiteMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // FIXED: Use useMemo to stabilize cache and request keys to prevent infinite loops
  const cacheKey = useMemo(() => `website_metadata_${websiteId}`, [websiteId]);
  const requestKey = useMemo(() => `fetch_website_metadata_${websiteId}`, [websiteId]);

  const loadMetadata = useCallback(async (forceRefresh = false) => {
    if (!websiteId) {
      setMetadata(null);
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedMetadata = getFromCache<WebsiteMetadata>(cacheKey);
      if (cachedMetadata) {
        setMetadata(cachedMetadata);
        return;
      }
    }

    // Check if request is already in progress (deduplication)
    if (isRequestActive(requestKey)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Start request tracking
      const requestPromise = analysisService.getWebsiteMetadata(websiteId);
      dispatch({ type: 'REQUEST_START', payload: { key: requestKey, promise: requestPromise } });

      const metadataResult = await requestPromise;

      // Update state and cache
      setMetadata(metadataResult);
      setCache(cacheKey, metadataResult, CACHE_DURATIONS.websiteMetadata, {
        websiteId,
        dependencies: [`website_${websiteId}`],
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load website metadata');
      setError(error);

      if (!forceRefresh) {
        toast({
          title: "Error loading website metadata",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      dispatch({ type: 'REQUEST_END', payload: { key: requestKey } });
    }
  }, [websiteId, getFromCache, setCache, isRequestActive, dispatch, toast, cacheKey, requestKey]);

  // Load metadata when websiteId changes
  useEffect(() => {
    if (websiteId) {
      loadMetadata();
    }
  }, [websiteId, loadMetadata]);

  return {
    metadata,
    loading,
    error,
    refetch: () => loadMetadata(true),
    clearError: () => setError(null),
  };
}

/**
 * Combined hook that loads all shared data for a website in parallel
 * Optimizes initial page loading by batching related requests
 */
export function useWebsiteData(websiteId: string | null) {
  const topics = useTopics(websiteId);
  const llmProviders = useLLMProviders(websiteId);
  const metadata = useWebsiteMetadata(websiteId);

  const loading = topics.loading || llmProviders.loading || metadata.loading;
  const hasError = !!(topics.error || llmProviders.error || metadata.error);

  const refetchAll = useCallback(() => {
    topics.refetch();
    llmProviders.refetch();
    metadata.refetch();
  }, [topics, llmProviders, metadata]);

  const clearAllErrors = useCallback(() => {
    topics.clearError();
    llmProviders.clearError();
    metadata.clearError();
  }, [topics, llmProviders, metadata]);

  return {
    topics: topics.topics,
    llmProviders: llmProviders.llmProviders,
    metadata: metadata.metadata,
    loading,
    hasError,
    errors: {
      topics: topics.error,
      llmProviders: llmProviders.error,
      metadata: metadata.error,
    },
    refetch: refetchAll,
    clearErrors: clearAllErrors,
  };
}

/**
 * Hook for managing cache invalidation based on user actions
 * Provides intelligent cache management across the application
 */
export function useCacheManager() {
  const { clearCache } = useAppState();

  const invalidateWebsiteCache = useCallback((websiteId: string) => {
    // Clear all cache entries for this website
    clearCache(undefined, websiteId);
  }, [clearCache]);

  const invalidateGlobalCache = useCallback((pattern?: string) => {
    // Clear cache entries matching pattern
    clearCache(pattern);
  }, [clearCache]);

  const invalidateTopics = useCallback((websiteId?: string) => {
    if (websiteId) {
      clearCache(`topics_${websiteId}`);
    } else {
      clearCache('topics_');
    }
  }, [clearCache]);

  const invalidateLLMProviders = useCallback((websiteId?: string) => {
    if (websiteId) {
      clearCache(`llm_providers_${websiteId}`);
    } else {
      clearCache('llm_providers_');
    }
  }, [clearCache]);

  const invalidateMetadata = useCallback((websiteId?: string) => {
    if (websiteId) {
      clearCache(`website_metadata_${websiteId}`);
    } else {
      clearCache('website_metadata_');
    }
  }, [clearCache]);

  return {
    invalidateWebsiteCache,
    invalidateGlobalCache,
    invalidateTopics,
    invalidateLLMProviders,
    invalidateMetadata,
  };
}