import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface MetricCardSkeletonProps {
  showIcon?: boolean
  showTrend?: boolean
  className?: string
}

export function MetricCardSkeleton({ 
  showIcon = true, 
  showTrend = true,
  className 
}: MetricCardSkeletonProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton variant="text" width="120px" height="0.875rem" />
        {showIcon && (
          <Skeleton variant="circular" size="sm" />
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton variant="text" width="80px" height="2rem" />
          {showTrend && (
            <div className="flex items-center space-x-2">
              <Skeleton variant="text" width="60px" height="0.875rem" />
              <Skeleton variant="text" width="100px" height="0.75rem" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface MetricCardGridSkeletonProps {
  count?: number
  cols?: number
  showIcon?: boolean
  showTrend?: boolean
  className?: string
}

export function MetricCardGridSkeleton({ 
  count = 4,
  cols = 4,
  showIcon = true,
  showTrend = true,
  className 
}: MetricCardGridSkeletonProps) {
  return (
    <div className={`grid gap-4 ${cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4'} ${className || ''}`}>
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton 
          key={i}
          showIcon={showIcon}
          showTrend={showTrend}
        />
      ))}
    </div>
  )
}