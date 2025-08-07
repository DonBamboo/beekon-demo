import { HeaderSkeleton } from "../common/HeaderSkeleton"
import { ChartSkeleton } from "../components/ChartSkeleton" 
import { ListSkeleton } from "../common/ListSkeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface CompetitorsSkeletonProps {
  className?: string
}

export function CompetitorsSkeleton({ className }: CompetitorsSkeletonProps) {
  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* Competitors Header */}
      <HeaderSkeleton />
      
      {/* Share of Voice Chart */}
      <ChartSkeleton type="pie" height="400px" showLegend />
      
      {/* Competitors List */}
      <ListSkeleton count={4} showAvatar showActions />
      
      {/* Competitive Gap Chart */}
      <ChartSkeleton type="bar" height="350px" />
      
      {/* Competitor Insights */}
      <CompetitorInsightsSkeleton />
      
      {/* Time Series Chart */}
      <ChartSkeleton type="line" height="300px" />
    </div>
  )
}

export function CompetitorInsightsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width="200px" height="1.5rem" />
          <Skeleton variant="button" size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <Skeleton variant="text" width="250px" height="1.25rem" />
                <Skeleton variant="circular" size="sm" />
              </div>
              <Skeleton variant="text" width="100%" height="1rem" lines={2} />
              <div className="flex items-center space-x-4 pt-2">
                <Skeleton variant="text" width="80px" height="0.875rem" />
                <Skeleton variant="text" width="100px" height="0.875rem" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function CompetitorCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton variant="avatar" size="md" />
          <div className="space-y-1">
            <Skeleton variant="text" width="120px" height="1rem" />
            <Skeleton variant="text" width="80px" height="0.875rem" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" size="sm" />
          <Skeleton variant="button" size="sm" />
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-3 pt-3 border-t">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="text-center space-y-1">
            <Skeleton variant="text" width="60px" height="0.75rem" />
            <Skeleton variant="text" width="40px" height="1rem" />
          </div>
        ))}
      </div>
    </div>
  )
}