import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface FormSkeletonProps {
  fields?: number
  showHeader?: boolean
  showCard?: boolean
  showActions?: boolean
  className?: string
}

export function FormSkeleton({ 
  fields = 4,
  showHeader = true,
  showCard = true,
  showActions = true,
  className 
}: FormSkeletonProps) {
  const formContent = (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width="100px" height="1rem" />
          <Skeleton variant="input" height="2.5rem" />
          {i % 3 === 0 && (
            <Skeleton variant="text" width="200px" height="0.75rem" />
          )}
        </div>
      ))}
      
      {showActions && (
        <div className="flex items-center justify-end space-x-3 pt-4">
          <Skeleton variant="button" size="md" />
          <Skeleton variant="button" size="md" />
        </div>
      )}
    </div>
  )

  if (showCard) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <Skeleton variant="text" width="250px" height="1.5rem" />
            <Skeleton variant="text" width="180px" height="0.875rem" />
          </CardHeader>
        )}
        <CardContent>
          {formContent}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={className}>
      {showHeader && (
        <div className="space-y-2 mb-6">
          <Skeleton variant="text" width="250px" height="1.5rem" />
          <Skeleton variant="text" width="180px" height="0.875rem" />
        </div>
      )}
      {formContent}
    </div>
  )
}

interface FormFieldSkeletonProps {
  label?: boolean
  description?: boolean
  required?: boolean
  className?: string
}

export function FormFieldSkeleton({ 
  label = true,
  description = false,
  required = false,
  className 
}: FormFieldSkeletonProps) {
  return (
    <div className={`space-y-2 ${className || ''}`}>
      {label && (
        <div className="flex items-center space-x-1">
          <Skeleton variant="text" width="120px" height="1rem" />
          {required && (
            <Skeleton variant="text" width="8px" height="1rem" />
          )}
        </div>
      )}
      <Skeleton variant="input" height="2.5rem" />
      {description && (
        <Skeleton variant="text" width="200px" height="0.75rem" />
      )}
    </div>
  )
}