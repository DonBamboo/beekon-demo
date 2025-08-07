import React, { useEffect } from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { Spinner } from './LoadingStates';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';

interface InfiniteScrollContainerProps {
  children: React.ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  loadingComponent?: React.ReactNode;
  endMessage?: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
  className?: string;
}

export function InfiniteScrollContainer({
  children,
  hasMore,
  isLoadingMore,
  onLoadMore,
  loadingComponent,
  endMessage,
  threshold = 0.1,
  rootMargin = '200px',
  enabled = true,
  className = '',
}: InfiniteScrollContainerProps) {
  const { ref, isIntersecting } = useIntersectionObserver({
    threshold,
    rootMargin,
    enabled: enabled && hasMore && !isLoadingMore,
  });

  // Trigger load more when intersection is detected
  useEffect(() => {
    if (isIntersecting && hasMore && !isLoadingMore && enabled) {
      onLoadMore();
    }
  }, [isIntersecting, hasMore, isLoadingMore, onLoadMore, enabled]);

  const defaultLoadingComponent = (
    <div className="flex items-center justify-center py-8">
      <Spinner size="default" />
      <span className="ml-3 text-muted-foreground">Loading more results...</span>
    </div>
  );

  const defaultEndMessage = (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <div className="text-center">
        <div className="text-sm">You've reached the end of the results</div>
        <div className="text-xs mt-1">No more data to load</div>
      </div>
    </div>
  );

  return (
    <div className={className}>
      {children}
      
      {/* Intersection trigger element */}
      {hasMore && (
        <div ref={ref} className="h-4 w-full" aria-hidden="true" />
      )}
      
      {/* Loading state */}
      {isLoadingMore && (loadingComponent || defaultLoadingComponent)}
      
      {/* End of results message */}
      {!hasMore && !isLoadingMore && (endMessage || defaultEndMessage)}
      
      {/* Fallback load more button for accessibility/fallback */}
      {hasMore && !isLoadingMore && !enabled && (
        <div className="flex justify-center py-6">
          <Button 
            onClick={onLoadMore}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Load More Results
          </Button>
        </div>
      )}
    </div>
  );
}