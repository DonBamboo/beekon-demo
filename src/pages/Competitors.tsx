import React, { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { ExportFormat } from "@/types/database";
import { useExportHandler } from "@/lib/export-utils";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  useAddCompetitor,
  useDeleteCompetitor,
} from "@/hooks/useCompetitorsQuery";
import { useOptimizedCompetitorsData } from "@/hooks/useOptimizedPageData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSelectedWebsite, usePageFilters } from "@/contexts/AppStateContext";
import CompetitorsHeader from "@/components/competitors/CompetitorsHeader";
import CompetitorsLoadingState from "@/components/competitors/CompetitorsLoadingState";
import { CompetitorsSkeleton } from "@/components/skeletons";
import WorkspaceRequiredState from "@/components/competitors/WorkspaceRequiredState";
import CompetitorsErrorState from "@/components/competitors/CompetitorsErrorState";
import ShareOfVoiceChart from "@/components/competitors/ShareOfVoiceChart";
import CompetitorsList from "@/components/competitors/CompetitorsList";
import CompetitiveGapChart from "@/components/competitors/CompetitiveGapChart";
import TimeSeriesChart from "@/components/competitors/TimeSeriesChart";
import CompetitorsEmptyState from "@/components/competitors/CompetitorsEmptyState";
import NoAnalyticsState from "@/components/competitors/NoAnalyticsState";
import CompetitorInsights from "@/components/competitors/CompetitorInsights";
import { sendN8nWebhook } from "@/lib/http-request";
import { addProtocol } from "@/lib/utils";
import { getCompetitorColor, getYourBrandColor } from "@/lib/color-utils";

interface CompetitorsProps {
  isVisible?: boolean;
}

export default function Competitors({ isVisible = true }: CompetitorsProps) {
  const {
    currentWorkspace,
    websites,
    loading: workspaceLoading,
  } = useWorkspace();
  const { toast } = useToast();

  // State for UI controls
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [isWebhookProcessing, setIsWebhookProcessing] = useState(false);
  
  // Use global website selection state
  const { selectedWebsiteId, setSelectedWebsite, websites: globalWebsites } = useSelectedWebsite();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [competitorToDelete, setCompetitorToDelete] = useState<string | null>(
    null
  );
  // Use global filter state from AppStateContext
  const { filters, setFilters } = usePageFilters("competitors");
  const [isExporting, setIsExporting] = useState(false);
  const { handleExport } = useExportHandler();

  // Get first website ID for competitor tracking (fallback) - use global websites
  const websiteId = globalWebsites?.[0]?.id;

  // Calculate date range using global filters (memoized to prevent infinite re-renders)
  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    const days = filters.dateFilter === "7d" ? 7 : filters.dateFilter === "30d" ? 30 : 90;
    start.setDate(end.getDate() - days);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }, [filters.dateFilter]);

  // Use optimized competitors data loading with instant cache rendering
  const {
    competitors,
    performance,
    analytics, 
    topics,
    isLoading,
    error,
    refresh,
    hasCachedData,
  } = useOptimizedCompetitorsData();
  
  // Derive additional data for backward compatibility
  const competitorsWithStatus = competitors; // Status already included
  const hasData = !!(competitors.length > 0 || analytics);
  const isRefreshing = isLoading && hasCachedData;
  const isInitialLoad = isLoading && !hasCachedData;
  const refetch = refresh;
  const targetWebsiteId = selectedWebsiteId;

  // Mutations for competitor operations
  const addCompetitorMutation = useAddCompetitor();
  const deleteCompetitorMutation = useDeleteCompetitor();

  // Compatibility functions for existing code
  const refreshData = refetch || (() => {});
  const clearError = () => {}; // Errors clear automatically in React Query

  // Prepare chart data from analytics (memoized to prevent unnecessary recalculations)
  // Market Share Data (normalized percentages)
  const marketShareChartData = useMemo(() => {
    return (
      analytics?.marketShareData.map((item, index) => ({
        name: item.name,
        value: item.normalizedValue, // Use normalized value for display
        normalizedValue: item.normalizedValue,
        rawValue: item.rawValue,
        mentions: item.mentions,
        avgRank: item.avgRank,
        competitorId: item.competitorId,
        dataType: item.dataType,
        fill:
          item.name === "Your Brand"
            ? getYourBrandColor()
            : getCompetitorColor(item.competitorId, item.name, index),
      })) || []
    );
  }, [analytics?.marketShareData]);

  // Share of Voice Data (raw percentages)
  const shareOfVoiceChartData = useMemo(() => {
    return (
      analytics?.shareOfVoiceData.map((item, index) => ({
        name: item.name,
        value: item.shareOfVoice, // Use raw share of voice percentage
        shareOfVoice: item.shareOfVoice,
        totalMentions: item.totalMentions,
        totalAnalyses: item.totalAnalyses,
        avgRank: item.avgRank,
        competitorId: item.competitorId,
        dataType: item.dataType,
        fill:
          item.name === "Your Brand"
            ? getYourBrandColor()
            : getCompetitorColor(item.competitorId, item.name, index),
      })) || []
    );
  }, [analytics?.shareOfVoiceData]);

  // Use gapAnalysis as the single source of truth for competitive gap data
  const competitiveGapData = useMemo(() => {
    return (
      analytics?.gapAnalysis.map((gap) => {
        const data: Record<string, number | string> = {
          topic: gap.topicName,
          yourBrand: gap.yourBrandScore,
        };
        gap.competitorData.forEach((comp, index) => {
          data[`competitor${index + 1}`] = comp.score;
          data[`competitor${index + 1}_name`] = comp.competitor_name;
        });
        return data;
      }) || []
    );
  }, [analytics?.gapAnalysis]);

  // Competitor insights refresh handler
  const handleInsightsRefresh = () => {
    refreshData();
  };

  const handleAddCompetitor = async () => {
    if (!globalWebsites || globalWebsites.length === 0) {
      toast({
        title: "Error",
        description: "No websites available. Please add a website first.",
        variant: "destructive",
      });
      return;
    }

    if (!competitorDomain.trim()) {
      toast({
        title: "Error",
        description: "Please enter a competitor domain",
        variant: "destructive",
      });
      return;
    }

    if (!selectedWebsiteId) {
      toast({
        title: "Error",
        description: "Please select a website for competitor tracking",
        variant: "destructive",
      });
      return;
    }

    // Validate that the selected website exists and is available
    const selectedWebsite = globalWebsites?.find((w) => w.id === selectedWebsiteId);
    if (!selectedWebsite) {
      toast({
        title: "Error",
        description: "Selected website is no longer available",
        variant: "destructive",
      });
      return;
    }

    // Optionally warn if website is inactive (but allow it)
    if (!selectedWebsite.is_active) {
      toast({
        title: "Warning",
        description: "You're adding a competitor to an inactive website",
        variant: "default",
      });
    }

    // Validate domain format
    const domainRegex =
      /^(https?:\/\/)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(\/.*)?$/i;

    if (!domainRegex.test(competitorDomain)) {
      toast({
        title: "Error",
        description: "Please enter a valid domain name",
        variant: "destructive",
      });
      return;
    }

    try {
      // Step 1: Add competitor to database using React Query mutation
      const { id } = await addCompetitorMutation.mutateAsync({
        websiteId: selectedWebsiteId,
        domain: addProtocol(competitorDomain),
        name: competitorName || undefined,
      });

      // Immediately refresh competitors data to show the new competitor in UI
      refreshData();

      // Step 2: Send webhook to N8N for analysis processing
      setIsWebhookProcessing(true);
      const response = await sendN8nWebhook("webhook/competitors-onboarding", {
        website_id: selectedWebsite.id,
        website_name: selectedWebsite.display_name,
        website_url: selectedWebsite.domain,
        competitors_url: addProtocol(competitorDomain),
        display_name: competitorName,
        workspace_id: currentWorkspace?.id,
        competitor_id: id,
      });

      if (!response.success) {
        toast({
          title: "Warning",
          description:
            "Competitor added but analysis failed to start. Analysis can be retried later.",
          variant: "default",
        });
      } else {
        toast({
          title: "Analysis started!",
          description: `Competitor analysis is now processing for ${
            competitorName || competitorDomain
          }.`,
        });
      }

      setCompetitorName("");
      setCompetitorDomain("");
      setIsAddDialogOpen(false);
    } catch (error) {
      // Failed to add competitor
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to add competitor",
        variant: "destructive",
      });
    } finally {
      setIsWebhookProcessing(false);
    }
  };

  const handleDeleteCompetitor = async (competitorId: string) => {
    try {
      await deleteCompetitorMutation.mutateAsync({
        competitorId,
        websiteId: selectedWebsiteId || "",
      });
      setShowDeleteConfirm(false);
      setCompetitorToDelete(null);
    } catch (error) {
      // Error is already handled by the mutation hook
    }
  };

  const confirmDelete = (competitorId: string) => {
    setCompetitorToDelete(competitorId);
    setShowDeleteConfirm(true);
  };

  const handleExportData = async (format: ExportFormat) => {
    if (!selectedWebsiteId || !hasData) {
      toast({
        title: "No Data to Export",
        description: "Please ensure you have competitor data before exporting.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    
    try {
      // Import competitorService dynamically
      const { competitorService } = await import("@/services/competitorService");
      
      // Export with comprehensive options using the competitorService
      const exportDateRange = (() => {
        const end = new Date();
        const start = new Date();
        switch (filters.dateFilter) {
          case "7d":
            start.setDate(end.getDate() - 7);
            break;
          case "30d":
            start.setDate(end.getDate() - 30);
            break;
          case "90d":
            start.setDate(end.getDate() - 90);
            break;
        }
        return { start: start.toISOString(), end: end.toISOString() };
      })();

      const blob = await competitorService.exportCompetitorData(
        selectedWebsiteId,
        format as "csv" | "json" | "pdf",
        exportDateRange
      );

      await handleExport(
        () => Promise.resolve(blob),
        {
          filename: `competitor-analysis-${new Date().toISOString().split('T')[0]}`,
          format,
          includeTimestamp: true,
          metadata: {
            competitorCount: competitors?.length || 0,
            exportType: "competitor_analysis",
            dateFilter: filters.dateFilter,
            sortBy: filters.sortBy,
          },
        }
      );
    } catch (error) {
      // Export failed
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred during export.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };


  // Show loading state during workspace loading or initial competitors load (no cache)
  if (workspaceLoading || isInitialLoad) {
    return <CompetitorsSkeleton />;
  }

  const workspaceRequiredState = (
    <WorkspaceRequiredState
      currentWorkspace={currentWorkspace}
      websiteId={websiteId}
    />
  );

  if (!currentWorkspace || !websiteId) {
    return workspaceRequiredState;
  }

  return (
    <>
      <div className="space-y-6">
        <CompetitorsHeader
          totalCompetitors={competitorsWithStatus.length}
          activeCompetitors={competitorsWithStatus.filter(c => c.analysisStatus === 'completed').length}
          dateFilter={filters.dateFilter}
          sortBy={filters.sortBy}
          isRefreshing={isRefreshing}
          hasData={hasData}
          isAddDialogOpen={isAddDialogOpen}
          competitorDomain={competitorDomain}
          competitorName={competitorName}
          isAdding={addCompetitorMutation.isPending || isWebhookProcessing}
          websitesLoading={workspaceLoading || isLoading}
          isExporting={isExporting}
          competitorsData={competitors}
          setDateFilter={(value) => setFilters({ ...filters, dateFilter: value })}
          setSortBy={(value) => setFilters({ ...filters, sortBy: value })}
          setIsAddDialogOpen={setIsAddDialogOpen}
          setCompetitorDomain={setCompetitorDomain}
          setCompetitorName={setCompetitorName}
          refreshData={refreshData}
          handleAddCompetitor={handleAddCompetitor}
          handleExportData={handleExportData}
        />

        {/* Error State */}
        {error && (
          <CompetitorsErrorState
            error={error}
            isRefreshing={isRefreshing}
            refreshData={refreshData}
            clearError={clearError}
          />
        )}

        {/* Share of Voice Chart */}
        <ShareOfVoiceChart
          data={shareOfVoiceChartData}
          dateFilter={filters.dateFilter}
          chartType="share_of_voice"
        />

        {/* Competitors List */}
        <CompetitorsList
          competitorsWithStatus={competitorsWithStatus}
          marketShareData={analytics?.marketShareData || []}
          performance={performance}
          sortBy={filters.sortBy}
          confirmDelete={confirmDelete}
          isDeleting={deleteCompetitorMutation.isPending}
        />

        {/* Competitive Gap Analysis */}
        <CompetitiveGapChart
          gapAnalysis={analytics?.gapAnalysis || []}
          analytics={analytics}
          dateFilter={filters.dateFilter}
        />

        {/* Competitive Intelligence */}
        <CompetitorInsights
          insights={analytics?.insights || []}
          isLoading={isLoading}
          onRefresh={handleInsightsRefresh}
        />

        {/* Time Series Chart */}
        <TimeSeriesChart data={analytics?.timeSeriesData || []} />

        {/* Main Empty State */}
        {!hasData && !isLoading && (
          <CompetitorsEmptyState setIsAddDialogOpen={setIsAddDialogOpen} />
        )}

        {/* Empty Charts State */}
        {hasData && shareOfVoiceChartData.length === 0 && (
          <NoAnalyticsState
            refreshData={refreshData}
            isRefreshing={isRefreshing}
          />
        )}
      </div>

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setCompetitorToDelete(null);
        }}
        onConfirm={() =>
          competitorToDelete
            ? handleDeleteCompetitor(competitorToDelete)
            : undefined
        }
        title="Remove Competitor"
        description="Are you sure you want to remove this competitor from tracking? This action cannot be undone and will permanently delete all associated competitor analysis data."
        confirmText="Remove Competitor"
        variant="destructive"
      />
    </>
  );
}
