import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface DataTableSkeletonProps {
  rows?: number
  columns?: number
  showHeader?: boolean
  showActions?: boolean
  showPagination?: boolean
  className?: string
}

export function DataTableSkeleton({ 
  rows = 5,
  columns = 4,
  showHeader = true,
  showActions = true,
  showPagination = true,
  className 
}: DataTableSkeletonProps) {
  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton variant="text" width="200px" height="1.5rem" />
            {showActions && (
              <div className="flex items-center space-x-2">
                <Skeleton variant="button" size="sm" />
                <Skeleton variant="button" size="sm" />
              </div>
            )}
          </div>
        </CardHeader>
      )}
      
      <CardContent className="p-0">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            {/* Table Header */}
            <thead className="border-b">
              <tr className="border-b">
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="h-12 px-4 text-left align-middle">
                    <Skeleton variant="text" width="100px" height="1rem" />
                  </th>
                ))}
                {showActions && (
                  <th className="h-12 px-4 text-left align-middle">
                    <Skeleton variant="text" width="60px" height="1rem" />
                  </th>
                )}
              </tr>
            </thead>
            
            {/* Table Body */}
            <tbody>
              {Array.from({ length: rows }).map((_, rowIndex) => (
                <tr key={rowIndex} className="border-b">
                  {Array.from({ length: columns }).map((_, colIndex) => (
                    <td key={colIndex} className="p-4 align-middle">
                      <Skeleton 
                        variant="text" 
                        width={colIndex === 0 ? "120px" : "80px"} 
                        height="1rem" 
                      />
                    </td>
                  ))}
                  {showActions && (
                    <td className="p-4 align-middle">
                      <div className="flex items-center space-x-2">
                        <Skeleton variant="button" size="xs" />
                        <Skeleton variant="button" size="xs" />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {showPagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <Skeleton variant="text" width="150px" height="0.875rem" />
            <div className="flex items-center space-x-2">
              <Skeleton variant="button" size="sm" />
              <Skeleton variant="text" width="60px" height="0.875rem" />
              <Skeleton variant="button" size="sm" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}