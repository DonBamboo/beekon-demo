import { HeaderSkeleton } from "../common/HeaderSkeleton"
import { MetricCardGridSkeleton } from "../common/MetricCardSkeleton"
import { ChartSkeleton } from "../components/ChartSkeleton"

interface DashboardSkeletonProps {
  className?: string
}

export function DashboardSkeleton({ className }: DashboardSkeletonProps) {
  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* Dashboard Header */}
      <HeaderSkeleton />
      
      {/* Metrics Cards */}
      <MetricCardGridSkeleton count={4} />
      
      {/* Main Chart */}
      <ChartSkeleton type="line" height="400px" />
      
      {/* Secondary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton type="bar" height="300px" />
        <ChartSkeleton type="pie" height="300px" showLegend />
      </div>
    </div>
  )
}

export function DashboardErrorSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-6 ${className || ''}`}>
      <HeaderSkeleton showActions={false} />
      <MetricCardGridSkeleton count={4} />
      <div className="text-center py-12">
        <div className="space-y-3">
          <div className="mx-auto w-16 h-16 bg-muted/50 rounded-full animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-48 bg-muted/50 rounded mx-auto animate-pulse" />
            <div className="h-3 w-32 bg-muted/50 rounded mx-auto animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-muted/50 rounded mx-auto animate-pulse" />
        </div>
      </div>
    </div>
  )
}