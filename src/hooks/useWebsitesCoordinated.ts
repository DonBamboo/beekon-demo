import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWorkspace } from './useWorkspace';
import { useToast } from './use-toast';
import { supabase } from '@/integrations/supabase/client';

interface WebsiteMetrics {
  totalTopics: number;
  avgVisibility: number;
  totalAnalyses: number;
  lastAnalysisDate?: string;
}

interface WebsiteWithMetrics {
  id: string;
  domain: string;
  display_name: string;
  is_active: boolean;
  monitoring_enabled: boolean;
  created_at: string;
  metrics: WebsiteMetrics;
}

interface WebsitesData {
  websites: WebsiteWithMetrics[];
  totalMetrics: {
    totalWebsites: number;
    activeWebsites: number;
    totalTopics: number;
    avgVisibilityAcrossAll: number;
  };
}

export function useWebsitesCoordinated() {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();
  
  const [data, setData] = useState<WebsitesData>({
    websites: [],
    totalMetrics: {
      totalWebsites: 0,
      activeWebsites: 0,
      totalTopics: 0,
      avgVisibilityAcrossAll: 0,
    },
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadWebsiteMetrics = useCallback(async (websiteId: string): Promise<WebsiteMetrics> => {
    try {
      // Get total topics for this website
      const topicsQuery = await supabase
        .schema("beekon_data")
        .from("topics")
        .select("*", { count: "exact", head: true })
        .eq("website_id", websiteId);

      // Get visibility data for this website
      const visibilityQuery = await supabase
        .schema("beekon_data")
        .from("llm_analysis_results")
        .select("is_mentioned, created_at")
        .eq("website_id", websiteId)
        .order('created_at', { ascending: false });

      const totalTopics = topicsQuery.count || 0;
      const visibilityData = visibilityQuery.data || [];
      const totalAnalyses = visibilityData.length;
      const visibleCount = visibilityData.filter((item) => item.is_mentioned).length;
      const avgVisibility = totalAnalyses > 0 ? (visibleCount / totalAnalyses) * 100 : 0;
      const lastAnalysisDate = visibilityData.length > 0 ? visibilityData[0]?.created_at : undefined;

      return {
        totalTopics,
        avgVisibility,
        totalAnalyses,
        lastAnalysisDate,
      };
    } catch (error) {
      console.warn(`Failed to load metrics for website ${websiteId}:`, error);
      return {
        totalTopics: 0,
        avgVisibility: 0,
        totalAnalyses: 0,
      };
    }
  }, []);

  const loadAllData = useCallback(async (isRefresh = false) => {
    if (workspaceLoading || !websites || websites.length === 0) {
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
      // Load metrics for all websites in parallel
      const metricsPromises = websites.map(website => 
        loadWebsiteMetrics(website.id).then(metrics => ({
          ...website,
          metrics,
        }))
      );

      const websitesWithMetrics = await Promise.all(metricsPromises);

      // Calculate total metrics
      const totalMetrics = {
        totalWebsites: websitesWithMetrics.length,
        activeWebsites: websitesWithMetrics.filter(w => w.is_active).length,
        totalTopics: websitesWithMetrics.reduce((sum, w) => sum + w.metrics.totalTopics, 0),
        avgVisibilityAcrossAll: websitesWithMetrics.length > 0 
          ? websitesWithMetrics.reduce((sum, w) => sum + w.metrics.avgVisibility, 0) / websitesWithMetrics.length
          : 0,
      };

      // Set all data at once to prevent multiple re-renders
      setData({
        websites: websitesWithMetrics,
        totalMetrics,
      });

      if (isRefresh) {
        toast({
          title: "Website data updated",
          description: "Latest website metrics have been loaded successfully.",
        });
      }

      // Mark as no longer initial load after first successful load
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }

    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Failed to load website data');
      setError(errorObj);
      
      toast({
        title: "Error loading websites",
        description: errorObj.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [websites, workspaceLoading, isInitialLoad, toast, loadWebsiteMetrics]);

  const refresh = useCallback(() => {
    loadAllData(true);
  }, [loadAllData]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load data when websites change, with debouncing
  useEffect(() => {
    if (!websites || websites.length === 0) {
      // Reset data when no websites
      setData({
        websites: [],
        totalMetrics: {
          totalWebsites: 0,
          activeWebsites: 0,
          totalTopics: 0,
          avgVisibilityAcrossAll: 0,
        },
      });
      return;
    }

    const timeoutId = setTimeout(() => {
      loadAllData();
    }, 100); // Short delay to batch dependency changes

    return () => clearTimeout(timeoutId);
  }, [websites, loadAllData]);

  const hasData = useMemo(() => {
    return data.websites.length > 0;
  }, [data]);

  // Get individual website metrics (backward compatibility)
  const getWebsiteMetrics = useCallback((websiteId: string) => {
    const website = data.websites.find(w => w.id === websiteId);
    return website?.metrics || { totalTopics: 0, avgVisibility: 0, totalAnalyses: 0 };
  }, [data.websites]);

  return {
    ...data,
    isLoading,
    isInitialLoad,
    isRefreshing,
    error,
    hasData,
    refresh,
    clearError,
    getWebsiteMetrics,
  };
}