import { Skeleton } from "@/components/ui/skeleton"

interface ApplicationLoadingSkeletonProps {
  className?: string
}

export function ApplicationLoadingSkeleton({ className }: ApplicationLoadingSkeletonProps) {
  return (
    <div className={`min-h-screen flex w-full ${className || ''}`}>
      {/* Sidebar Skeleton */}
      <div className="w-64 border-r bg-background p-4 space-y-6">
        {/* Logo/Brand */}
        <div className="flex items-center space-x-3">
          <Skeleton variant="circular" size="md" />
          <Skeleton variant="text" width="120px" height="1.5rem" />
        </div>
        
        {/* Navigation Menu */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton variant="circular" size="sm" />
              <Skeleton variant="text" width="100px" height="1rem" />
            </div>
          ))}
        </div>
        
        {/* Bottom Section */}
        <div className="absolute bottom-4 space-y-3">
          <div className="flex items-center space-x-3">
            <Skeleton variant="avatar" size="sm" />
            <div className="space-y-1">
              <Skeleton variant="text" width="80px" height="0.875rem" />
              <Skeleton variant="text" width="60px" height="0.75rem" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header Skeleton */}
        <div className="border-b bg-background p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Skeleton variant="circular" size="sm" />
              <Skeleton variant="text" width="200px" height="1.5rem" />
            </div>
            
            <div className="flex items-center space-x-3">
              <Skeleton variant="circular" size="sm" />
              <Skeleton variant="circular" size="sm" />
              <Skeleton variant="avatar" size="sm" />
            </div>
          </div>
        </div>
        
        {/* Main Content Skeleton */}
        <main className="flex-1 p-6 space-y-6">
          {/* Page Header */}
          <div className="space-y-2">
            <Skeleton variant="text" width="300px" height="2.25rem" />
            <Skeleton variant="text" width="400px" height="1.25rem" />
          </div>
          
          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton variant="text" width="80px" height="0.875rem" />
                  <Skeleton variant="circular" size="xs" />
                </div>
                <Skeleton variant="text" width="60px" height="2rem" />
                <Skeleton variant="text" width="100px" height="0.75rem" />
              </div>
            ))}
          </div>
          
          {/* Main Chart/Content Area */}
          <div className="border rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton variant="text" width="200px" height="1.5rem" />
                <Skeleton variant="button" size="sm" />
              </div>
              <Skeleton variant="default" width="100%" height="300px" />
            </div>
          </div>
          
          {/* Secondary Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-4">
                <Skeleton variant="text" width="150px" height="1.25rem" />
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <Skeleton variant="text" width="120px" height="1rem" />
                      <Skeleton variant="text" width="60px" height="1rem" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

export function AuthenticationSkeleton({ className }: { className?: string }) {
  return (
    <div className={`min-h-screen flex items-center justify-center bg-background ${className || ''}`}>
      <div className="w-full max-w-md space-y-6 p-6">
        {/* Logo/Brand */}
        <div className="text-center space-y-4">
          <Skeleton variant="circular" size="xl" className="mx-auto" />
          <Skeleton variant="text" width="200px" height="2rem" className="mx-auto" />
          <Skeleton variant="text" width="300px" height="1rem" className="mx-auto" />
        </div>
        
        {/* Auth Form */}
        <div className="border rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton variant="text" width="60px" height="1rem" />
            <Skeleton variant="input" height="2.5rem" />
          </div>
          
          <div className="space-y-2">
            <Skeleton variant="text" width="80px" height="1rem" />
            <Skeleton variant="input" height="2.5rem" />
          </div>
          
          <Skeleton variant="button" height="2.5rem" />
          
          <div className="text-center">
            <Skeleton variant="text" width="180px" height="0.875rem" className="mx-auto" />
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center space-y-2">
          <Skeleton variant="text" width="250px" height="0.75rem" className="mx-auto" />
          <Skeleton variant="text" width="200px" height="0.75rem" className="mx-auto" />
        </div>
      </div>
    </div>
  )
}

export function PageLoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-6 p-6 ${className || ''}`}>
      {/* Page Header */}
      <div className="space-y-3">
        <Skeleton variant="text" width="250px" height="2.25rem" />
        <Skeleton variant="text" width="400px" height="1.25rem" />
      </div>
      
      {/* Main Content Area */}
      <div className="space-y-4">
        <div className="border rounded-lg p-6">
          <Skeleton variant="default" width="100%" height="200px" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <Skeleton variant="text" width="120px" height="1rem" />
              <Skeleton variant="text" width="80px" height="1.5rem" />
              <Skeleton variant="text" width="150px" height="0.875rem" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}