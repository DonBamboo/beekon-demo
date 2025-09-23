import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { ExportFormat } from "@/types/database";
import { useExportHandler } from "@/lib/export-utils";
import type { CompetitorWithStatus } from "@/hooks/useCompetitorsQuery";
import { isCompetitorActive } from "@/utils/competitorStatusUtils";
import type { CompetitorStatusValue } from "@/types/database";
import type {
  CompetitiveGapAnalysis,
  CompetitorAnalytics,
} from "@/services/competitorService";

// Local interfaces since they're not exported

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  useAddCompetitor,
  useDeleteCompetitor,
} from "@/hooks/useCompetitorsQuery";
import { useOptimizedCompetitorsData } from "@/hooks/useOptimizedPageData";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSelectedWebsite, usePageFilters } from "@/hooks/appStateHooks";
import { useCompetitorStatus } from "@/hooks/useCompetitorStatus";
import type { CompetitorFilters } from "@/contexts/AppStateContext";
import CompetitorsHeader from "@/components/competitors/CompetitorsHeader";
import { CompetitorsSkeleton } from "@/components/skeletons";
import WorkspaceRequiredState from "@/components/competitors/WorkspaceRequiredState";
import CompetitorsErrorState from "@/components/competitors/CompetitorsErrorState";
import ShareOfVoiceChart from "@/components/competitors/ShareOfVoiceChart";
import CompetitorsList from "@/components/competitors/CompetitorsList";
import CompetitiveGapChart from "@/components/competitors/CompetitiveGapChart";
import TimeSeriesChart from "@/components/competitors/TimeSeriesChart";
import CompetitorsEmptyState from "@/components/competitors/CompetitorsEmptyState";
import NoAnalyticsState from "@/components/competitors/NoAnalyticsState";
import { sanitizeChartNumber } from "@/utils/chartDataValidation";
import CompetitorInsights from "@/components/competitors/CompetitorInsights";
import { sendN8nWebhook } from "@/lib/http-request";
import { addProtocol } from "@/lib/utils";
import {
  getCompetitorFixedColor,
  getYourBrandColor,
  registerCompetitorsInFixedSlots,
} from "@/lib/color-utils";

export default function Competitors() {
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const { toast } = useToast();

  // Initialize real-time competitor status monitoring
  useCompetitorStatus();

  // State for UI controls
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [competitorName, setCompetitorName] = useState("");
  const [isWebhookProcessing, setIsWebhookProcessing] = useState(false);

  // Use global website selection state
  const { selectedWebsiteId, websites: globalWebsites } = useSelectedWebsite();
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

  // Use optimized competitors data loading with instant cache rendering
  const {
    competitors,
    performance,
    analytics,
    isLoading,
    error,
    refresh,
    hasCachedData,
    hasSyncCache,
  } = useOptimizedCompetitorsData();

  // Prepare chart data from analytics (memoized to prevent unnecessary recalculations)
  // Market Share Data is handled by ShareOfVoiceChart component directly
  // Share of Voice Data (raw percentages)
  const shareOfVoiceChartData = useMemo(() => {
    const rawData =
      (analytics?.shareOfVoiceData as Record<string, unknown>[]) || [];

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "🎯 [DEBUG] Competitors.tsx shareOfVoiceChartData processing:",
        {
          rawDataCount: rawData.length,
          hasYourBrand: rawData.some((item) => item.name === "Your Brand"),
          rawDataEntries: rawData.map((item) => ({
            name: item.name,
            shareOfVoice: item.shareOfVoice,
            totalMentions: item.totalMentions,
            dataType: item.dataType,
            allFields: Object.keys(item),
          })),
          analyticsObject: analytics ? "exists" : "missing",
          fullAnalyticsStructure: analytics
            ? {
                hasShareOfVoiceData: !!analytics.shareOfVoiceData,
                shareOfVoiceDataType: Array.isArray(analytics.shareOfVoiceData)
                  ? "array"
                  : typeof analytics.shareOfVoiceData,
                shareOfVoiceDataLength: Array.isArray(
                  analytics.shareOfVoiceData
                )
                  ? analytics.shareOfVoiceData.length
                  : "not-array",
                analyticsKeys: Object.keys(analytics),
              }
            : "analytics-missing",
        }
      );
    }

    // Validate that "Your Brand" data is present (should always be provided by service layer)
    const hasYourBrand = rawData.some((item) => item.name === "Your Brand");

    if (!hasYourBrand) {
      // This indicates a service layer issue that needs investigation
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "❌ [DATA ERROR] Your Brand data missing from service layer",
          {
            receivedDataCount: rawData.length,
            receivedItems: rawData.map((item) => ({
              name: item.name,
              dataType: item.dataType,
            })),
            analyticsStructure: analytics
              ? {
                  hasShareOfVoiceData: !!analytics.shareOfVoiceData,
                  shareOfVoiceDataType: Array.isArray(
                    analytics.shareOfVoiceData
                  )
                    ? "array"
                    : typeof analytics.shareOfVoiceData,
                  dataLength: Array.isArray(analytics.shareOfVoiceData)
                    ? analytics.shareOfVoiceData.length
                    : "not-array",
                }
              : "analytics-missing",
            criticalIssue:
              "Service layer should always provide Your Brand data",
            requiredAction:
              "Check competitorService.getCompetitiveAnalysis() implementation",
          }
        );
      }

      // Don't add fallback - this should be fixed in the service layer
      // Using empty array to prevent chart errors while maintaining data integrity
      return [];
    }

    const processedData = [...rawData];

    // Filter out "Your Brand" for competitor processing and register all competitors in fixed slots
    const competitorData = processedData.filter(
      (item) => item.name !== "Your Brand"
    );
    registerCompetitorsInFixedSlots(
      competitorData.map((item) => ({
        competitorId: item.competitorId as string,
        name: item.name as string,
      }))
    );

    return processedData.map((item: Record<string, unknown>) => {
      // Sanitize all numeric values to prevent NaN propagation to ShareOfVoiceChart
      const sanitizedShareOfVoice = sanitizeChartNumber(item.shareOfVoice, 0);
      const sanitizedTotalMentions = sanitizeChartNumber(item.totalMentions, 0);
      const sanitizedTotalAnalyses = sanitizeChartNumber(item.totalAnalyses, 0);
      const sanitizedAvgRank = sanitizeChartNumber(item.avgRank, 0);

      // Log validation issues in development (specifically for 30d filter debugging)
      if (process.env.NODE_ENV !== "production") {
        const hasInvalidData = [
          item.shareOfVoice !== sanitizedShareOfVoice,
          item.totalMentions !== sanitizedTotalMentions,
          item.totalAnalyses !== sanitizedTotalAnalyses,
          item.avgRank !== sanitizedAvgRank,
        ].some(Boolean);

        if (hasInvalidData) {
          console.warn("⚠️ Invalid data detected in shareOfVoiceChartData", {
            competitorName: item.name,
            dataIssues: {
              shareOfVoiceFixed: item.shareOfVoice !== sanitizedShareOfVoice,
              totalMentionsFixed: item.totalMentions !== sanitizedTotalMentions,
              totalAnalysesFixed: item.totalAnalyses !== sanitizedTotalAnalyses,
              avgRankFixed: item.avgRank !== sanitizedAvgRank,
            },
            originalData: {
              shareOfVoice: item.shareOfVoice,
              totalMentions: item.totalMentions,
              totalAnalyses: item.totalAnalyses,
              avgRank: item.avgRank,
            },
            sanitizedData: {
              shareOfVoice: sanitizedShareOfVoice,
              totalMentions: sanitizedTotalMentions,
              totalAnalyses: sanitizedTotalAnalyses,
              avgRank: sanitizedAvgRank,
            },
            possibleCauses: [
              "Database returned NaN, null, or undefined values",
              "Data transformation errors in service layer",
              "Network issues during data fetch",
            ],
            impact:
              "Charts will render with fallback values to prevent crashes",
          });
        }
      }

      return {
        name: item.name as string,
        value: sanitizedShareOfVoice,
        shareOfVoice: sanitizedShareOfVoice,
        totalMentions: sanitizedTotalMentions,
        totalAnalyses: sanitizedTotalAnalyses,
        avgRank: sanitizedAvgRank,
        competitorId: item.competitorId as string,
        dataType:
          (item.dataType as string) === "market_share"
            ? ("market_share" as const)
            : ("share_of_voice" as const),
        fill:
          item.name === "Your Brand"
            ? getYourBrandColor()
            : getCompetitorFixedColor({
                competitorId: item.competitorId as string,
                name: item.name as string,
              }),
      };
    });
  }, [analytics]);

  // Derive additional data for backward compatibility
  const competitorsWithStatus = competitors; // Status already included
  const hasData = competitors.length > 0 || shareOfVoiceChartData.length > 1; // More than just "Your Brand"
  const isRefreshing = isLoading && hasCachedData;
  const refetch = refresh;

  // Mutations for competitor operations
  const addCompetitorMutation = useAddCompetitor();
  const deleteCompetitorMutation = useDeleteCompetitor();

  // Compatibility functions for existing code
  const refreshData = refetch || (() => {});
  const clearError = () => {}; // Errors clear automatically in React Query

  // Gap analysis data is handled by CompetitiveGapChart component directly

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
    const selectedWebsite = globalWebsites?.find(
      (w) => w.id === selectedWebsiteId
    );
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
      const { competitorService } = await import(
        "@/services/competitorService"
      );

      // Export with comprehensive options using the competitorService
      const exportDateRange = (() => {
        const end = new Date();
        const start = new Date();
        switch ((filters as CompetitorFilters).dateFilter) {
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

      await handleExport(() => Promise.resolve(blob), {
        filename: `competitor-analysis-${
          new Date().toISOString().split("T")[0]
        }`,
        format,
        includeTimestamp: true,
        metadata: {
          competitorCount: competitors?.length || 0,
          exportType: "competitor_analysis",
          dateFilter: (filters as CompetitorFilters).dateFilter,
          sortBy: (filters as CompetitorFilters).sortBy,
        },
      });
    } catch (error) {
      // Export failed
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred during export.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Show skeleton immediately unless we have synchronous cache data
  // This eliminates empty state flash by showing skeleton first
  const shouldShowSkeleton = workspaceLoading || (isLoading && !hasSyncCache());

  if (shouldShowSkeleton) {
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
          activeCompetitors={
            competitorsWithStatus.filter((c) =>
              isCompetitorActive(c.analysisStatus as CompetitorStatusValue)
            ).length
          }
          dateFilter={(filters as CompetitorFilters).dateFilter}
          sortBy={(filters as CompetitorFilters).sortBy}
          isRefreshing={isRefreshing}
          hasData={hasData}
          isAddDialogOpen={isAddDialogOpen}
          competitorDomain={competitorDomain}
          competitorName={competitorName}
          isAdding={addCompetitorMutation.isPending || isWebhookProcessing}
          websitesLoading={workspaceLoading || isLoading}
          isExporting={isExporting}
          competitorsData={competitors}
          setDateFilter={(value) => {
            console.log("🗓️ Date filter changed:", {
              from: (filters as CompetitorFilters).dateFilter,
              to: value,
              timestamp: new Date().toISOString(),
            });
            setFilters({
              ...(filters as CompetitorFilters),
              dateFilter: value,
            });
          }}
          setSortBy={(value) =>
            setFilters({ ...(filters as CompetitorFilters), sortBy: value })
          }
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
          timeSeriesData={
            Array.isArray(analytics?.timeSeriesData)
              ? (analytics.timeSeriesData as Record<string, unknown>[]).map(
                  (item) => ({
                    date: item.date as string,
                    competitors: Array.isArray(item.competitors)
                      ? (
                          item.competitors as Array<Record<string, unknown>>
                        ).map((comp) => ({
                          competitorId: (comp.competitorId as string) || "",
                          name: (comp.name as string) || "",
                          shareOfVoice: (comp.shareOfVoice as number) || 0,
                          averageRank: (comp.averageRank as number) || 0,
                          mentionCount: (comp.mentionCount as number) || 0,
                          sentimentScore: (comp.sentimentScore as number) || 0,
                        }))
                      : [],
                  })
                )
              : []
          }
          dateFilter={(filters as CompetitorFilters).dateFilter}
          chartType="share_of_voice"
        />

        {/* Competitors List */}
        <CompetitorsList
          competitorsWithStatus={
            competitorsWithStatus as unknown as CompetitorWithStatus[]
          }
          marketShareData={
            Array.isArray(analytics?.marketShareData)
              ? analytics.marketShareData.map((item) => ({
                  name: (item as Record<string, unknown>).name as string,
                  normalizedValue: (item as Record<string, unknown>)
                    .normalizedValue as number,
                  rawValue: (item as Record<string, unknown>)
                    .rawValue as number,
                  competitorId: (item as Record<string, unknown>)
                    .competitorId as string,
                  mentions: (item as Record<string, unknown>)
                    .mentions as number,
                  dataType: "market_share" as const,
                }))
              : []
          }
          shareOfVoiceData={shareOfVoiceChartData}
          performance={
            Array.isArray(performance)
              ? (performance as unknown as Record<string, unknown>[]).map(
                  (p) => ({
                    // Database fields (required by CompetitorPerformance)
                    visibility_score: (p.visibilityScore as number) || 0,
                    avg_rank: (p.averageRank as number) || 0,
                    total_mentions: (p.mentionCount as number) || 0,
                    sentiment_score: (p.sentimentScore as number) || 0,
                    // UI fields (optional in CompetitorPerformance)
                    competitorId: (p.competitorId as string) || "",
                    domain: (p.domain as string) || "",
                    name: (p.name as string) || "",
                    shareOfVoice: (p.shareOfVoice as number) || 0,
                    averageRank: (p.averageRank as number) || 0,
                    mentionCount: (p.mentionCount as number) || 0,
                    sentimentScore: (p.sentimentScore as number) || 0,
                    visibilityScore: (p.visibilityScore as number) || 0,
                    trend:
                      (p.trend as string) === "up" ||
                      (p.trend as string) === "down"
                        ? (p.trend as "up" | "down")
                        : ("stable" as const),
                    trendPercentage: (p.trendPercentage as number) || 0,
                    lastAnalyzed:
                      (p.lastAnalyzed as string) || new Date().toISOString(),
                    isActive: (p.isActive as boolean) || true,
                  })
                )
              : []
          }
          sortBy={(filters as CompetitorFilters).sortBy}
          confirmDelete={confirmDelete}
          isDeleting={deleteCompetitorMutation.isPending}
        />

        {/* Competitive Gap Analysis */}
        <CompetitiveGapChart
          gapAnalysis={
            (analytics?.gapAnalysis || []) as CompetitiveGapAnalysis[]
          }
          analytics={analytics as CompetitorAnalytics | null}
          dateFilter={(filters as CompetitorFilters).dateFilter}
        />

        {/* Competitive Intelligence */}
        <CompetitorInsights
          insights={(
            (analytics?.insights as unknown as Record<string, unknown>[]) || []
          ).map((insight) => ({
            type:
              (insight.type as string) === "opportunity" ||
              (insight.type as string) === "threat"
                ? (insight.type as "opportunity" | "threat")
                : ("neutral" as const),
            title: insight.title as string,
            description: insight.description as string,
            impact:
              (insight.impact as string) === "high" ||
              (insight.impact as string) === "medium" ||
              (insight.impact as string) === "low"
                ? (insight.impact as "high" | "medium" | "low")
                : ("medium" as const),
            recommendations: insight.recommendations as string[],
          }))}
          isLoading={isLoading}
          onRefresh={handleInsightsRefresh}
        />

        {/* Time Series Chart */}
        <TimeSeriesChart
          data={
            Array.isArray(analytics?.timeSeriesData)
              ? (analytics.timeSeriesData as Record<string, unknown>[]).map(
                  (item) => ({
                    date: item.date as string,
                    competitors: Array.isArray(item.competitors)
                      ? (
                          item.competitors as Array<Record<string, unknown>>
                        ).map((comp) => ({
                          competitorId: (comp.competitorId as string) || "",
                          name: (comp.name as string) || "",
                          shareOfVoice: (comp.shareOfVoice as number) || 0,
                          averageRank: (comp.averageRank as number) || 0,
                          mentionCount: (comp.mentionCount as number) || 0,
                          sentimentScore: (comp.sentimentScore as number) || 0,
                        }))
                      : [],
                  })
                )
              : []
          }
        />

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
