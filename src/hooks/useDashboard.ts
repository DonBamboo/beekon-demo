import {
  dashboardService,
  type DashboardMetrics,
  type LLMPerformance,
  type TimeSeriesData,
  type TopicPerformance,
  type WebsitePerformance,
} from "@/services/dashboardService";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "./use-toast";
import { useWorkspace } from "./useWorkspace";

// Re-export types for external use
export type { DashboardMetrics };

export interface DashboardError {
  message: string;
  type: "metrics" | "charts" | "topics" | "llm" | "websites";
}

export interface DashboardState {
  metrics: DashboardMetrics | null;
  timeSeriesData: TimeSeriesData[];
  topicPerformance: TopicPerformance[];
  llmPerformance: LLMPerformance[];
  websitePerformance: WebsitePerformance[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: DashboardError | null;
}

export interface DashboardFilters {
  dateRange?: { start: string; end: string };
  period: "7d" | "30d" | "90d";
}

export function useDashboardMetrics(
  filters: DashboardFilters = { period: "7d" }
) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();

  const [state, setState] = useState<DashboardState>({
    metrics: null,
    timeSeriesData: [],
    topicPerformance: [],
    llmPerformance: [],
    websitePerformance: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
  });

  const websiteIds = useMemo(
    () => websites?.map((w) => w.id) || [],
    [websites]
  );

  const { dateRange, period } = filters;

  const loadDashboardData = useCallback(
    async (isRefresh = false) => {
      if (workspaceLoading || websiteIds.length === 0) return;

      setState((prev) => ({
        ...prev,
        isLoading: !isRefresh,
        isRefreshing: isRefresh,
        error: null,
      }));

      try {
        // Load all dashboard data in parallel
        const [
          metrics,
          timeSeriesData,
          topicPerformance,
          llmPerformance,
          websitePerformance,
        ] = await Promise.all([
          dashboardService.getDashboardMetrics(websiteIds, dateRange),
          dashboardService.getTimeSeriesData(websiteIds, period),
          dashboardService.getTopicPerformance(websiteIds, 10),
          dashboardService.getLLMPerformance(websiteIds),
          dashboardService.getWebsitePerformance(websiteIds),
        ]);

        setState((prev) => ({
          ...prev,
          metrics,
          timeSeriesData,
          topicPerformance,
          llmPerformance,
          websitePerformance,
          isLoading: false,
          isRefreshing: false,
          error: null,
        }));

        if (isRefresh) {
          toast({
            title: "Dashboard updated",
            description: "Latest data has been loaded successfully.",
          });
        }
      } catch (error) {
        // Failed to load dashboard data

        const dashboardError: DashboardError = {
          message:
            error instanceof Error
              ? error.message
              : "Failed to load dashboard data",
          type: "metrics",
        };

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: dashboardError,
        }));

        toast({
          title: "Error loading dashboard",
          description: dashboardError.message,
          variant: "destructive",
        });
      }
    },
    [websiteIds, dateRange, period, workspaceLoading, toast]
  );

  const refreshData = useCallback(() => {
    loadDashboardData(true);
  }, [loadDashboardData]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Load data when dependencies change
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  return {
    ...state,
    refreshData,
    clearError,
    hasData: state.metrics !== null,
  };
}

export function useDashboardCharts(period: "7d" | "30d" | "90d" = "7d") {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const websiteIds = useMemo(
    () => websites?.map((w) => w.id) || [],
    [websites]
  );

  const loadChartData = useCallback(async () => {
    if (workspaceLoading || websiteIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await dashboardService.getTimeSeriesData(websiteIds, period);
      setTimeSeriesData(data);
    } catch (error) {
      // Failed to load chart data
      setError(
        error instanceof Error ? error.message : "Failed to load chart data"
      );
    } finally {
      setIsLoading(false);
    }
  }, [websiteIds, period, workspaceLoading]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  return {
    timeSeriesData,
    isLoading,
    error,
    refreshData: loadChartData,
  };
}

export function useDashboardTopics(limit: number = 10) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const websiteIds = useMemo(
    () => websites?.map((w) => w.id) || [],
    [websites]
  );

  const loadTopicData = useCallback(async () => {
    if (workspaceLoading || websiteIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await dashboardService.getTopicPerformance(
        websiteIds,
        limit
      );
      setTopicPerformance(data);
    } catch (error) {
      // Failed to load topic data
      setError(
        error instanceof Error ? error.message : "Failed to load topic data"
      );
    } finally {
      setIsLoading(false);
    }
  }, [websiteIds, limit, workspaceLoading]);

  useEffect(() => {
    loadTopicData();
  }, [loadTopicData]);

  return {
    topicPerformance,
    isLoading,
    error,
    refreshData: loadTopicData,
  };
}

export function useDashboardWebsites() {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const [websitePerformance, setWebsitePerformance] = useState<
    WebsitePerformance[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const websiteIds = useMemo(
    () => websites?.map((w) => w.id) || [],
    [websites]
  );

  const loadWebsiteData = useCallback(async () => {
    if (workspaceLoading || websiteIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await dashboardService.getWebsitePerformance(websiteIds);
      setWebsitePerformance(data);
    } catch (error) {
      // Failed to load website data
      setError(
        error instanceof Error ? error.message : "Failed to load website data"
      );
    } finally {
      setIsLoading(false);
    }
  }, [websiteIds, workspaceLoading]);

  useEffect(() => {
    loadWebsiteData();
  }, [loadWebsiteData]);

  return {
    websitePerformance,
    isLoading,
    error,
    refreshData: loadWebsiteData,
  };
}
