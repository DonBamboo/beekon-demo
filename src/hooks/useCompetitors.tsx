import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "./use-toast";
import { useWorkspace } from "./useWorkspace";
import { useSubscriptionEnforcement } from "./useSubscriptionEnforcement";
import {
  competitorService,
  type Competitor,
  type CompetitorPerformance,
  type CompetitorAnalytics,
} from "@/services/competitorService";

export interface CompetitorError {
  message: string;
  type: "fetch" | "add" | "update" | "delete" | "analytics";
}

export interface CompetitorFilters {
  dateRange?: { start: string; end: string };
  sortBy?: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore";
  sortOrder?: "asc" | "desc";
  showInactive?: boolean;
}

export interface CompetitorState {
  competitors: Competitor[];
  performance: CompetitorPerformance[];
  analytics: CompetitorAnalytics | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: CompetitorError | null;
}

export function useCompetitors(
  websiteId?: string,
  filters: CompetitorFilters = {}
) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();
  const { consumeCreditForCompetitor, restoreCredit } = useSubscriptionEnforcement();
  const [state, setState] = useState<CompetitorState>({
    competitors: [],
    performance: [],
    analytics: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
  });

  // Use first website if no websiteId provided
  const targetWebsiteId = useMemo(() => {
    if (websiteId) return websiteId;
    return websites?.[0]?.id;
  }, [websiteId, websites]);

  // Memoize filters to prevent infinite loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedFilters = useMemo(() => filters, [
    filters.dateRange?.start,
    filters.dateRange?.end,
    filters.sortBy,
    filters.sortOrder,
    filters.showInactive,
  ]);

  const loadCompetitorData = useCallback(
    async (isRefresh = false) => {
      if (workspaceLoading || !targetWebsiteId) return;

      setState((prev) => ({
        ...prev,
        isLoading: !isRefresh,
        isRefreshing: isRefresh,
        error: null,
      }));

      try {
        // Load competitors and performance data in parallel
        const [competitors, performance, analytics] = await Promise.all([
          competitorService.getCompetitors(targetWebsiteId),
          competitorService.getCompetitorPerformance(
            targetWebsiteId,
            memoizedFilters.dateRange
          ),
          competitorService.getCompetitiveAnalysis(
            targetWebsiteId,
            memoizedFilters.dateRange
          ),
        ]);

        // Filter inactive competitors if needed
        const filteredCompetitors = memoizedFilters.showInactive
          ? competitors
          : competitors.filter((c) => c.is_active);

        // Sort performance data
        const sortedPerformance = sortPerformanceData(
          performance,
          memoizedFilters.sortBy,
          memoizedFilters.sortOrder
        );

        setState((prev) => ({
          ...prev,
          competitors: filteredCompetitors,
          performance: sortedPerformance,
          analytics,
          isLoading: false,
          isRefreshing: false,
          error: null,
        }));

        if (isRefresh) {
          toast({
            title: "Competitors updated",
            description: "Latest competitor data has been loaded successfully.",
          });
        }
      } catch (error) {
        console.error("Failed to load competitor data:", error);

        const competitorError: CompetitorError = {
          message:
            error instanceof Error
              ? error.message
              : "Failed to load competitor data",
          type: "fetch",
        };

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRefreshing: false,
          error: competitorError,
        }));

        toast({
          title: "Error loading competitors",
          description: competitorError.message,
          variant: "destructive",
        });
      }
    },
    [targetWebsiteId, memoizedFilters, workspaceLoading, toast]
  );

  const addCompetitor = useCallback(
    async (domain: string, name?: string) => {
      if (!targetWebsiteId) return;

      let creditConsumed = false;

      try {
        // Check if user can consume credits for competitor addition
        const canConsume = await consumeCreditForCompetitor();
        if (!canConsume) {
          return;
        }
        creditConsumed = true;

        const newCompetitor = await competitorService.addCompetitor(
          targetWebsiteId,
          domain,
          name
        );

        setState((prev) => ({
          ...prev,
          competitors: [...prev.competitors, newCompetitor],
        }));

        toast({
          title: "Competitor added",
          description: `${name || domain} has been added to your competitor list.`,
        });

        // Refresh performance data
        await loadCompetitorData(true);
      } catch (error) {
        console.error("Failed to add competitor:", error);

        // If we consumed a credit but the operation failed, restore it
        if (creditConsumed) {
          console.log("Restoring credit due to failed competitor addition");
          await restoreCredit();
        }

        const competitorError: CompetitorError = {
          message:
            error instanceof Error ? error.message : "Failed to add competitor",
          type: "add",
        };

        setState((prev) => ({
          ...prev,
          error: competitorError,
        }));

        toast({
          title: "Error adding competitor",
          description: competitorError.message,
          variant: "destructive",
        });

        throw error;
      }
    },
    [targetWebsiteId, loadCompetitorData, toast, consumeCreditForCompetitor, restoreCredit]
  );

  const updateCompetitor = useCallback(
    async (
      competitorId: string,
      updates: Partial<Pick<Competitor, "competitor_name" | "is_active">>
    ) => {
      try {
        const updatedCompetitor = await competitorService.updateCompetitor(
          competitorId,
          updates
        );

        setState((prev) => ({
          ...prev,
          competitors: prev.competitors.map((c) =>
            c.id === competitorId ? updatedCompetitor : c
          ),
        }));

        toast({
          title: "Competitor updated",
          description: "Competitor information has been updated successfully.",
        });

        // Refresh performance data
        await loadCompetitorData(true);
      } catch (error) {
        console.error("Failed to update competitor:", error);

        const competitorError: CompetitorError = {
          message:
            error instanceof Error
              ? error.message
              : "Failed to update competitor",
          type: "update",
        };

        setState((prev) => ({
          ...prev,
          error: competitorError,
        }));

        toast({
          title: "Error updating competitor",
          description: competitorError.message,
          variant: "destructive",
        });

        throw error;
      }
    },
    [loadCompetitorData, toast]
  );

  const deleteCompetitor = useCallback(
    async (competitorId: string) => {
      try {
        await competitorService.deleteCompetitor(competitorId);

        setState((prev) => ({
          ...prev,
          competitors: prev.competitors.filter((c) => c.id !== competitorId),
          performance: prev.performance.filter(
            (p) => p.competitorId !== competitorId
          ),
        }));

        toast({
          title: "Competitor removed",
          description: "Competitor has been removed from tracking.",
        });

        // Refresh analytics data
        await loadCompetitorData(true);
      } catch (error) {
        console.error("Failed to delete competitor:", error);

        const competitorError: CompetitorError = {
          message:
            error instanceof Error
              ? error.message
              : "Failed to remove competitor",
          type: "delete",
        };

        setState((prev) => ({
          ...prev,
          error: competitorError,
        }));

        toast({
          title: "Error removing competitor",
          description: competitorError.message,
          variant: "destructive",
        });

        throw error;
      }
    },
    [loadCompetitorData, toast]
  );

  const exportCompetitorData = useCallback(
    async (format: "pdf" | "csv" | "json") => {
      if (!targetWebsiteId) return;

      try {
        const blob = await competitorService.exportCompetitorData(
          targetWebsiteId,
          format,
          memoizedFilters.dateRange
        );

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `competitors-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast({
          title: "Export successful",
          description: `Competitor data exported as ${format.toUpperCase()}`,
        });
      } catch (error) {
        console.error("Failed to export competitor data:", error);

        toast({
          title: "Export failed",
          description: "Failed to export competitor data. Please try again.",
          variant: "destructive",
        });
      }
    },
    [targetWebsiteId, memoizedFilters.dateRange, toast]
  );

  const refreshData = useCallback(() => {
    loadCompetitorData(true);
  }, [loadCompetitorData]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Load data when dependencies change
  useEffect(() => {
    loadCompetitorData();
  }, [loadCompetitorData]);

  return {
    ...state,
    addCompetitor,
    updateCompetitor,
    deleteCompetitor,
    exportCompetitorData,
    refreshData,
    clearError,
    hasData: state.competitors.length > 0,
    targetWebsiteId,
  };
}

function sortPerformanceData(
  performance: CompetitorPerformance[],
  sortBy: CompetitorFilters["sortBy"] = "shareOfVoice",
  sortOrder: CompetitorFilters["sortOrder"] = "desc"
): CompetitorPerformance[] {
  return [...performance].sort((a, b) => {
    let aValue: number;
    let bValue: number;

    switch (sortBy) {
      case "shareOfVoice":
        aValue = a.shareOfVoice;
        bValue = b.shareOfVoice;
        break;
      case "averageRank":
        aValue = a.averageRank;
        bValue = b.averageRank;
        break;
      case "mentionCount":
        aValue = a.mentionCount;
        bValue = b.mentionCount;
        break;
      case "sentimentScore":
        aValue = a.sentimentScore;
        bValue = b.sentimentScore;
        break;
      default:
        aValue = a.shareOfVoice;
        bValue = b.shareOfVoice;
    }

    if (sortOrder === "asc") {
      return aValue - bValue;
    } else {
      return bValue - aValue;
    }
  });
}

// Hook for getting competitor analytics only
export function useCompetitorAnalytics(
  websiteId?: string,
  dateRange?: { start: string; end: string }
) {
  const { websites, loading: workspaceLoading } = useWorkspace();
  const [analytics, setAnalytics] = useState<CompetitorAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use first website if no websiteId provided
  const targetWebsiteId = useMemo(() => {
    if (websiteId) return websiteId;
    return websites?.[0]?.id;
  }, [websiteId, websites]);

  const loadAnalytics = useCallback(async () => {
    if (workspaceLoading || !targetWebsiteId) return;

    setIsLoading(true);
    setError(null);

    try {
      const analyticsData = await competitorService.getCompetitiveAnalysis(
        targetWebsiteId,
        dateRange
      );
      setAnalytics(analyticsData);
    } catch (error) {
      console.error("Failed to load competitor analytics:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load competitor analytics"
      );
    } finally {
      setIsLoading(false);
    }
  }, [targetWebsiteId, dateRange, workspaceLoading]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return {
    analytics,
    isLoading,
    error,
    refreshAnalytics: loadAnalytics,
  };
}