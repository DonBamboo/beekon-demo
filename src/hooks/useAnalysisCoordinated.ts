import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { analysisService } from "@/services/analysisService";
import { UIAnalysisResult } from "@/types/database";

interface FilterOptions {
  topic?: string;
  llmProvider?: string;
  dateRange?: { start: string; end: string };
  searchQuery?: string;
  mentionStatus?: string;
  confidenceRange?: [number, number];
  sentiment?: string;
  analysisSession?: string;
}

interface InfiniteScrollOptions {
  initialLimit?: number;
  loadMoreLimit?: number;
  prefetchThreshold?: number;
}

interface UseAnalysisCoordinatedReturn {
  loadedResults: UIAnalysisResult[];
  hasMore: boolean;
  isLoading: boolean;
  isInitialLoad: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  totalLoaded: number;
  placeholderCount: number;
}

export function useAnalysisCoordinated(
  websiteId: string,
  filters: FilterOptions,
  advancedSearchQuery?: string,
  searchInResponses?: boolean,
  searchInInsights?: boolean,
  sortBy?: string,
  sortOrder?: string,
  options: InfiniteScrollOptions = {}
): UseAnalysisCoordinatedReturn {
  const { initialLimit = 20, loadMoreLimit = 20 } = options;

  // State management
  const [loadedResults, setLoadedResults] = useState<UIAnalysisResult[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [placeholderCount, setPlaceholderCount] = useState(initialLimit);

  // Track previous filters to detect changes
  const previousFiltersRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestCacheRef = useRef<Map<string, Promise<{ results: UIAnalysisResult[]; hasMore: boolean; cursor: string | null }>>>(new Map());

  // Serialize filters for comparison
  const filtersKey = useMemo(() => {
    return JSON.stringify({
      websiteId,
      filters,
      advancedSearchQuery,
      searchInResponses,
      searchInInsights,
      sortBy,
      sortOrder,
    });
  }, [websiteId, filters, advancedSearchQuery, searchInResponses, searchInInsights, sortBy, sortOrder]);

  // Sorting utility function
  const sortResults = useCallback(
    (results: UIAnalysisResult[], sortBy: string, sortOrder: string) => {
      return [...results].sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case "date":
            comparison =
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime();
            break;
          case "confidence":
            comparison = a.confidence - b.confidence;
            break;
          case "mentions": {
            const aMentions = a.llm_results.filter(
              (llm) => llm.is_mentioned
            ).length;
            const bMentions = b.llm_results.filter(
              (llm) => llm.is_mentioned
            ).length;
            comparison = aMentions - bMentions;
            break;
          }
          case "rank": {
            const aAvgRank =
              a.llm_results
                .filter((llm) => llm.rank_position !== null)
                .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) /
                a.llm_results.filter((llm) => llm.rank_position !== null)
                  .length || 0;
            const bAvgRank =
              b.llm_results
                .filter((llm) => llm.rank_position !== null)
                .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) /
                b.llm_results.filter((llm) => llm.rank_position !== null)
                  .length || 0;
            comparison = aAvgRank - bAvgRank;
            break;
          }
          default:
            comparison = 0;
        }

        return sortOrder === "asc" ? comparison : -comparison;
      });
    },
    []
  );

  // Enhanced search function
  const performAdvancedSearch = useCallback(
    (
      results: UIAnalysisResult[],
      query: string,
      searchInResponses: boolean,
      searchInInsights: boolean
    ) => {
      if (!query.trim()) return results;

      const searchTerm = query.toLowerCase().trim();

      return results.filter((result) => {
        // Basic search in prompt and topic
        if (
          result.prompt.toLowerCase().includes(searchTerm) ||
          result.topic.toLowerCase().includes(searchTerm) ||
          (result.analysis_name &&
            result.analysis_name.toLowerCase().includes(searchTerm))
        ) {
          return true;
        }

        // Search in LLM responses if enabled
        if (searchInResponses) {
          const hasResponseMatch = result.llm_results.some(
            (llm) =>
              llm.response_text?.toLowerCase().includes(searchTerm) ||
              llm.summary_text?.toLowerCase().includes(searchTerm)
          );
          if (hasResponseMatch) return true;
        }

        // Search in insights if enabled
        if (searchInInsights) {
          const hasInsightMatch =
            result.prompt_strengths?.some((strength) =>
              strength.toLowerCase().includes(searchTerm)
            ) ||
            result.prompt_opportunities?.some((opp) =>
              opp.toLowerCase().includes(searchTerm)
            ) ||
            result.recommendation_text?.toLowerCase().includes(searchTerm) ||
            result.reporting_text?.toLowerCase().includes(searchTerm);
          if (hasInsightMatch) return true;
        }

        return false;
      });
    },
    []
  );

  // Load initial results with request deduplication
  const loadInitialResults = useCallback(async () => {
    if (!websiteId) return;

    // Create a unique request key for deduplication
    const requestKey = `${websiteId}-${JSON.stringify(filters)}-${advancedSearchQuery}-${searchInResponses}-${searchInInsights}-${sortBy}-${sortOrder}-${initialLimit}`;
    
    // Check if identical request is already in progress
    if (requestCacheRef.current.has(requestKey)) {
      return requestCacheRef.current.get(requestKey);
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    
    // Show placeholders immediately to prevent empty state flickering
    if (isInitialLoad) {
      setPlaceholderCount(initialLimit);
    }

    // Create the request promise and cache it
    const requestPromise = (async () => {
      try {
        const response = await analysisService.getAnalysisResultsPaginated(
          websiteId,
          {
            limit: initialLimit,
            filters,
          }
        );

        let results = response.results;

        // Apply advanced search if enabled
        if (advancedSearchQuery?.trim()) {
          results = performAdvancedSearch(
            results,
            advancedSearchQuery,
            searchInResponses || false,
            searchInInsights || false
          );
        }

        // Apply sorting
        if (sortBy && sortOrder) {
          results = sortResults(results, sortBy, sortOrder);
        }

        setLoadedResults(results);
        setHasMore(response.hasMore);
        setCursor(response.nextCursor);
        setPlaceholderCount(0);
        
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }

        return { results, hasMore: response.hasMore, cursor: response.nextCursor };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err; // Let abort errors bubble up
        }
        
        setError(err as Error);
        setLoadedResults([]);
        setHasMore(false);
        setPlaceholderCount(0);
        throw err;
      } finally {
        setIsLoading(false);
        // Remove from cache when completed (success or error)
        requestCacheRef.current.delete(requestKey);
      }
    })();

    // Cache the promise
    requestCacheRef.current.set(requestKey, requestPromise);

    return requestPromise;
  }, [
    websiteId,
    filters,
    advancedSearchQuery,
    searchInResponses,
    searchInInsights,
    sortBy,
    sortOrder,
    initialLimit,
    performAdvancedSearch,
    sortResults,
    isInitialLoad,
  ]);

  // Load more results
  const loadMore = useCallback(async () => {
    if (!websiteId || !hasMore || isLoadingMore || !cursor) return;

    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await analysisService.getAnalysisResultsPaginated(
        websiteId,
        {
          cursor,
          limit: loadMoreLimit,
          filters,
        }
      );

      let newResults = response.results;

      // Apply advanced search if enabled
      if (advancedSearchQuery?.trim()) {
        newResults = performAdvancedSearch(
          newResults,
          advancedSearchQuery,
          searchInResponses || false,
          searchInInsights || false
        );
      }

      setLoadedResults((prev) => {
        const combined = [...prev, ...newResults];
        // Apply sorting to the combined results if needed
        if (sortBy && sortOrder) {
          return sortResults(combined, sortBy, sortOrder);
        }
        return combined;
      });

      setHasMore(response.hasMore);
      setCursor(response.nextCursor);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    websiteId,
    hasMore,
    isLoadingMore,
    cursor,
    loadMoreLimit,
    filters,
    advancedSearchQuery,
    searchInResponses,
    searchInInsights,
    sortBy,
    sortOrder,
    performAdvancedSearch,
    sortResults,
  ]);

  // Refresh (reset and reload)
  const refresh = useCallback(async () => {
    setLoadedResults([]);
    setHasMore(true);
    setCursor(null);
    setPlaceholderCount(initialLimit);
    await loadInitialResults();
  }, [loadInitialResults, initialLimit]);

  // Load data immediately when filters change (no debouncing)
  useEffect(() => {
    const hasFiltersChanged = previousFiltersRef.current !== filtersKey;
    
    if (hasFiltersChanged) {
      const previousFilters = previousFiltersRef.current ? JSON.parse(previousFiltersRef.current) : {};
      const currentFilters = JSON.parse(filtersKey);
      const websiteChanged = previousFilters.websiteId !== currentFilters.websiteId;
      
      previousFiltersRef.current = filtersKey;
      
      if (websiteChanged) {
        // Immediate optimistic update for website changes
        setLoadedResults([]);
        setError(null);
        setIsInitialLoad(true);
        setPlaceholderCount(initialLimit);
        
        // Load data immediately - no debouncing for website changes
        loadInitialResults().catch(err => {
          if (err?.name !== 'AbortError') {
            console.error('Failed to load analysis data:', err);
          }
        });
      } else {
        // For non-website changes (filters, search), load immediately as well
        // The request deduplication will handle rapid changes automatically
        loadInitialResults().catch(err => {
          if (err?.name !== 'AbortError') {
            console.error('Failed to load analysis data:', err);
          }
        });
      }
    }
  }, [filtersKey, loadInitialResults, initialLimit]);

  // Cleanup on unmount
  useEffect(() => {
    const currentCache = requestCacheRef.current;
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear request cache
      currentCache.clear();
    };
  }, []);

  // Memoized return value
  return useMemo(
    () => ({
      loadedResults,
      hasMore,
      isLoading,
      isInitialLoad,
      isLoadingMore,
      error,
      loadMore,
      refresh,
      totalLoaded: loadedResults.length,
      placeholderCount,
    }),
    [loadedResults, hasMore, isLoading, isInitialLoad, isLoadingMore, error, loadMore, refresh, placeholderCount]
  );
}