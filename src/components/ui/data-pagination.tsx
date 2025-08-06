import React from "react";
import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { PaginationState, PaginationActions, getPaginationRange } from "@/hooks/usePagination";

interface DataPaginationProps {
  paginationState: PaginationState;
  paginationActions: PaginationActions;
  showPageSizeSelector?: boolean;
  pageSizeOptions?: number[];
  className?: string;
}

export function DataPagination({
  paginationState,
  paginationActions,
  showPageSizeSelector = true,
  pageSizeOptions = [10, 20, 50, 100],
  className = "",
}: DataPaginationProps) {
  const {
    currentPage,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    pageSize,
    totalItems,
    startIndex,
    endIndex,
  } = paginationState;

  const {
    setCurrentPage,
    setPageSize,
    nextPage,
    previousPage,
    goToFirstPage,
    goToLastPage,
  } = paginationActions;

  const pageRange = getPaginationRange(currentPage, totalPages);

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center space-x-2">
        <p className="text-sm text-muted-foreground">
          Showing {startIndex + 1} to {endIndex} of {totalItems} results
        </p>
        {showPageSizeSelector && (
          <div className="flex items-center space-x-2">
            <p className="text-sm text-muted-foreground">Rows per page:</p>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => setPageSize(parseInt(value))}
            >
              <SelectTrigger className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={goToFirstPage}
          disabled={!hasPreviousPage}
          className="hidden sm:flex"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={previousPage}
          disabled={!hasPreviousPage}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center space-x-1">
          {pageRange.map((page, index) => {
            if (page === '...') {
              return (
                <span key={index} className="px-2 text-sm text-muted-foreground">
                  ...
                </span>
              );
            }
            
            const pageNumber = typeof page === 'number' ? page : 1;
            const isCurrentPage = pageNumber === currentPage;
            
            return (
              <Button
                key={pageNumber}
                variant={isCurrentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(pageNumber)}
                className={`min-w-[40px] ${isCurrentPage ? 'pointer-events-none' : ''}`}
              >
                {pageNumber}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={nextPage}
          disabled={!hasNextPage}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={goToLastPage}
          disabled={!hasNextPage}
          className="hidden sm:flex"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Simple pagination component for basic use cases
export function SimpleDataPagination({
  paginationState,
  paginationActions,
  className = "",
}: {
  paginationState: PaginationState;
  paginationActions: PaginationActions;
  className?: string;
}) {
  const {
    currentPage,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  } = paginationState;

  const {
    nextPage,
    previousPage,
  } = paginationActions;

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={`flex items-center justify-center space-x-2 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={previousPage}
        disabled={!hasPreviousPage}
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      
      <span className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </span>
      
      <Button
        variant="outline"
        size="sm"
        onClick={nextPage}
        disabled={!hasNextPage}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}