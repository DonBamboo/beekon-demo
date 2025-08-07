import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface ContentSkeletonProps {
  showHeader?: boolean
  showCard?: boolean
  lines?: number
  className?: string
}

export function ContentSkeleton({ 
  showHeader = true, 
  showCard = true, 
  lines = 3,
  className 
}: ContentSkeletonProps) {
  const content = (
    <div className={className}>
      {showHeader && (
        <div className="space-y-3 mb-6">
          <Skeleton variant="text" width="60%" height="2rem" />
          <Skeleton variant="text" width="40%" height="1rem" />
        </div>
      )}
      
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton 
            key={i} 
            variant="text" 
            width={i === lines - 1 ? "75%" : "100%"} 
            height="1rem"
          />
        ))}
      </div>
    </div>
  )

  if (showCard) {
    return (
      <Card>
        <CardHeader>
          <Skeleton variant="text" width="50%" height="1.5rem" />
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    )
  }

  return content
}