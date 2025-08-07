import { Skeleton } from "@/components/ui/skeleton"

interface HeaderSkeletonProps {
  showActions?: boolean
  showSubheader?: boolean
  className?: string
}

export function HeaderSkeleton({ 
  showActions = true, 
  showSubheader = true,
  className 
}: HeaderSkeletonProps) {
  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width="300px" height="2rem" />
          {showSubheader && (
            <Skeleton variant="text" width="200px" height="1rem" />
          )}
        </div>
        
        {showActions && (
          <div className="flex items-center space-x-3">
            <Skeleton variant="button" size="sm" />
            <Skeleton variant="button" size="md" />
          </div>
        )}
      </div>
    </div>
  )
}