import { Skeleton } from "@/components/ui/skeleton"

interface StatsSkeletonProps {
  showIcon?: boolean
  className?: string
}

export function StatsSkeleton({ 
  showIcon = true,
  className 
}: StatsSkeletonProps) {
  return (
    <div className={`flex items-center justify-between text-sm ${className || ''}`}>
      <Skeleton variant="text" width="200px" height="1rem" />
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1">
          {showIcon && <Skeleton variant="circular" size="xs" />}
          <Skeleton variant="text" width="60px" height="1rem" />
        </div>
        <div className="flex items-center space-x-1">
          {showIcon && <Skeleton variant="circular" size="xs" />}
          <Skeleton variant="text" width="80px" height="1rem" />
        </div>
      </div>
    </div>
  )
}