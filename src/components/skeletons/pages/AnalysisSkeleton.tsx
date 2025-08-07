import { HeaderSkeleton } from "../common/HeaderSkeleton"
import { ListSkeleton } from "../common/ListSkeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface AnalysisSkeletonProps {
  className?: string
}

export function AnalysisSkeleton({ className }: AnalysisSkeletonProps) {
  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* Analysis Header */}
      <HeaderSkeleton />
      
      {/* Analysis Filters */}
      <AnalysisFiltersSkeleton />
      
      {/* Analysis Results List */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <AnalysisResultCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function AnalysisFiltersSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Website Selection */}
      <div className="flex items-center space-x-2">
        <Skeleton variant="circular" size="xs" />
        <Skeleton variant="input" width="250px" height="2.5rem" />
      </div>

      {/* Search and Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {/* Search Input */}
          <div className="flex items-center space-x-2">
            <Skeleton variant="circular" size="xs" />
            <Skeleton variant="input" width="300px" height="2.5rem" />
          </div>

          {/* Topic Filter */}
          <div className="flex items-center space-x-2">
            <Skeleton variant="circular" size="xs" />
            <Skeleton variant="input" width="200px" height="2.5rem" />
          </div>

          {/* LLM Filter Buttons */}
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="button" size="sm" />
            ))}
          </div>
        </div>

        <Skeleton variant="button" size="md" />
      </div>
    </div>
  )
}

export function AnalysisResultCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="100%" height="1.25rem" />
            <div className="flex items-center space-x-2">
              <Skeleton variant="text" width="80px" height="1rem" />
              <Skeleton variant="text" width="60px" height="1rem" />
              <Skeleton variant="text" width="100px" height="1rem" />
            </div>
          </div>
          <Skeleton variant="button" size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="text-center space-y-2">
              <Skeleton variant="text" width="60px" height="1rem" />
              <Skeleton variant="circular" width="20px" height="20px" />
              <Skeleton variant="text" width="30px" height="1rem" />
              <Skeleton variant="text" width="80px" height="1.25rem" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function AnalysisDetailsSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Skeleton variant="circular" size="sm" />
            <Skeleton variant="text" width="300px" height="1.5rem" />
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton variant="button" size="sm" />
            <Skeleton variant="button" size="sm" />
          </div>
        </div>
        
        <Skeleton variant="text" width="100%" height="1.25rem" />
        
        <div className="flex items-center space-x-3">
          <Skeleton variant="text" width="80px" height="1.25rem" />
          <Skeleton variant="text" width="100px" height="1.25rem" />
          <Skeleton variant="text" width="120px" height="1rem" />
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="button" size="md" />
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Skeleton variant="circular" size="xs" />
                    <Skeleton variant="text" width="100px" height="1.25rem" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Skeleton variant="text" width="60px" height="1.25rem" />
                    <Skeleton variant="text" width="40px" height="1.25rem" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton variant="text" width="100px" height="1rem" />
                    <div className="flex space-x-1">
                      <Skeleton variant="button" size="xs" />
                      <Skeleton variant="button" size="xs" />
                    </div>
                  </div>
                  <Skeleton variant="text" width="100%" height="1rem" lines={2} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="flex space-x-2">
          <Skeleton variant="button" size="sm" />
          <Skeleton variant="button" size="sm" />
          <Skeleton variant="button" size="sm" />
        </div>
        <Skeleton variant="button" size="sm" />
      </div>
    </div>
  )
}