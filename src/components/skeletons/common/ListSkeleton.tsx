import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

interface ListSkeletonProps {
  count?: number
  showCard?: boolean
  showAvatar?: boolean
  showActions?: boolean
  className?: string
}

export function ListSkeleton({ 
  count = 5, 
  showCard = true,
  showAvatar = false,
  showActions = true,
  className 
}: ListSkeletonProps) {
  const listItem = (index: number) => (
    <div key={index} className="flex items-center justify-between p-4 border-b last:border-b-0">
      <div className="flex items-center space-x-4 flex-1">
        {showAvatar && (
          <Skeleton variant="avatar" size="md" />
        )}
        
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" width="60%" height="1.25rem" />
          <Skeleton variant="text" width="40%" height="1rem" />
        </div>
      </div>
      
      {showActions && (
        <div className="flex items-center space-x-2">
          <Skeleton variant="button" size="sm" />
          <Skeleton variant="button" size="sm" />
        </div>
      )}
    </div>
  )

  const content = (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => listItem(i))}
    </div>
  )

  if (showCard) {
    return (
      <Card>
        <CardContent className="p-0">
          {content}
        </CardContent>
      </Card>
    )
  }

  return content
}