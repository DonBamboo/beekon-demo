import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Globe,
  MoreHorizontal,
  Trash2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { CompetitorPerformance } from "@/types/database";
import { CompetitorWithStatus } from "@/hooks/useCompetitorsQuery";
import { CompetitorStatusIndicator } from "./CompetitorStatusIndicator";
import { useCompetitorStatus } from "@/hooks/useCompetitorStatus";
import {
  getCompetitorFixedColor,
  registerCompetitorsInFixedSlots,
  validateAllColorAssignments,
  autoFixColorConflicts,
} from "@/lib/color-utils";

interface MarketShareItem {
  name: string;
  normalizedValue: number;
  rawValue: number;
  competitorId?: string;
  mentions?: number;
  avgRank?: number;
  dataType: "market_share";
}

interface ShareOfVoiceItem {
  name: string;
  value: number;
  shareOfVoice?: number;
  competitorId?: string;
  mentions?: number;
  totalMentions?: number;
  totalAnalyses?: number;
  avgRank?: number;
  dataType?: "market_share" | "share_of_voice";
}

interface CompetitorsListProps {
  competitorsWithStatus: CompetitorWithStatus[];
  marketShareData: MarketShareItem[];
  shareOfVoiceData: ShareOfVoiceItem[];
  performance: CompetitorPerformance[];
  sortBy: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore";
  confirmDelete: (competitorId: string) => void;
  isDeleting?: boolean;
}

export default function CompetitorsList({
  competitorsWithStatus,
  marketShareData,
  shareOfVoiceData,
  performance,
  sortBy,
  confirmDelete,
  isDeleting = false,
}: CompetitorsListProps) {
  const { getCompetitorStatus } = useCompetitorStatus();

  // Validate color assignments to ensure consistency across all competitor components
  const colorValidation = validateAllColorAssignments();
  if (!colorValidation.isValid) {
    autoFixColorConflicts({ logResults: false });
  }

  // Register all competitors in fixed color slots for predictable coloring
  registerCompetitorsInFixedSlots(
    competitorsWithStatus.map((competitor) => ({
      id: competitor.id,
      competitorId: competitor.id,
      competitor_name: competitor.competitor_name || undefined,
      name: competitor.competitor_name || competitor.competitor_domain,
      competitor_domain: competitor.competitor_domain,
    }))
  );

  // Listen for competitor status update events for immediate UI refresh
  useEffect(() => {
    const handleCompetitorStatusUpdate = () => {
      // Component will re-render automatically when data changes through context updates
    };

    const handleCompetitorDeleted = (event: CustomEvent) => {
      const { competitorId } = event.detail;
      console.log(`🧹 Cleaning up UI state for deleted competitor: ${competitorId}`);

      // Force re-validation of color assignments to remove deleted competitor
      const colorValidation = validateAllColorAssignments();
      if (!colorValidation.isValid) {
        console.log(`🎨 Fixing color conflicts after competitor deletion`);
        autoFixColorConflicts({ logResults: true });
      }

      // Component will re-render automatically due to the cache invalidation in the mutation
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "competitorStatusUpdate",
        handleCompetitorStatusUpdate as EventListener
      );

      // Listen for competitor deletion events
      window.addEventListener(
        "competitorDeleted",
        handleCompetitorDeleted as EventListener
      );

      return () => {
        window.removeEventListener(
          "competitorStatusUpdate",
          handleCompetitorStatusUpdate as EventListener
        );
        window.removeEventListener(
          "competitorDeleted",
          handleCompetitorDeleted as EventListener
        );
      };
    }
    return undefined;
  }, []);

  // Helper function to get market share for a competitor (kept for potential future use)
  const getCompetitorMarketShare = (
    competitorId: string,
    competitorName: string
  ): number => {
    // First try to find by competitor ID
    const byId = marketShareData.find(
      (item) => item.competitorId === competitorId
    );
    if (byId) return byId.normalizedValue;

    // Fallback to matching by name (excluding "Your Brand")
    const byName = marketShareData.find(
      (item) =>
        item.name !== "Your Brand" &&
        (item.name === competitorName || item.name.includes(competitorName))
    );
    if (byName) return byName.normalizedValue;

    return 0; // Default if not found
  };

  // Suppress unused variable warning - function kept for potential future use
  void getCompetitorMarketShare;

  // Helper function to get share of voice for a competitor
  const getCompetitorShareOfVoice = (
    competitorId: string,
    competitorName: string
  ): number => {
    // First try to find by competitor ID
    const byId = shareOfVoiceData.find(
      (item) => item.competitorId === competitorId
    );
    if (byId) return byId.shareOfVoice || byId.value || 0;

    // Fallback to matching by name (excluding "Your Brand")
    const byName = shareOfVoiceData.find(
      (item) =>
        item.name !== "Your Brand" &&
        (item.name === competitorName || item.name.includes(competitorName))
    );
    if (byName) return byName.shareOfVoice || byName.value || 0;

    return 0; // Default if not found
  };

  // Helper function to get performance data for other metrics
  const getCompetitorPerformance = (
    competitorId: string
  ): CompetitorPerformance | undefined => {
    return performance.find((p) => p.competitorId === competitorId);
  };

  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return TrendingUp;
      case "down":
        return TrendingDown;
      default:
        return () => <div className="w-5 h-5" />; // Placeholder for stable
    }
  };

  const getTrendColor = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return "text-success";
      case "down":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  // Get real-time status for a competitor
  const getCompetitorRealtimeStatus = (competitorId: string) => {
    const statusData = getCompetitorStatus(competitorId);
    // Fallback to legacy status if no real-time status available
    return statusData || null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Tracked Competitors</CardTitle>
            <CardDescription>
              Competitors you're currently monitoring (sorted by{" "}
              {sortBy.replace(/([A-Z])/g, " $1").toLowerCase()})
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {competitorsWithStatus.length} competitor
            {competitorsWithStatus.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {competitorsWithStatus.map((competitor, index) => {
            // Get unified data sources
            const performanceData =
              getCompetitorPerformance(competitor.id) || competitor.performance;
            const shareOfVoiceValue = getCompetitorShareOfVoice(
              competitor.id,
              competitor.competitor_name || competitor.competitor_domain
            );
            const TrendIcon = performanceData
              ? getTrendIcon(performanceData.trend || "stable")
              : () => <div className="w-5 h-5" />;

            // PRIORITY: Get real-time status data first (always use if available)
            const realtimeStatus = getCompetitorRealtimeStatus(competitor.id);

            // Status determination with real-time priority
            let currentStatus: "pending" | "analyzing" | "completed" | "failed";
            if (realtimeStatus?.status) {
              // Use real-time status as primary source
              currentStatus = realtimeStatus.status;
            } else {
              // Fallback to cached competitor data
              if (competitor.analysisStatus === "analyzing") {
                currentStatus = "analyzing";
              } else if (competitor.analysisStatus === "completed") {
                currentStatus = "completed";
              } else {
                currentStatus = "pending";
              }
            }

            const isAnalyzed = currentStatus === "completed";

            // Debug logging for rank data
            if (
              performanceData?.averageRank !== null &&
              performanceData?.averageRank !== undefined
            ) {
              // Debug: competitor rank data available
            }

            // Generate robust key with fallback to prevent duplicates
            const uniqueKey =
              competitor.id ||
              competitor.competitor_domain ||
              `competitor-${index}`;

            // Add index parameter to the map callback

            return (
              <div
                key={`list-${uniqueKey}`}
                className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                  !isAnalyzed ? "opacity-75" : ""
                } ${
                  currentStatus === "analyzing"
                    ? "border-blue-200 bg-blue-50/30"
                    : ""
                } ${
                  currentStatus === "failed"
                    ? "border-red-200 bg-red-50/30"
                    : ""
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="relative flex items-center justify-center w-10 h-10 bg-muted rounded-lg">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    {/* Color indicator for competitor */}
                    <div
                      className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white shadow-sm"
                      style={{
                        backgroundColor: getCompetitorFixedColor({
                          id: competitor.id,
                          competitorId: competitor.id,
                          competitor_name:
                            competitor.competitor_name || undefined,
                          name:
                            competitor.competitor_name ||
                            competitor.competitor_domain,
                          competitor_domain: competitor.competitor_domain,
                        }),
                      }}
                      title={`Competitor color: ${
                        competitor.competitor_name ||
                        competitor.competitor_domain
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">
                        {competitor.competitor_name ||
                          competitor.competitor_domain}
                      </h4>
                      <CompetitorStatusIndicator
                        status={
                          currentStatus as
                            | "pending"
                            | "analyzing"
                            | "completed"
                            | "failed"
                        }
                        progress={realtimeStatus?.progress}
                        errorMessage={realtimeStatus?.errorMessage}
                        size="sm"
                        showProgress={currentStatus === "analyzing"}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {competitor.competitor_domain}
                    </p>
                    {/* Show analysis timing based on real-time status */}
                    {realtimeStatus?.completedAt && isAnalyzed && (
                      <p className="text-xs text-muted-foreground">
                        Analyzed:{" "}
                        {new Date(
                          realtimeStatus.completedAt
                        ).toLocaleDateString()}
                      </p>
                    )}
                    {realtimeStatus?.startedAt &&
                      currentStatus === "analyzing" && (
                        <p className="text-xs text-muted-foreground">
                          Started:{" "}
                          {new Date(
                            realtimeStatus.startedAt
                          ).toLocaleDateString()}
                        </p>
                      )}
                    {/* Fallback to legacy data if no real-time status */}
                    {!realtimeStatus && performanceData?.lastAnalyzed && (
                      <p className="text-xs text-muted-foreground">
                        Last analyzed:{" "}
                        {new Date(
                          performanceData.lastAnalyzed
                        ).toLocaleDateString()}
                      </p>
                    )}
                    {!isAnalyzed && (
                      <p className="text-xs text-muted-foreground">
                        Added:{" "}
                        {new Date(
                          competitor.created_at || Date.now()
                        ).toLocaleDateString()}
                      </p>
                    )}
                    {/* Progress bar for analyzing competitors */}
                    {currentStatus === "analyzing" &&
                      realtimeStatus?.progress !== undefined && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${Math.min(
                                    Math.max(realtimeStatus.progress, 0),
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-blue-600 font-medium min-w-0 whitespace-nowrap">
                              {realtimeStatus.progress}%
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">
                      Share of Voice
                    </div>
                    <div
                      className={`font-medium text-lg ${
                        !isAnalyzed ? "text-muted-foreground" : ""
                      }`}
                    >
                      {shareOfVoiceValue.toFixed(1)}%
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">
                      Avg Rank
                    </div>
                    <div
                      className={`font-medium text-lg ${
                        !isAnalyzed ? "text-muted-foreground" : ""
                      }`}
                    >
                      {performanceData?.averageRank !== null &&
                      performanceData?.averageRank !== undefined &&
                      performanceData.averageRank > 0
                        ? performanceData.averageRank.toFixed(1)
                        : "N/A"}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">
                      Mentions
                    </div>
                    <div
                      className={`font-medium text-lg ${
                        !isAnalyzed ? "text-muted-foreground" : ""
                      }`}
                    >
                      {performanceData?.mentionCount ?? 0}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">
                      Sentiment
                    </div>
                    <div
                      className={`font-medium text-lg ${
                        !isAnalyzed ? "text-muted-foreground" : ""
                      }`}
                    >
                      {performanceData?.sentimentScore?.toFixed(1) ?? 0}%
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Trend</div>
                    <div className="flex justify-center">
                      <TrendIcon
                        className={`h-5 w-5 ${
                          performanceData
                            ? getTrendColor(performanceData.trend || "stable")
                            : "text-muted-foreground"
                        }`}
                      />
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={isDeleting}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => confirmDelete(competitor.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {isDeleting ? "Removing..." : "Remove"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
