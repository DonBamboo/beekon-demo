import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspace } from './useWorkspace';
import { dashboardService, type DashboardMetrics, type LLMPerformance, type TimeSeriesData, type TopicPerformance, type WebsitePerformance } from '@/services/dashboardService';
import { useToast } from './use-toast';

export interface DashboardFilters {
  dateRange?: { start: string; end: string };
  period: "7d" | "30d" | "90d";
}

interface DashboardData {
  metrics: DashboardMetrics | null;
  timeSeriesData: TimeSeriesData[];
  topicPerformance: TopicPerformance[];
  llmPerformance: LLMPerformance[];
  websitePerformance: WebsitePerformance[];
}

export function useDashboardCoordinated(filters: DashboardFilters = { period: "7d" }) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();
  
  const [data, setData] = useState<DashboardData>({
    metrics: null,
    timeSeriesData: [],
    topicPerformance: [],
    llmPerformance: [],
    websitePerformance: [],
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const websiteIds = useMemo(
    () => websites?.map((w) => w.id) || [],
    [websites]
  );

  const { dateRange, period } = filters;

  const loadAllData = useCallback(async (isRefresh = false) => {
    // Don't load if workspace is still loading or no websites
    if (workspaceLoading || websiteIds.length === 0) {
      return;
    }

    // Set loading states appropriately
    if (!isRefresh && isInitialLoad) {
      setIsLoading(true);
    } else if (isRefresh) {
      setIsRefreshing(true);
    }
    
    setError(null);

    try {
      // Load all dashboard data in parallel - this is the key to preventing flickering
      const [
        metricsResult,
        timeSeriesResult,
        topicPerformanceResult,
        llmPerformanceResult,
        websitePerformanceResult,
      ] = await Promise.all([
        dashboardService.getDashboardMetrics(websiteIds, dateRange),
        dashboardService.getTimeSeriesData(websiteIds, period),
        dashboardService.getTopicPerformance(websiteIds, 10),
        dashboardService.getLLMPerformance(websiteIds),
        dashboardService.getWebsitePerformance(websiteIds),
      ]);

      // Set all data at once - prevents multiple re-renders
      setData({
        metrics: metricsResult,
        timeSeriesData: timeSeriesResult,
        topicPerformance: topicPerformanceResult,
        llmPerformance: llmPerformanceResult,
        websitePerformance: websitePerformanceResult,
      });

      if (isRefresh) {
        toast({
          title: "Dashboard updated",
          description: "Latest data has been loaded successfully.",
        });
      }

      // Mark as no longer initial load after first successful load
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Failed to load dashboard data');
      setError(errorObj);
      
      toast({
        title: "Error loading dashboard",
        description: errorObj.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [websiteIds, dateRange, period, workspaceLoading, isInitialLoad, toast]);

  const refresh = useCallback(() => {
    loadAllData(true);
  }, [loadAllData]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load data when dependencies change, but debounce to prevent rapid calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadAllData();
    }, 100); // Short delay to batch dependency changes

    return () => clearTimeout(timeoutId);
  }, [loadAllData]);

  const hasData = useMemo(() => {
    return data.metrics !== null || 
           data.timeSeriesData.length > 0 || 
           data.topicPerformance.length > 0 || 
           data.llmPerformance.length > 0 || 
           data.websitePerformance.length > 0;
  }, [data]);

  return {
    ...data,
    isLoading,
    isInitialLoad,
    isRefreshing,
    error,
    hasData,
    refresh,
    clearError,
  };
}