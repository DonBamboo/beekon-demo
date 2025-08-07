import { Skeleton } from "@/components/ui/skeleton"

interface ModalSkeletonProps {
  showHeader?: boolean
  showFooter?: boolean
  contentLines?: number
  className?: string
}

export function ModalSkeleton({ 
  showHeader = true,
  showFooter = true,
  contentLines = 5,
  className 
}: ModalSkeletonProps) {
  return (
    <div className={`space-y-6 p-6 ${className || ''}`}>
      {showHeader && (
        <div className="space-y-3">
          <Skeleton variant="text" width="300px" height="1.5rem" />
          <Skeleton variant="text" width="400px" height="1rem" />
        </div>
      )}
      
      <div className="space-y-3">
        {Array.from({ length: contentLines }).map((_, i) => (
          <Skeleton 
            key={i} 
            variant="text" 
            width={i === contentLines - 1 ? "75%" : "100%"} 
            height="1rem"
          />
        ))}
      </div>
      
      {showFooter && (
        <div className="flex items-center justify-end space-x-3 pt-4 border-t">
          <Skeleton variant="button" size="md" />
          <Skeleton variant="button" size="md" />
        </div>
      )}
    </div>
  )
}

interface ModalFormSkeletonProps {
  fields?: number
  showHeader?: boolean
  showFooter?: boolean
  className?: string
}

export function ModalFormSkeleton({ 
  fields = 3,
  showHeader = true,
  showFooter = true,
  className 
}: ModalFormSkeletonProps) {
  return (
    <div className={`space-y-6 p-6 ${className || ''}`}>
      {showHeader && (
        <div className="space-y-2">
          <Skeleton variant="text" width="250px" height="1.5rem" />
          <Skeleton variant="text" width="350px" height="0.875rem" />
        </div>
      )}
      
      <div className="space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton variant="text" width="100px" height="1rem" />
            <Skeleton variant="input" height="2.5rem" />
          </div>
        ))}
      </div>
      
      {showFooter && (
        <div className="flex items-center justify-end space-x-3 pt-4 border-t">
          <Skeleton variant="button" size="md" />
          <Skeleton variant="button" size="md" />
        </div>
      )}
    </div>
  )
}