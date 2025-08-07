import React, { Suspense } from "react";
import { Skeleton } from "./ui/skeleton";

// Lazy load heavy chart components
const DashboardCharts = React.lazy(() => import("./DashboardCharts"));
const AnalysisVisualization = React.lazy(() => import("./AnalysisVisualization"));
const ShareOfVoiceChart = React.lazy(() => import("./competitors/ShareOfVoiceChart"));
const CompetitiveGapChart = React.lazy(() => import("./competitors/CompetitiveGapChart"));
const TimeSeriesChart = React.lazy(() => import("./competitors/TimeSeriesChart"));

// Lazy load heavy modal components
const AnalysisConfigModal = React.lazy(() => import("./AnalysisConfigModal"));
const DetailedAnalysisModal = React.lazy(() => import("./DetailedAnalysisModal"));
const WorkspaceModal = React.lazy(() => import("./WorkspaceModal"));
const ApiKeyModal = React.lazy(() => import("./ApiKeyModal"));
const WebsiteSettingsModal = React.lazy(() => import("./WebsiteSettingsModal"));
const ProfileModal = React.lazy(() => import("./ProfileModal"));

// Skeleton components for loading states
const ChartSkeleton = (): React.JSX.Element => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64 w-full" />
    <div className="flex space-x-2">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-16" />
    </div>
  </div>
);

const ModalSkeleton = (): React.JSX.Element => (
  <div className="space-y-4 p-6">
    <Skeleton className="h-8 w-64" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
    <div className="flex space-x-2">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  </div>
);

// Lazy wrapped components with loading states
export const LazyDashboardCharts = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ChartSkeleton />}>
    <DashboardCharts {...props} />
  </Suspense>
));

export const LazyAnalysisVisualization = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ChartSkeleton />}>
    <AnalysisVisualization {...props} />
  </Suspense>
));

export const LazyShareOfVoiceChart = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ChartSkeleton />}>
    <ShareOfVoiceChart {...props} />
  </Suspense>
));

export const LazyCompetitiveGapChart = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ChartSkeleton />}>
    <CompetitiveGapChart {...props} />
  </Suspense>
));

export const LazyTimeSeriesChart = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ChartSkeleton />}>
    <TimeSeriesChart {...props} />
  </Suspense>
));

export const LazyAnalysisConfigModal = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ModalSkeleton />}>
    <AnalysisConfigModal {...props} />
  </Suspense>
));

export const LazyDetailedAnalysisModal = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ModalSkeleton />}>
    <DetailedAnalysisModal {...props} />
  </Suspense>
));

export const LazyWorkspaceModal = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ModalSkeleton />}>
    <WorkspaceModal {...props} />
  </Suspense>
));

export const LazyApiKeyModal = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ModalSkeleton />}>
    <ApiKeyModal {...props} />
  </Suspense>
));

export const LazyWebsiteSettingsModal = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ModalSkeleton />}>
    <WebsiteSettingsModal {...props} />
  </Suspense>
));

export const LazyProfileModal = React.memo((props: Record<string, unknown>) => (
  <Suspense fallback={<ModalSkeleton />}>
    <ProfileModal {...props} />
  </Suspense>
));

