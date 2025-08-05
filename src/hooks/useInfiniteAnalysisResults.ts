import { useState, useEffect, useCallback, useMemo } from 'react';
import { analysisService, PaginatedAnalysisResults } from '@/services/analysisService';
import { UIAnalysisResult } from '@/types/database';

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

interface UseInfiniteAnalysisResultsReturn {
  loadedResults: UIAnalysisResult[];
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  totalLoaded: number;
}

export function useInfiniteAnalysisResults(
  websiteId: string,
  filters: FilterOptions,
  advancedSearchQuery?: string,
  searchInResponses?: boolean,
  searchInInsights?: boolean,
  sortBy?: string,
  sortOrder?: string,
  options: InfiniteScrollOptions = {}
): UseInfiniteAnalysisResultsReturn {
  const {
    initialLimit = 20,
    loadMoreLimit = 20,
  } = options;

  // State management
  const [loadedResults, setLoadedResults] = useState<UIAnalysisResult[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Sorting utility function
  const sortResults = useCallback((results: UIAnalysisResult[], sortBy: string, sortOrder: string) => {
    return [...results].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "date":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "confidence":
          comparison = a.confidence - b.confidence;
          break;
        case "mentions":
          const aMentions = a.llm_results.filter(llm => llm.is_mentioned).length;
          const bMentions = b.llm_results.filter(llm => llm.is_mentioned).length;
          comparison = aMentions - bMentions;
          break;
        case "rank":
          const aAvgRank = a.llm_results
            .filter(llm => llm.rank_position !== null)
            .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) / 
            a.llm_results.filter(llm => llm.rank_position !== null).length || 0;
          const bAvgRank = b.llm_results
            .filter(llm => llm.rank_position !== null)
            .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) / 
            b.llm_results.filter(llm => llm.rank_position !== null).length || 0;
          comparison = aAvgRank - bAvgRank;
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, []);

  // Enhanced search function
  const performAdvancedSearch = useCallback((
    results: UIAnalysisResult[], 
    query: string, 
    searchInResponses: boolean, 
    searchInInsights: boolean
  ) => {
    if (!query.trim()) return results;
    
    const searchTerm = query.toLowerCase().trim();
    
    return results.filter(result => {
      // Basic search in prompt and topic
      if (result.prompt.toLowerCase().includes(searchTerm) ||
          result.topic.toLowerCase().includes(searchTerm) ||
          (result.analysis_name && result.analysis_name.toLowerCase().includes(searchTerm))) {
        return true;
      }
      
      // Search in LLM responses if enabled
      if (searchInResponses) {
        const hasResponseMatch = result.llm_results.some(llm => 
          llm.response_text?.toLowerCase().includes(searchTerm) ||
          llm.summary_text?.toLowerCase().includes(searchTerm)
        );
        if (hasResponseMatch) return true;
      }
      
      // Search in insights if enabled
      if (searchInInsights) {
        const hasInsightMatch = 
          result.prompt_strengths?.some(strength => strength.toLowerCase().includes(searchTerm)) ||
          result.prompt_opportunities?.some(opp => opp.toLowerCase().includes(searchTerm)) ||
          result.recommendation_text?.toLowerCase().includes(searchTerm) ||
          result.reporting_text?.toLowerCase().includes(searchTerm);
        if (hasInsightMatch) return true;
      }
      
      return false;
    });
  }, []);

  // Load initial results
  const loadInitialResults = useCallback(async () => {
    if (!websiteId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await analysisService.getAnalysisResultsPaginated(websiteId, {
        limit: initialLimit,
        filters,
      });

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
      setInitialized(true);
    } catch (err) {
      setError(err as Error);
      setLoadedResults([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
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
    sortResults
  ]);

  // Load more results
  const loadMore = useCallback(async () => {
    if (!websiteId || !hasMore || isLoadingMore || !cursor) return;

    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await analysisService.getAnalysisResultsPaginated(websiteId, {
        cursor,
        limit: loadMoreLimit,
        filters,
      });

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

      setLoadedResults(prev => {
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
    sortResults
  ]);

  // Refresh (reset and reload)
  const refresh = useCallback(async () => {
    setLoadedResults([]);
    setHasMore(true);
    setCursor(null);
    setInitialized(false);
    await loadInitialResults();
  }, [loadInitialResults]);

  // Reset when dependencies change
  useEffect(() => {
    refresh();
  }, [
    websiteId,
    filters.topic,
    filters.llmProvider,
    filters.dateRange?.start,
    filters.dateRange?.end,
    filters.mentionStatus,
    filters.confidenceRange?.[0],
    filters.confidenceRange?.[1],
    filters.sentiment,
    filters.analysisSession,
    advancedSearchQuery,
    searchInResponses,
    searchInInsights,
    sortBy,
    sortOrder
  ]);

  // Memoized return value
  const returnValue = useMemo(() => ({
    loadedResults,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    refresh,
    totalLoaded: loadedResults.length,
  }), [
    loadedResults,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    refresh,
  ]);

  return returnValue;
}