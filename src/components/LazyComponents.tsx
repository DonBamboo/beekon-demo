import React, { Suspense } from "react";
import { Skeleton } from "./ui/skeleton";
import type { UIAnalysisResult, Workspace, Website, SubscriptionTier } from "@/types/database";
import type { WorkspaceSettings } from "@/hooks/useWorkspace";
import type { AnalysisAnalytics } from "@/services/analyticsService";
import type { 
  CompetitiveGapAnalysis, 
  CompetitorAnalytics,
  CompetitorTimeSeriesData 
} from "@/services/competitorService";

// Import types for proper component typing
export interface ShareOfVoiceData {
  name: string;
  value: number;
  fill: string;
  competitorId?: string;
}

// Component prop interfaces
export interface AnalysisVisualizationProps {
  analytics: AnalysisAnalytics;
}

export interface ShareOfVoiceChartProps {
  data: ShareOfVoiceData[];
  dateFilter: "7d" | "30d" | "90d";
  chartType?: "market_share" | "share_of_voice";
}

export interface CompetitiveGapChartProps {
  gapAnalysis: CompetitiveGapAnalysis[];
  analytics: CompetitorAnalytics | null;
  dateFilter: "7d" | "30d" | "90d";
}

export interface TimeSeriesChartProps {
  data: CompetitorTimeSeriesData[];
}

export interface AnalysisConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  websiteId?: string;
}

export interface DetailedAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: UIAnalysisResult | null;
}

export interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace?: Workspace | null;
}

export interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyChange?: () => void;
}

export interface WebsiteSettingsModalProps {
  website: Website | null;
  isOpen: boolean;
  onClose: () => void;
}

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Lazy load heavy chart components
const AnalysisVisualization = React.lazy(() => import("./AnalysisVisualization").then(module => ({ default: module.AnalysisVisualization })));
const ShareOfVoiceChart = React.lazy(() => import("./competitors/ShareOfVoiceChart").then(module => ({ default: module.default })));
const CompetitiveGapChart = React.lazy(() => import("./competitors/CompetitiveGapChart").then(module => ({ default: module.default })));
const TimeSeriesChart = React.lazy(() => import("./competitors/TimeSeriesChart").then(module => ({ default: module.default })));

// Lazy load heavy modal components
const AnalysisConfigModal = React.lazy(() => import("./AnalysisConfigModal").then(module => ({ default: module.AnalysisConfigModal })));
const DetailedAnalysisModal = React.lazy(() => import("./DetailedAnalysisModal").then(module => ({ default: module.DetailedAnalysisModal })));
const WorkspaceModal = React.lazy(() => import("./WorkspaceModal").then(module => ({ default: module.WorkspaceModal })));
const ApiKeyModal = React.lazy(() => import("./ApiKeyModal").then(module => ({ default: module.ApiKeyModal })));
const WebsiteSettingsModal = React.lazy(() => import("./WebsiteSettingsModal").then(module => ({ default: module.WebsiteSettingsModal })));
const ProfileModal = React.lazy(() => import("./ProfileModal").then(module => ({ default: module.ProfileModal })));

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

// Lazy wrapped components with proper typing
export const LazyAnalysisVisualization = React.memo((props: AnalysisVisualizationProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <AnalysisVisualization {...props} />
  </Suspense>
));

export const LazyShareOfVoiceChart = React.memo((props: ShareOfVoiceChartProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <ShareOfVoiceChart {...props} />
  </Suspense>
));

export const LazyCompetitiveGapChart = React.memo((props: CompetitiveGapChartProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <CompetitiveGapChart {...props} />
  </Suspense>
));

export const LazyTimeSeriesChart = React.memo((props: TimeSeriesChartProps) => (
  <Suspense fallback={<ChartSkeleton />}>
    <TimeSeriesChart {...props} />
  </Suspense>
));

export const LazyAnalysisConfigModal = React.memo((props: AnalysisConfigModalProps) => (
  <Suspense fallback={<ModalSkeleton />}>
    <AnalysisConfigModal {...props} />
  </Suspense>
));

export const LazyDetailedAnalysisModal = React.memo((props: DetailedAnalysisModalProps) => (
  <Suspense fallback={<ModalSkeleton />}>
    <DetailedAnalysisModal {...props} />
  </Suspense>
));

export const LazyWorkspaceModal = React.memo((props: WorkspaceModalProps) => {
  // Transform workspace with proper type casting for subscription_tier and settings
  const transformedProps = {
    ...props,
    workspace: props.workspace ? {
      ...props.workspace,
      subscription_tier: props.workspace.subscription_tier as SubscriptionTier | null,
      settings: (props.workspace.settings as WorkspaceSettings | null)
    } : props.workspace
  };

  return (
    <Suspense fallback={<ModalSkeleton />}>
      <WorkspaceModal {...transformedProps} />
    </Suspense>
  );
});

export const LazyApiKeyModal = React.memo((props: ApiKeyModalProps) => (
  <Suspense fallback={<ModalSkeleton />}>
    <ApiKeyModal {...props} />
  </Suspense>
));

export const LazyWebsiteSettingsModal = React.memo((props: WebsiteSettingsModalProps) => (
  <Suspense fallback={<ModalSkeleton />}>
    <WebsiteSettingsModal {...props} />
  </Suspense>
));

export const LazyProfileModal = React.memo((props: ProfileModalProps) => (
  <Suspense fallback={<ModalSkeleton />}>
    <ProfileModal {...props} />
  </Suspense>
));

