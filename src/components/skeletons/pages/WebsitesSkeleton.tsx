import { HeaderSkeleton } from "../common/HeaderSkeleton"
import { DataTableSkeleton } from "../components/DataTableSkeleton"

interface WebsitesSkeletonProps {
  className?: string
}

export function WebsitesSkeleton({ className }: WebsitesSkeletonProps) {
  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* Websites Header */}
      <HeaderSkeleton />
      
      {/* Websites Table */}
      <DataTableSkeleton 
        rows={6}
        columns={5}
        showHeader={false}
        showActions
        showPagination
      />
    </div>
  )
}

export function WebsiteCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`border rounded-lg p-4 space-y-3 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
          <div className="h-3 w-24 bg-muted/50 rounded animate-pulse" />
        </div>
        <div className="flex items-center space-x-2">
          <div className="h-6 w-12 bg-muted/50 rounded animate-pulse" />
          <div className="h-8 w-8 bg-muted/50 rounded animate-pulse" />
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4 pt-3 border-t">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="text-center space-y-1">
            <div className="h-3 w-16 bg-muted/50 rounded mx-auto animate-pulse" />
            <div className="h-4 w-8 bg-muted/50 rounded mx-auto animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function WebsiteGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className || ''}`}>
      {Array.from({ length: count }).map((_, i) => (
        <WebsiteCardSkeleton key={i} />
      ))}
    </div>
  )
}