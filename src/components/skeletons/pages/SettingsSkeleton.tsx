import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

interface SettingsSkeletonProps {
  className?: string
}

export function SettingsSkeleton({ className }: SettingsSkeletonProps) {
  return (
    <div className={`space-y-6 ${className || ''}`}>
      {/* Settings Header */}
      <div className="space-y-2">
        <Skeleton variant="text" width="200px" height="2.25rem" />
        <Skeleton variant="text" width="350px" height="1.25rem" />
      </div>

      {/* Profile Settings Card */}
      <ProfileCardSkeleton />
      
      {/* Notification Settings Card */}
      <NotificationCardSkeleton />
      
      {/* Security Settings Card */}
      <SecurityCardSkeleton />
      
      {/* API Settings Card */}
      <ApiCardSkeleton />
      
      {/* Export History Card */}
      <ExportHistoryCardSkeleton />
    </div>
  )
}

export function ProfileCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" size="sm" />
          <Skeleton variant="text" width="80px" height="1.5rem" />
        </div>
        <Skeleton variant="text" width="200px" height="1rem" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <Skeleton variant="avatar" size="xl" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="120px" height="1rem" />
              <Skeleton variant="text" width="280px" height="0.875rem" />
              <Skeleton variant="button" size="sm" />
            </div>
          </div>
          
          {/* File Drop Zone */}
          <div className="border-2 border-dashed border-muted rounded-lg p-6">
            <div className="flex flex-col items-center space-y-2">
              <Skeleton variant="circular" size="md" />
              <Skeleton variant="text" width="250px" height="1rem" />
              <Skeleton variant="text" width="180px" height="0.875rem" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton variant="text" width="80px" height="1rem" />
            <Skeleton variant="input" height="2.5rem" />
          </div>
          <div className="space-y-2">
            <Skeleton variant="text" width="80px" height="1rem" />
            <Skeleton variant="input" height="2.5rem" />
          </div>
        </div>
        
        <div className="space-y-2">
          <Skeleton variant="text" width="60px" height="1rem" />
          <Skeleton variant="input" height="2.5rem" />
        </div>
        
        <div className="space-y-2">
          <Skeleton variant="text" width="80px" height="1rem" />
          <Skeleton variant="input" height="2.5rem" />
        </div>
        
        <Skeleton variant="button" size="md" />
      </CardContent>
    </Card>
  )
}

export function NotificationCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" size="sm" />
          <Skeleton variant="text" width="120px" height="1.5rem" />
        </div>
        <Skeleton variant="text" width="250px" height="1rem" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton variant="text" width="150px" height="1rem" />
                <Skeleton variant="text" width="280px" height="0.875rem" />
              </div>
              <Skeleton variant="rounded" width="44px" height="24px" />
            </div>
            {i < 3 && <Separator className="mt-6" />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function SecurityCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" size="sm" />
          <Skeleton variant="text" width="80px" height="1.5rem" />
        </div>
        <Skeleton variant="text" width="220px" height="1rem" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton variant="text" width={i === 0 ? "120px" : i === 1 ? "100px" : "160px"} height="1rem" />
            <Skeleton variant="input" height="2.5rem" />
          </div>
        ))}
        <Skeleton variant="button" size="md" />
      </CardContent>
    </Card>
  )
}

export function ApiCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" size="sm" />
          <Skeleton variant="text" width="100px" height="1.5rem" />
        </div>
        <Skeleton variant="text" width="250px" height="1rem" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Skeleton variant="text" width="60px" height="1rem" />
          <div className="flex gap-3">
            <Skeleton variant="input" height="2.5rem" className="flex-1" />
            <Skeleton variant="button" size="md" />
          </div>
        </div>
        <Skeleton variant="text" width="100%" height="1rem" lines={2} />
      </CardContent>
    </Card>
  )
}

export function ExportHistoryCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Skeleton variant="circular" size="sm" />
          <Skeleton variant="text" width="140px" height="1.5rem" />
        </div>
        <Skeleton variant="text" width="280px" height="1rem" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton variant="text" width="100px" height="0.875rem" />
                  <Skeleton variant="text" width="60px" height="2rem" />
                </div>
                <Skeleton variant="circular" size="lg" />
              </div>
            </div>
          ))}
        </div>
        
        {/* Recent Activity */}
        <div className="space-y-4">
          <Skeleton variant="text" width="120px" height="1rem" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                <div className="flex items-center space-x-2">
                  <Skeleton variant="circular" size="xs" />
                  <Skeleton variant="text" width="150px" height="0.875rem" />
                  <Skeleton variant="rounded" width="80px" height="20px" />
                </div>
                <Skeleton variant="text" width="80px" height="0.75rem" />
              </div>
            ))}
          </div>
        </div>
        
        <Skeleton variant="button" size="md" />
        <Skeleton variant="text" width="100%" height="1rem" lines={2} />
      </CardContent>
    </Card>
  )
}