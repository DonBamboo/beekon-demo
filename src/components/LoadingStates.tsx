import React from 'react';
import { Skeleton } from './ui/skeleton';
import { Card, CardContent, CardHeader } from './ui/card';
import { Loader2 } from 'lucide-react';

// Generic loading skeleton for cards
export const CardSkeleton = ({ count = 1 }: { count?: number }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i}>
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    ))}
  </>
);

// Table loading skeleton
export const TableSkeleton = ({ 
  rows = 5, 
  columns = 4 
}: { 
  rows?: number; 
  columns?: number; 
}) => (
  <div className="space-y-2">
    {/* Header */}
    <div className="flex space-x-2">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-10 flex-1" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex space-x-2">
        {Array.from({ length: columns }).map((_, j) => (
          <Skeleton key={j} className="h-8 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

// Chart loading skeleton
export const ChartSkeleton = ({ 
  height = 300,
  showLegend = true,
  title = true 
}: { 
  height?: number; 
  showLegend?: boolean; 
  title?: boolean; 
}) => (
  <Card>
    <CardHeader>
      {title && <Skeleton className="h-6 w-48" />}
    </CardHeader>
    <CardContent className="space-y-4">
      <Skeleton className={`w-full`} style={{ height: `${height}px` }} />
      {showLegend && (
        <div className="flex justify-center space-x-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

// Dashboard metrics skeleton
export const DashboardMetricsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <Card key={i}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-20" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-24" />
        </CardContent>
      </Card>
    ))}
  </div>
);

// List loading skeleton
export const ListSkeleton = ({ 
  items = 5,
  showAvatar = false,
  showActions = false 
}: { 
  items?: number; 
  showAvatar?: boolean; 
  showActions?: boolean; 
}) => (
  <div className="space-y-3">
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
        {showAvatar && <Skeleton className="h-10 w-10 rounded-full" />}
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        {showActions && (
          <div className="flex space-x-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        )}
      </div>
    ))}
  </div>
);

// Form loading skeleton
export const FormSkeleton = ({ fields = 4 }: { fields?: number }) => (
  <div className="space-y-4">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
    ))}
    <div className="flex space-x-2">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  </div>
);

// Modal loading skeleton
export const ModalSkeleton = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-6 w-6" />
    </div>
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <FormSkeleton fields={3} />
    </div>
  </div>
);

// Spinner component
export const Spinner = ({ 
  size = 'default',
  className = '' 
}: { 
  size?: 'sm' | 'default' | 'lg'; 
  className?: string; 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
  );
};

// Loading overlay
export const LoadingOverlay = ({ 
  isLoading, 
  children, 
  message = 'Loading...' 
}: { 
  isLoading: boolean; 
  children: React.ReactNode; 
  message?: string; 
}) => (
  <div className="relative">
    {children}
    {isLoading && (
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center space-y-2">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    )}
  </div>
);

// Inline loading component
export const InlineLoading = ({ 
  message = 'Loading...',
  size = 'default' 
}: { 
  message?: string; 
  size?: 'sm' | 'default' | 'lg'; 
}) => (
  <div className="flex items-center justify-center space-x-2 p-4">
    <Spinner size={size} />
    <span className="text-sm text-muted-foreground">{message}</span>
  </div>
);

// Page loading component
export const PageLoading = ({ message = 'Loading page...' }: { message?: string }) => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center space-y-4">
      <Spinner size="lg" />
      <p className="text-lg text-muted-foreground">{message}</p>
    </div>
  </div>
);

// Competitive analysis loading states
export const CompetitorAnalysisLoadingSkeleton = () => (
  <div className="space-y-6">
    {/* Header */}
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
    </div>
    
    {/* Metrics cards */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <CardSkeleton count={3} />
    </div>
    
    {/* Charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartSkeleton height={250} />
      <ChartSkeleton height={250} />
    </div>
    
    {/* Competitors table */}
    <div className="space-y-4">
      <Skeleton className="h-6 w-32" />
      <TableSkeleton rows={5} columns={6} />
    </div>
  </div>
);

// Dashboard loading skeleton
export const DashboardLoadingSkeleton = () => (
  <div className="space-y-6">
    {/* Header */}
    <div className="flex items-center justify-between">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-32" />
    </div>
    
    {/* Metrics */}
    <DashboardMetricsSkeleton />
    
    {/* Charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartSkeleton height={300} />
      <ChartSkeleton height={300} />
    </div>
    
    {/* Additional charts */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <ChartSkeleton height={200} showLegend={false} />
      <ChartSkeleton height={200} showLegend={false} />
      <ChartSkeleton height={200} showLegend={false} />
    </div>
  </div>
);

// Search loading skeleton
export const SearchLoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="flex items-center space-x-2">
      <Skeleton className="h-10 flex-1" />
      <Skeleton className="h-10 w-20" />
    </div>
    <div className="flex space-x-2">
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-18" />
    </div>
    <ListSkeleton items={6} showAvatar={true} showActions={true} />
  </div>
);

// Progressive loading component
export const ProgressiveLoading = ({ 
  stages, 
  currentStage = 0 
}: { 
  stages: string[]; 
  currentStage?: number; 
}) => (
  <div className="flex flex-col items-center space-y-4">
    <Spinner size="lg" />
    <div className="text-center space-y-2">
      <p className="text-lg font-medium">
        {stages[currentStage] || 'Loading...'}
      </p>
      <div className="flex space-x-1">
        {stages.map((_, i) => (
          <div
            key={i}
            className={`h-2 w-2 rounded-full transition-colors ${
              i <= currentStage ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  </div>
);

