import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface ChartSkeletonProps {
  type?: 'bar' | 'line' | 'pie' | 'area' | 'donut'
  showHeader?: boolean
  showLegend?: boolean
  height?: string
  className?: string
}

export function ChartSkeleton({ 
  type = 'bar',
  showHeader = true,
  showLegend = false,
  height = "300px",
  className 
}: ChartSkeletonProps) {
  const renderChart = () => {
    switch (type) {
      case 'pie':
      case 'donut':
        return (
          <div className="flex items-center justify-center" style={{ height }}>
            <Skeleton variant="circular" width="200px" height="200px" />
          </div>
        )
      
      case 'line':
      case 'area':
        return (
          <div className="relative" style={{ height }}>
            <div className="absolute inset-0 flex items-end justify-between px-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center space-y-2">
                  <Skeleton 
                    variant="default" 
                    width="4px" 
                    height={`${Math.random() * 60 + 20}%`}
                  />
                  <Skeleton variant="text" width="20px" height="0.75rem" />
                </div>
              ))}
            </div>
          </div>
        )
      
      default: // bar
        return (
          <div className="flex items-end justify-between space-x-2 px-4" style={{ height }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center space-y-2 flex-1">
                <Skeleton 
                  variant="default" 
                  className="w-full" 
                  height={`${Math.random() * 70 + 30}%`}
                />
                <Skeleton variant="text" width="30px" height="0.75rem" />
              </div>
            ))}
          </div>
        )
    }
  }

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton variant="text" width="200px" height="1.25rem" />
              <Skeleton variant="text" width="120px" height="0.875rem" />
            </div>
            <Skeleton variant="button" size="sm" />
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-4">
          {renderChart()}
          
          {showLegend && (
            <div className="flex items-center justify-center space-x-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <Skeleton variant="circular" size="xs" />
                  <Skeleton variant="text" width="60px" height="0.875rem" />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}