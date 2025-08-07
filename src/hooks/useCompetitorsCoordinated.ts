import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspace } from './useWorkspace';
import { useToast } from './use-toast';
import {
  competitorService,
  type Competitor,
  type CompetitorPerformance,
  type CompetitorAnalytics,
} from '@/services/competitorService';

export interface CompetitorFilters {
  dateRange?: { start: string; end: string };
  sortBy?: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore";
  sortOrder?: "asc" | "desc";
  showInactive?: boolean;
}

export interface CompetitorWithStatus extends Competitor {
  analysisStatus: "completed" | "in_progress" | "pending";
  performance?: CompetitorPerformance;
  addedAt: string;
}

interface CompetitorsData {
  competitors: Competitor[];
  competitorsWithStatus: CompetitorWithStatus[];
  performance: CompetitorPerformance[];
  analytics: CompetitorAnalytics | null;
}

export function useCompetitorsCoordinated(websiteId: string, filters: CompetitorFilters = {}) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();
  
  const targetWebsiteId = websiteId || websites?.[0]?.id;
  
  const [data, setData] = useState<CompetitorsData>({
    competitors: [],
    competitorsWithStatus: [],
    performance: [],
    analytics: null,
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadAllData = useCallback(async (isRefresh = false) => {
    if (workspaceLoading || !targetWebsiteId) {
      return;
    }

    // Set loading states appropriately to prevent flickering
    if (!isRefresh && isInitialLoad) {
      setIsLoading(true);
    } else if (isRefresh) {
      setIsRefreshing(true);
    }
    
    setError(null);

    try {
      // Load all competitor data in parallel
      const [
        competitorsResult,
        performanceResult,
        analyticsResult,
      ] = await Promise.all([
        competitorService.getCompetitors(targetWebsiteId),
        competitorService.getCompetitorPerformance(targetWebsiteId, filters.dateRange),
        competitorService.getCompetitiveAnalysis(targetWebsiteId, filters.dateRange),
      ]);

      // Create competitors with status
      const competitorsWithStatus: CompetitorWithStatus[] = competitorsResult.map((competitor) => {
        const performance = performanceResult.find(p => p.domain === competitor.domain);
        return {
          ...competitor,
          analysisStatus: performance ? "completed" : "pending" as const,
          performance,
          addedAt: competitor.created_at || new Date().toISOString(),
        };
      });

      // Apply sorting to competitors with status
      if (filters.sortBy && filters.sortOrder) {
        competitorsWithStatus.sort((a, b) => {
          let comparison = 0;
          const aPerf = a.performance;
          const bPerf = b.performance;

          switch (filters.sortBy) {
            case 'shareOfVoice':
              comparison = (aPerf?.shareOfVoice || 0) - (bPerf?.shareOfVoice || 0);
              break;
            case 'averageRank':
              comparison = (aPerf?.averageRank || 0) - (bPerf?.averageRank || 0);
              break;
            case 'mentionCount':
              comparison = (aPerf?.mentionCount || 0) - (bPerf?.mentionCount || 0);
              break;
            case 'sentimentScore':
              comparison = (aPerf?.sentimentScore || 0) - (bPerf?.sentimentScore || 0);
              break;
          }

          return filters.sortOrder === 'desc' ? -comparison : comparison;
        });
      }

      // Set all data at once to prevent multiple re-renders
      setData({
        competitors: competitorsResult,
        competitorsWithStatus,
        performance: performanceResult,
        analytics: analyticsResult,
      });

      if (isRefresh) {
        toast({
          title: "Competitors data updated",
          description: "Latest competitor data has been loaded successfully.",
        });
      }

      // Mark as no longer initial load after first successful load
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Failed to load competitor data');
      setError(errorObj);
      
      toast({
        title: "Error loading competitors",
        description: errorObj.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [targetWebsiteId, filters, workspaceLoading, isInitialLoad, toast]);

  const refresh = useCallback(() => {
    loadAllData(true);
  }, [loadAllData]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load data when dependencies change, with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadAllData();
    }, 100); // Short delay to batch dependency changes

    return () => clearTimeout(timeoutId);
  }, [loadAllData]);

  const hasData = useMemo(() => {
    return data.competitors.length > 0 || 
           data.performance.length > 0 || 
           data.analytics !== null;
  }, [data]);

  return {
    ...data,
    isLoading,
    isInitialLoad,
    isRefreshing,
    error,
    hasData,
    refetch: refresh,
    refresh,
    clearError,
    targetWebsiteId,
  };
}