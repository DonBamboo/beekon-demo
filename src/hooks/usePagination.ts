import { useState, useMemo, useCallback } from "react";

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

export interface PaginationActions {
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  setTotalItems: (total: number) => void;
}

export interface UsePaginationProps {
  initialPage?: number;
  initialPageSize?: number;
  totalItems?: number;
}

export function usePagination({
  initialPage = 1,
  initialPageSize = 20,
  totalItems = 0,
}: UsePaginationProps = {}): [PaginationState, PaginationActions] {
  const [currentPage, setCurrentPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [totalItemsState, setTotalItemsState] = useState(totalItems);

  const paginationState = useMemo((): PaginationState => {
    const totalPages = Math.ceil(totalItemsState / pageSize);
    const hasNextPage = currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItemsState);

    return {
      currentPage,
      pageSize,
      totalItems: totalItemsState,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      startIndex,
      endIndex,
    };
  }, [currentPage, pageSize, totalItemsState]);

  const setCurrentPage = useCallback((page: number) => {
    const totalPages = Math.ceil(totalItemsState / pageSize);
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPageState(clampedPage);
  }, [totalItemsState, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    // Reset to first page when page size changes
    setCurrentPageState(1);
  }, []);

  const nextPage = useCallback(() => {
    setCurrentPage(currentPage + 1);
  }, [currentPage, setCurrentPage]);

  const previousPage = useCallback(() => {
    setCurrentPage(currentPage - 1);
  }, [currentPage, setCurrentPage]);

  const goToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, [setCurrentPage]);

  const goToLastPage = useCallback(() => {
    const totalPages = Math.ceil(totalItemsState / pageSize);
    setCurrentPage(totalPages);
  }, [totalItemsState, pageSize, setCurrentPage]);

  const setTotalItems = useCallback((total: number) => {
    setTotalItemsState(total);
    // Adjust current page if it's now out of bounds
    const totalPages = Math.ceil(total / pageSize);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPageState(totalPages);
    }
  }, [currentPage, pageSize]);

  const actions: PaginationActions = {
    setCurrentPage,
    setPageSize,
    nextPage,
    previousPage,
    goToFirstPage,
    goToLastPage,
    setTotalItems,
  };

  return [paginationState, actions];
}

// Hook for client-side pagination of data arrays
export function useClientPagination<T>(
  data: T[],
  pageSize: number = 20
): [T[], PaginationState, PaginationActions] {
  const [paginationState, paginationActions] = usePagination({
    initialPageSize: pageSize,
    totalItems: data.length,
  });

  // Update total items when data changes
  useMemo(() => {
    paginationActions.setTotalItems(data.length);
  }, [data.length, paginationActions]);

  // Get current page data
  const currentPageData = useMemo(() => {
    const { startIndex, endIndex } = paginationState;
    return data.slice(startIndex, endIndex);
  }, [data, paginationState]);

  return [currentPageData, paginationState, paginationActions];
}

// Hook for server-side pagination
export function useServerPagination<T>(
  fetchData: (page: number, pageSize: number) => Promise<{ data: T[]; total: number }>,
  pageSize: number = 20
): [T[], PaginationState, PaginationActions, { isLoading: boolean; error: Error | null; refetch: () => void }] {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [paginationState, paginationActions] = usePagination({
    initialPageSize: pageSize,
  });

  const fetchCurrentPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchData(paginationState.currentPage, paginationState.pageSize);
      setData(result.data);
      paginationActions.setTotalItems(result.total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchData, paginationState.currentPage, paginationState.pageSize, paginationActions]);

  // Fetch data when page or page size changes
  useMemo(() => {
    fetchCurrentPage();
  }, [fetchCurrentPage]);

  const refetch = useCallback(() => {
    fetchCurrentPage();
  }, [fetchCurrentPage]);

  return [data, paginationState, paginationActions, { isLoading, error, refetch }];
}

// Utility for calculating pagination ranges for UI
export function getPaginationRange(
  currentPage: number,
  totalPages: number,
  delta: number = 2
): (number | string)[] {
  const range: (number | string)[] = [];
  
  if (totalPages <= 7) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      range.push(i);
    }
  } else {
    // Show first page
    range.push(1);
    
    // Add ellipsis if needed
    if (currentPage - delta > 2) {
      range.push('...');
    }
    
    // Add pages around current page
    const start = Math.max(2, currentPage - delta);
    const end = Math.min(totalPages - 1, currentPage + delta);
    
    for (let i = start; i <= end; i++) {
      range.push(i);
    }
    
    // Add ellipsis if needed
    if (currentPage + delta < totalPages - 1) {
      range.push('...');
    }
    
    // Show last page
    if (totalPages > 1) {
      range.push(totalPages);
    }
  }
  
  return range;
}