import { useQuery, useQueries, UseQueryResult } from "@tanstack/react-query";
import { useWorkspace } from "./useWorkspace";
import {
  dashboardService,
  type DashboardMetrics,
  type TimeSeriesData,
  type TopicPerformance,
  type LLMPerformance,
  type WebsitePerformance,
} from "@/services/dashboardService";

export interface DashboardFilters {
  dateRange?: { start: string; end: string };
  period: "7d" | "30d" | "90d";
}

// Query keys for consistent caching
export const dashboardKeys = {
  all: ['dashboard'] as const,
  metrics: (websiteIds: string[], dateRange?: { start: string; end: string }) => 
    [...dashboardKeys.all, 'metrics', websiteIds, dateRange] as const,
  timeSeries: (websiteIds: string[], period: string) => 
    [...dashboardKeys.all, 'timeSeries', websiteIds, period] as const,
  topics: (websiteIds: string[], limit: number) => 
    [...dashboardKeys.all, 'topics', websiteIds, limit] as const,
  llmPerformance: (websiteIds: string[]) => 
    [...dashboardKeys.all, 'llmPerformance', websiteIds] as const,
  websitePerformance: (websiteIds: string[]) => 
    [...dashboardKeys.all, 'websitePerformance', websiteIds] as const,
};

export function useDashboardMetrics(
  websiteIds: string[],
  dateRange?: { start: string; end: string }
): UseQueryResult<DashboardMetrics> {
  return useQuery({
    queryKey: dashboardKeys.metrics(websiteIds, dateRange),
    queryFn: () => dashboardService.getDashboardMetrics(websiteIds, dateRange),
    enabled: websiteIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes for metrics
  });
}

export function useDashboardTimeSeries(
  websiteIds: string[],
  period: "7d" | "30d" | "90d" = "7d"
): UseQueryResult<TimeSeriesData[]> {
  return useQuery({
    queryKey: dashboardKeys.timeSeries(websiteIds, period),
    queryFn: () => dashboardService.getTimeSeriesData(websiteIds, period),
    enabled: websiteIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes for time series
  });
}

export function useDashboardTopics(
  websiteIds: string[],
  limit: number = 10
): UseQueryResult<TopicPerformance[]> {
  return useQuery({
    queryKey: dashboardKeys.topics(websiteIds, limit),
    queryFn: () => dashboardService.getTopicPerformance(websiteIds, limit),
    enabled: websiteIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes for topics
  });
}

export function useDashboardLLMPerformance(
  websiteIds: string[]
): UseQueryResult<LLMPerformance[]> {
  return useQuery({
    queryKey: dashboardKeys.llmPerformance(websiteIds),
    queryFn: () => dashboardService.getLLMPerformance(websiteIds),
    enabled: websiteIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes for LLM performance
  });
}

export function useDashboardWebsitePerformance(
  websiteIds: string[]
): UseQueryResult<WebsitePerformance[]> {
  return useQuery({
    queryKey: dashboardKeys.websitePerformance(websiteIds),
    queryFn: () => dashboardService.getWebsitePerformance(websiteIds),
    enabled: websiteIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes for website performance
  });
}

// Combined dashboard data hook with parallel queries
export function useDashboardData(filters: DashboardFilters) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const websiteIds = websites?.map((w) => w.id) || [];

  // Convert period to dateRange if dateRange is not provided for consistent caching
  const effectiveDateRange = filters.dateRange || (() => {
    const days = filters.period === "7d" ? 7 : filters.period === "30d" ? 30 : 90;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
  })();

  const queries = useQueries({
    queries: [
      {
        queryKey: dashboardKeys.metrics(websiteIds, effectiveDateRange),
        queryFn: () => dashboardService.getDashboardMetrics(websiteIds, effectiveDateRange),
        enabled: !workspaceLoading && websiteIds.length > 0,
        staleTime: 2 * 60 * 1000,
      },
      {
        queryKey: dashboardKeys.timeSeries(websiteIds, filters.period),
        queryFn: () => dashboardService.getTimeSeriesData(websiteIds, filters.period),
        enabled: !workspaceLoading && websiteIds.length > 0,
        staleTime: 5 * 60 * 1000,
      },
      {
        queryKey: dashboardKeys.topics(websiteIds, 10),
        queryFn: () => dashboardService.getTopicPerformance(websiteIds, 10),
        enabled: !workspaceLoading && websiteIds.length > 0,
        staleTime: 10 * 60 * 1000,
      },
      {
        queryKey: dashboardKeys.llmPerformance(websiteIds),
        queryFn: () => dashboardService.getLLMPerformance(websiteIds),
        enabled: !workspaceLoading && websiteIds.length > 0,
        staleTime: 10 * 60 * 1000,
      },
      {
        queryKey: dashboardKeys.websitePerformance(websiteIds),
        queryFn: () => dashboardService.getWebsitePerformance(websiteIds),
        enabled: !workspaceLoading && websiteIds.length > 0,
        staleTime: 5 * 60 * 1000,
      },
    ],
  });

  const [
    metricsQuery,
    timeSeriesQuery,
    topicsQuery,
    llmPerformanceQuery,
    websitePerformanceQuery,
  ] = queries;

  return {
    metrics: metricsQuery.data || null,
    timeSeriesData: timeSeriesQuery.data || [],
    topicPerformance: topicsQuery.data || [],
    llmPerformance: llmPerformanceQuery.data || [],
    websitePerformance: websitePerformanceQuery.data || [],
    isLoading: queries.some((q) => q.isLoading),
    isRefreshing: queries.some((q) => q.isFetching && !q.isLoading),
    error: queries.find((q) => q.error)?.error || null,
    refetch: () => {
      queries.forEach((query) => query.refetch());
    },
    hasData: metricsQuery.data !== null,
  };
}