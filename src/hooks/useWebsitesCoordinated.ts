import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWorkspace } from "./useWorkspace";
import { useToast } from "./use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  isRefreshingMetrics?: boolean; // Add loading state for individual websites
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
  const [refreshingWebsites, setRefreshingWebsites] = useState<Set<string>>(new Set());

  const loadWebsiteMetrics = useCallback(
    async (websiteId: string): Promise<WebsiteMetrics> => {
      try {
        // OPTIMIZED: Use materialized view for lightning-fast website metrics
        console.log(`🚀 Using mv_analysis_results materialized view for website metrics (website: ${websiteId})`);

        // Get comprehensive data from materialized view in one query
        const { data: analysisData, error: analysisError } = await (supabase
          .schema("beekon_data") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
          .from("mv_analysis_results")
          .select(`
            is_mentioned,
            analyzed_at,
            topic_name
          `)
          .eq("website_id", websiteId)
          .order("analyzed_at", { ascending: false });

        if (analysisError) throw analysisError;

        // Calculate metrics from materialized view data
        const analysisResults = analysisData || [];
        const totalAnalyses = analysisResults.length;
        const visibleCount = analysisResults.filter((item: any) => item.is_mentioned).length; // eslint-disable-line @typescript-eslint/no-explicit-any
        const avgVisibility = totalAnalyses > 0 ? (visibleCount / totalAnalyses) * 100 : 0;
        const lastAnalysisDate = analysisResults.length > 0 ? analysisResults[0]?.analyzed_at : undefined;

        // Get unique topics count from materialized view data
        const uniqueTopics = new Set(analysisResults.map((item: any) => item.topic_name)); // eslint-disable-line @typescript-eslint/no-explicit-any
        const totalTopics = uniqueTopics.size;

        return {
          totalTopics,
          avgVisibility,
          totalAnalyses,
          lastAnalysisDate: lastAnalysisDate || undefined,
        };

      } catch (error) {
        console.warn(`⚠️ Materialized view query failed for website metrics, falling back (website: ${websiteId}):`, error);

        // Fallback to original queries if materialized view fails
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
            .order("created_at", { ascending: false });

          const totalTopics = topicsQuery.count || 0;
          const visibilityData = visibilityQuery.data || [];
          const totalAnalyses = visibilityData.length;
          const visibleCount = visibilityData.filter(
            (item) => item.is_mentioned
          ).length;
          const avgVisibility =
            totalAnalyses > 0 ? (visibleCount / totalAnalyses) * 100 : 0;
          const lastAnalysisDate =
            visibilityData.length > 0 ? visibilityData[0]?.created_at : undefined;

          return {
            totalTopics,
            avgVisibility,
            totalAnalyses,
            lastAnalysisDate: lastAnalysisDate || undefined,
          };
        } catch (fallbackError) {
          console.error(`❌ Both materialized view and fallback queries failed for website ${websiteId}:`, fallbackError);
          return {
            totalTopics: 0,
            avgVisibility: 0,
            totalAnalyses: 0,
          };
        }
      }
    },
    []
  );

  const loadAllData = useCallback(
    async (isRefresh = false) => {
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
        const metricsPromises = websites.map((website) =>
          loadWebsiteMetrics(website.id).then((metrics) => ({
            id: website.id,
            domain: website.domain,
            display_name: website.display_name,
            is_active: website.is_active,
            monitoring_enabled: true, // Default monitoring enabled
            created_at: website.created_at,
            metrics: {
              totalTopics: metrics.totalTopics,
              avgVisibility: metrics.avgVisibility,
              totalAnalyses: metrics.totalAnalyses,
              lastAnalysisDate: metrics.lastAnalysisDate,
            },
          }))
        );

        const websitesWithMetrics = await Promise.all(metricsPromises);

        // Add loading state property to each website (initially false)
        const websitesWithLoadingState = websitesWithMetrics.map(website => ({
          ...website,
          isRefreshingMetrics: false,
        }));

        // Calculate total metrics
        const totalMetrics = {
          totalWebsites: websitesWithLoadingState.length,
          activeWebsites: websitesWithLoadingState.filter((w) => w.is_active).length,
          totalTopics: websitesWithLoadingState.reduce(
            (sum, w) => sum + w.metrics.totalTopics,
            0
          ),
          avgVisibilityAcrossAll:
            websitesWithLoadingState.length > 0
              ? websitesWithLoadingState.reduce(
                  (sum, w) => sum + w.metrics.avgVisibility,
                  0
                ) / websitesWithLoadingState.length
              : 0,
        };

        // Set all data at once to prevent multiple re-renders
        setData({
          websites: websitesWithLoadingState,
          totalMetrics,
        });

        if (isRefresh) {
          toast({
            title: "Website data updated",
            description:
              "Latest website metrics have been loaded successfully.",
          });
        }

        // Mark as no longer initial load after first successful load
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
      } catch (error) {
        const errorObj =
          error instanceof Error
            ? error
            : new Error("Failed to load website data");
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
    },
    [websites, workspaceLoading, isInitialLoad, toast, loadWebsiteMetrics]
  );

  // FIXED: Use ref to break circular dependency and prevent infinite loops
  const loadAllDataRef = useRef(loadAllData);

  // Update ref when function changes
  useEffect(() => {
    loadAllDataRef.current = loadAllData;
  }, [loadAllData]);

  const refresh = useCallback(() => {
    loadAllDataRef.current(true);
  }, []); // No dependencies needed since we use ref

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check if a specific website is currently refreshing metrics
  const isWebsiteRefreshingMetrics = useCallback((websiteId: string) => {
    const website = data.websites.find(w => w.id === websiteId);
    return website?.isRefreshingMetrics || refreshingWebsites.has(websiteId);
  }, [data.websites, refreshingWebsites]);

  // Refresh individual website metrics when status changes to completed
  const refreshWebsiteMetrics = useCallback(async (websiteId: string) => {
    try {
      // Refreshing metrics for website
      
      // Set loading state for this specific website
      setRefreshingWebsites(prev => new Set([...prev, websiteId]));
      
      // Update website with loading state
      setData(prevData => ({
        ...prevData,
        websites: prevData.websites.map(website => 
          website.id === websiteId 
            ? { ...website, isRefreshingMetrics: true }
            : website
        ),
      }));
      
      // Load fresh metrics for this specific website
      const metrics = await loadWebsiteMetrics(websiteId);
      
      // Update the website in our data with new metrics and remove loading state
      setData(prevData => {
        const updatedWebsites = prevData.websites.map(website => 
          website.id === websiteId 
            ? { ...website, metrics, isRefreshingMetrics: false }
            : website
        );
        
        // Recalculate total metrics
        const totalMetrics = {
          totalWebsites: updatedWebsites.length,
          activeWebsites: updatedWebsites.filter(w => w.is_active).length,
          totalTopics: updatedWebsites.reduce((sum, w) => sum + w.metrics.totalTopics, 0),
          avgVisibilityAcrossAll: 
            updatedWebsites.length > 0
              ? updatedWebsites.reduce((sum, w) => sum + w.metrics.avgVisibility, 0) / updatedWebsites.length
              : 0,
        };
        
        return {
          websites: updatedWebsites,
          totalMetrics,
        };
      });
      
      // Successfully updated metrics for website
    } catch (error) {
      // Failed to refresh metrics for website
      
      // Remove loading state on error
      setData(prevData => ({
        ...prevData,
        websites: prevData.websites.map(website => 
          website.id === websiteId 
            ? { ...website, isRefreshingMetrics: false }
            : website
        ),
      }));
    } finally {
      // Clean up loading state
      setRefreshingWebsites(prev => {
        const newSet = new Set(prev);
        newSet.delete(websiteId);
        return newSet;
      });
    }
  }, [loadWebsiteMetrics]);

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
      loadAllDataRef.current(); // Use ref to avoid circular dependency
    }, 100); // Short delay to batch dependency changes

    return () => clearTimeout(timeoutId);
  }, [websites]); // Removed loadAllData from dependencies

  // Listen for real-time website status updates to refresh metrics
  useEffect(() => {
    const handleWebsiteStatusUpdate = (event: CustomEvent) => {
      const { websiteId, status } = event.detail;
      
      // Only refresh metrics when status changes to "completed"
      if (status === 'completed') {
        // Website completed detected - refresh metrics after short delay
        
        // Small delay to ensure database has been updated
        setTimeout(() => {
          refreshWebsiteMetrics(websiteId);
        }, 1000);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('websiteStatusUpdate', handleWebsiteStatusUpdate as EventListener);
      
      return () => {
        window.removeEventListener('websiteStatusUpdate', handleWebsiteStatusUpdate as EventListener);
      };
    }
    
    return undefined;
  }, [refreshWebsiteMetrics]);

  const hasData = useMemo(() => {
    return data.websites.length > 0;
  }, [data]);

  // Get individual website metrics (backward compatibility)
  const getWebsiteMetrics = useCallback(
    (websiteId: string) => {
      const website = data.websites.find((w) => w.id === websiteId);
      return (
        website?.metrics || {
          totalTopics: 0,
          avgVisibility: 0,
          totalAnalyses: 0,
        }
      );
    },
    [data.websites]
  );

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
    refreshWebsiteMetrics, // Expose for manual refresh if needed
    isWebsiteRefreshingMetrics, // Expose loading state checker
  };
}
