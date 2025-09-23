import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  Info,
  TrendingUp,
  Award,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { useMemo } from "react";
import {
  getCompetitorFixedColor,
  getCompetitorFixedColorInfo,
  getYourBrandColor,
  registerCompetitorsInFixedSlots,
  validateAllColorAssignments,
  autoFixColorConflicts,
} from "@/lib/color-utils";
import { ColorLegend } from "@/components/ui/color-indicator";
import {
  validateAndSanitizeChartData,
  sanitizeChartNumber,
} from "@/utils/chartDataValidation";
import { ChartErrorFallback, ErrorBoundary } from "@/components/ErrorBoundary";
import { CompetitorTimeSeriesData } from "@/services/competitorService";

interface ShareOfVoiceData {
  name: string;
  value: number;
  fill: string;
  competitorId?: string;
  mentions?: number;
  avgRank?: number;
  dataType?: "market_share" | "share_of_voice";
  // For market share data
  normalizedValue?: number;
  rawValue?: number;
  // For share of voice data
  shareOfVoice?: number;
  totalMentions?: number;
  totalAnalyses?: number;
  // For grouped data
  isOthersGroup?: boolean;
  competitors?: ShareOfVoiceData[];
  // For color consistency
  colorIndex?: number; // Pre-computed color index for legend generation
}

interface ShareOfVoiceChartProps {
  data: ShareOfVoiceData[];
  timeSeriesData?: CompetitorTimeSeriesData[];
  dateFilter: "7d" | "30d" | "90d";
  chartType?: "market_share" | "share_of_voice"; // New prop to specify chart type
}

export default function ShareOfVoiceChart({
  data,
  timeSeriesData,
  dateFilter,
  chartType = "share_of_voice", // Default to share of voice for backward compatibility
}: ShareOfVoiceChartProps) {
  // Enhanced data processing with validation
  const chartData = useMemo(() => {
    // Validate color assignments and fix conflicts if needed
    const colorValidation = validateAllColorAssignments();
    if (!colorValidation.isValid) {
      autoFixColorConflicts({ logResults: false });
    }

    // Filter out "Your Brand" for competitor processing
    const competitorData = data.filter((item) => item.name !== "Your Brand");

    // Register all competitors in fixed color slots for predictable color assignment
    registerCompetitorsInFixedSlots(
      competitorData.map((item) => ({
        competitorId: item.competitorId,
        name: item.name,
      }))
    );

    // Comprehensive data validation and sanitization
    const validatedData = data.map((item) => {
      // Robust sanitization to prevent NaN, null, undefined, or Infinity from reaching recharts
      const sanitizedValue =
        typeof item.value === "number" &&
        !isNaN(item.value) &&
        isFinite(item.value)
          ? Math.max(0, item.value)
          : 0;
      const sanitizedMentions =
        typeof item.mentions === "number" &&
        !isNaN(item.mentions) &&
        isFinite(item.mentions)
          ? Math.max(0, item.mentions)
          : 0;
      const sanitizedTotalMentions =
        typeof item.totalMentions === "number" &&
        !isNaN(item.totalMentions) &&
        isFinite(item.totalMentions)
          ? Math.max(0, item.totalMentions)
          : 0;
      const sanitizedAvgRank =
        typeof item.avgRank === "number" &&
        !isNaN(item.avgRank) &&
        isFinite(item.avgRank)
          ? Math.max(0, item.avgRank)
          : undefined;
      const sanitizedShareOfVoice =
        typeof item.shareOfVoice === "number" &&
        !isNaN(item.shareOfVoice) &&
        isFinite(item.shareOfVoice)
          ? Math.max(0, item.shareOfVoice)
          : sanitizedValue;
      const sanitizedTotalAnalyses =
        typeof item.totalAnalyses === "number" &&
        !isNaN(item.totalAnalyses) &&
        isFinite(item.totalAnalyses)
          ? Math.max(0, item.totalAnalyses)
          : 0;

      let fillColor: string;
      let colorIndex: number | undefined;

      if (item.name === "Your Brand") {
        fillColor = getYourBrandColor();
        // colorIndex remains undefined for "Your Brand"
      } else {
        // Get fixed color slot for predictable competitor coloring
        const colorInfo = getCompetitorFixedColorInfo({
          competitorId: item.competitorId,
          name: item.name,
        });

        // Use fixed color slot information
        colorIndex = colorInfo.colorSlot;
        fillColor = getCompetitorFixedColor({
          competitorId: item.competitorId,
          name: item.name,
        });
      }

      return {
        ...item,
        value: sanitizedValue,
        mentions: sanitizedMentions,
        totalMentions: sanitizedTotalMentions,
        avgRank: sanitizedAvgRank,
        shareOfVoice: sanitizedShareOfVoice,
        totalAnalyses: sanitizedTotalAnalyses,
        fill: fillColor,
        colorIndex, // Store pre-computed color index
      };
    });

    // Check for total percentage validation
    const totalPercentage = validatedData.reduce(
      (sum, item) => sum + item.value,
      0
    );
    if (totalPercentage > 105) {
      // Allow 5% tolerance for rounding
      // Share of Voice total exceeds 100% - data validation warning
    }

    return validatedData;
  }, [data]);

  // Process time-series data for stacked area chart
  const stackedAreaData = useMemo(() => {
    console.log("ShareOfVoiceChart timeSeriesData received:", timeSeriesData?.length || 0, timeSeriesData);
    if (!timeSeriesData || timeSeriesData.length === 0) {
      console.log("ShareOfVoiceChart: timeSeriesData is empty, returning empty stackedAreaData");
      return [];
    }

    // Validate color assignments and fix conflicts if needed
    const colorValidation = validateAllColorAssignments();
    if (!colorValidation.isValid) {
      autoFixColorConflicts({ logResults: false });
    }

    // Get all unique competitors from the time series data
    const allCompetitors = new Set<string>();
    timeSeriesData.forEach((point) => {
      point.competitors?.forEach((comp) => {
        allCompetitors.add(comp.competitorId);
      });
    });

    // Register all competitors in fixed color slots for predictable coloring
    const competitorsList = Array.from(allCompetitors).map((competitorId) => {
      // Find the competitor name from any data point
      const competitorData = timeSeriesData
        .flatMap((point) => point.competitors || [])
        .find((comp) => comp.competitorId === competitorId);

      return {
        competitorId,
        name: competitorData?.name || competitorId,
      };
    });

    registerCompetitorsInFixedSlots(competitorsList);

    // Transform time-series data into format suitable for stacked area chart
    return timeSeriesData.map((point) => {
      const transformedPoint: any = {
        date: point.date,
        dateFormatted: new Date(point.date).toLocaleDateString(),
      };

      // Add each competitor's share of voice for this time point
      competitorsList.forEach((competitor) => {
        const competitorData = point.competitors?.find(
          (comp) => comp.competitorId === competitor.competitorId
        );

        // Sanitize the share of voice value
        const shareOfVoice = sanitizeChartNumber(
          competitorData?.shareOfVoice || 0
        );
        transformedPoint[competitor.name] = shareOfVoice;
      });

      return transformedPoint;
    });
  }, [timeSeriesData]);

  // Get competitors list for stacked area chart
  const competitorsList = useMemo(() => {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return [];
    }

    const allCompetitors = new Set<string>();
    timeSeriesData.forEach((point) => {
      point.competitors?.forEach((comp) => {
        allCompetitors.add(comp.competitorId);
      });
    });

    return Array.from(allCompetitors).map((competitorId) => {
      const competitorData = timeSeriesData
        .flatMap((point) => point.competitors || [])
        .find((comp) => comp.competitorId === competitorId);

      return {
        competitorId,
        name: competitorData?.name || competitorId,
      };
    });
  }, [timeSeriesData]);

  // Sanitize chart data at component level to prevent NaN/Infinity values throughout
  const sanitizedChartData = useMemo(() => {
    const validation = validateAndSanitizeChartData(chartData, ["value"]);

    if (validation.hasIssues && process.env.NODE_ENV !== "production") {
      console.warn(
        "⚠️ ShareOfVoiceChart: Invalid chart data detected and sanitized",
        {
          totalIssues: validation.issues.length,
          affectedDataPoints: validation.issues.length,
          issues: validation.issues,
          validationSummary: {
            originalDataPoints: chartData.length,
            sanitizedDataPoints: validation.data.length,
            dataConsistency:
              chartData.length === validation.data.length
                ? "maintained"
                : "changed",
          },
          impact: "Chart will render with sanitized data to prevent crashes",
          possibleCauses: [
            "Service layer returned invalid numeric values",
            "Data transformation errors",
            "Network/database issues",
          ],
        }
      );
    }

    return validation.data;
  }, [chartData]);

  // Calculate insights with NaN protection
  const insights = useMemo(() => {
    // Use sanitizedChartData to ensure no NaN values propagate
    const safeData = sanitizedChartData.filter((item) => item.value >= 0);
    const totalVoice = safeData.reduce(
      (sum, item) => sum + (item.value || 0),
      0
    );
    const yourBrand = safeData.find((item) => item.name === "Your Brand");
    const competitors = safeData.filter((item) => item.name !== "Your Brand");
    const leader =
      competitors.length > 0
        ? competitors.reduce(
            (prev, current) =>
              prev && (prev.value || 0) > (current.value || 0) ? prev : current,
            competitors[0]
          )
        : null;

    return {
      totalVoice: totalVoice || 0,
      yourBrandShare: yourBrand?.value || 0,
      leader: leader || null,
      competitorCount: competitors.length,
      isLeading: (yourBrand?.value || 0) > (leader?.value || 0),
    };
  }, [sanitizedChartData]);

  // Process data for better visualization
  const processedChartData = useMemo(() => {
    const sortedData = [...chartData].sort((a, b) => b.value - a.value);
    const minSegmentSize = 5; // Minimum 5% to show individually

    const mainCompetitors = sortedData.filter(
      (item) => item.value >= minSegmentSize
    );
    const smallCompetitors = sortedData.filter(
      (item) => item.value < minSegmentSize
    );

    const result = [...mainCompetitors];

    // Group small competitors into "Others" if there are any
    if (smallCompetitors.length > 0) {
      const othersTotal = smallCompetitors.reduce((sum, item) => {
        // Robust validation to prevent NaN propagation in Others group
        const safeValue =
          typeof item.value === "number" &&
          !isNaN(item.value) &&
          isFinite(item.value)
            ? item.value
            : 0;
        if (safeValue !== item.value) {
          console.warn("Fixed invalid value in Others group calculation:", {
            name: item.name,
            originalValue: item.value,
            fixedValue: safeValue,
          });
        }
        return sum + safeValue;
      }, 0);

      // Validate othersTotal before using it
      const safeOthersTotal =
        typeof othersTotal === "number" &&
        !isNaN(othersTotal) &&
        isFinite(othersTotal)
          ? othersTotal
          : 0;

      if (safeOthersTotal > 0) {
        result.push({
          name: `Others (${smallCompetitors.length})`,
          value: safeOthersTotal,
          fill: "#94a3b8", // Neutral gray color
          isOthersGroup: true,
          competitors: smallCompetitors,
          colorIndex: undefined, // Others group doesn't have a specific color index
          // Add missing optional properties with aggregated values from smallCompetitors
          mentions: smallCompetitors.reduce(
            (sum, comp) => sum + (comp.mentions || 0),
            0
          ),
          totalMentions: smallCompetitors.reduce(
            (sum, comp) => sum + (comp.totalMentions || 0),
            0
          ),
          avgRank:
            smallCompetitors.length > 0
              ? smallCompetitors.reduce(
                  (sum, comp) => sum + (comp.avgRank || 0),
                  0
                ) / smallCompetitors.length
              : undefined,
          shareOfVoice: safeOthersTotal,
          totalAnalyses: smallCompetitors.reduce(
            (sum, comp) => sum + (comp.totalAnalyses || 0),
            0
          ),
        });
      } else if (othersTotal !== safeOthersTotal) {
        console.warn("Others group total was invalid, skipping Others group:", {
          originalTotal: othersTotal,
          smallCompetitorsCount: smallCompetitors.length,
        });
      }
    }

    return result;
  }, [chartData]);

  // Data validation and quality checks
  const dataQuality = useMemo(() => {
    const issues: string[] = [];
    const warnings: string[] = [];
    // Use sanitizedChartData to prevent NaN in calculations
    const totalValue = sanitizedChartData.reduce(
      (sum, item) => sum + (item.value || 0),
      0
    );

    // Check for data consistency issues
    if (chartType === "market_share") {
      if (totalValue > 105) {
        issues.push(
          `Market share total exceeds 100%: ${totalValue.toFixed(1)}%`
        );
      } else if (totalValue < 95) {
        warnings.push(
          `Market share total below 95%: ${totalValue.toFixed(1)}%`
        );
      }
    } else {
      // For share of voice, totals can vary more widely
      if (totalValue > 200) {
        warnings.push(
          `Share of voice total unusually high: ${totalValue.toFixed(1)}%`
        );
      }
    }

    // Check for missing competitor data
    const hasYourBrand = sanitizedChartData.some(
      (item) => item.name === "Your Brand"
    );
    if (!hasYourBrand) {
      issues.push("Your Brand data is missing");
    }

    // Check for zero values that might indicate data issues
    const zeroValueCompetitors = sanitizedChartData.filter(
      (item) => (item.value || 0) === 0
    ).length;
    if (zeroValueCompetitors > 0) {
      warnings.push(`${zeroValueCompetitors} competitor(s) have zero values`);
    }

    return {
      issues,
      warnings,
      isValid: issues.length === 0,
      totalValue,
    };
  }, [sanitizedChartData, chartType]);

  // Only show chart if there are competitors to compare against
  const hasCompetitors =
    data.length > 1 || (data.length === 1 && data[0]!.name !== "Your Brand");

  // Handle empty data scenario gracefully
  const hasValidData =
    sanitizedChartData.length > 0 &&
    sanitizedChartData.some((item) => item.value > 0);

  if (!hasCompetitors || !hasValidData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {chartType === "market_share"
              ? "Market Share Analysis"
              : "Share of Voice Comparison"}
          </CardTitle>
          <CardDescription>
            {!hasCompetitors
              ? "Add competitors to see share of voice analysis"
              : "No data available for the selected date range. Try selecting a wider date range like 90 days."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Info className="h-12 w-12 mb-4" />
            <p className="text-center">
              {!hasCompetitors
                ? "No competitors to display"
                : `No data available for the last ${dateFilter}`}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              {chartType === "market_share"
                ? "Market Share Analysis"
                : "Share of Voice Comparison"}
              {insights.isLeading && (
                <Badge
                  variant="outline"
                  className="text-success border-success"
                >
                  <Award className="h-3 w-3 mr-1" />
                  Leading
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {chartType === "market_share"
                ? `Normalized market share distribution across competitors (last ${dateFilter})`
                : `Share of total mentions - what percentage of all brand mentions does each competitor represent (last ${dateFilter})`}
              {!dataQuality.isValid && (
                <span className="ml-2 text-destructive text-xs">
                  ⚠ Data quality issues detected
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Data Quality Indicator */}
        {(dataQuality.issues.length > 0 || dataQuality.warnings.length > 0) && (
          <div className="mb-4 p-3 rounded-lg border">
            <div className="flex items-center gap-2 mb-2">
              {dataQuality.isValid ? (
                <CheckCircle className="h-4 w-4 text-orange-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {dataQuality.isValid
                  ? "Data Quality Warning"
                  : "Data Quality Issue"}
              </span>
            </div>
            {dataQuality.issues.length > 0 && (
              <div className="space-y-1">
                {dataQuality.issues.map((issue, index) => (
                  <p key={index} className="text-sm text-destructive">
                    • {issue}
                  </p>
                ))}
              </div>
            )}
            {dataQuality.warnings.length > 0 && (
              <div className="space-y-1">
                {dataQuality.warnings.map((warning, index) => (
                  <p key={index} className="text-sm text-orange-600">
                    • {warning}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Total{" "}
              {chartType === "market_share" ? "Market Share" : "Share of Voice"}
              : {dataQuality.totalValue.toFixed(1)}%
            </p>
          </div>
        )}

        {/* Consolidated Share of Voice Overview */}
        <div className="mb-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header with key metrics */}
          <div className="p-6 bg-white/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <Award className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {chartType === "market_share"
                      ? "Market Share Overview"
                      : "Share of Voice Overview"}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {chartType === "market_share"
                      ? "Your competitive position in the market"
                      : "Your share of total brand mentions"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {insights.yourBrandShare.toFixed(1)}%
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Your Share
                </div>
                <div
                  className={`inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-full text-xs font-medium ${
                    insights.isLeading
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {insights.isLeading ? (
                    <>
                      <TrendingUp className="h-3 w-3" />
                      #1 Leader 🏆
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3" />
                      Behind Leader
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {insights.competitorCount}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Competitors
                </div>
              </div>
              {insights.leader && (
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {insights.leader.value.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Top Competitor
                  </div>
                </div>
              )}
              <div>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {Math.round(
                    sanitizedChartData.reduce(
                      (sum, item) => sum + (item.totalMentions || 0),
                      0
                    )
                  )}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  Total Mentions
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Stacked Bar Visualization */}
          <div className="p-6 space-y-4">
            {/* Main stacked bar */}
            <div className="relative">
              <div
                className="flex h-16 rounded-xl overflow-hidden shadow-sm border border-slate-300 dark:border-slate-600"
                role="img"
                aria-label={`Share of voice distribution: ${processedChartData
                  .map((item) => `${item.name} ${item.value.toFixed(1)}%`)
                  .join(", ")}`}
              >
                {processedChartData.map((item, index) => {
                  const width = Math.max(item.value, 1); // Minimum 1% for visibility
                  const isYourBrand = item.name === "Your Brand";
                  const isOthers = item.isOthersGroup;

                  return (
                    <div
                      key={index}
                      className="relative group cursor-pointer transition-all duration-300 hover:brightness-110 hover:scale-y-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      style={{
                        backgroundColor: isYourBrand
                          ? "hsl(var(--primary))"
                          : isOthers
                          ? "#94a3b8"
                          : item.fill,
                        width: `${width}%`,
                        minWidth: "20px", // Minimum width for visibility
                        border: `1px solid ${
                          isYourBrand
                            ? "hsl(var(--primary))"
                            : isOthers
                            ? "#64748b"
                            : item.fill
                        }`,
                      }}
                      title={
                        isOthers
                          ? `${item.name}: ${item.value.toFixed(
                              1
                            )}% (${item.competitors
                              ?.map((c) => c.name)
                              .join(", ")})`
                          : `${item.name}: ${item.value.toFixed(1)}%`
                      }
                      tabIndex={0}
                      role="button"
                      aria-label={
                        isOthers
                          ? `${item.name}: ${item.value.toFixed(
                              1
                            )}% of total mentions`
                          : `${item.name}: ${item.value.toFixed(
                              1
                            )}% of total mentions`
                      }
                    >
                      {/* Enhanced label for segments with better contrast */}
                      {width > 6 && (
                        <div className="absolute inset-0 flex items-center justify-center px-1">
                          <span
                            className="text-center leading-tight font-semibold"
                            style={{
                              // Dynamic text color based on background lightness
                              color: isYourBrand
                                ? "#ffffff" // White for dark blue Your Brand background
                                : isOthers
                                ? "#ffffff" // White for gray Others background
                                : "#ffffff", // White with strong shadow for competitor colors
                              // Enhanced text shadow for better readability on all backgrounds
                              textShadow: isYourBrand
                                ? "0 1px 3px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.5)"
                                : isOthers
                                ? "0 1px 3px rgba(0,0,0,0.7), 0 0 8px rgba(0,0,0,0.5)"
                                : "0 2px 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.6)",
                              // Responsive font sizing based on segment width
                              fontSize:
                                width > 15
                                  ? "0.75rem"
                                  : width > 10
                                  ? "0.65rem"
                                  : "0.6rem",
                              // Better line height for compact display
                              lineHeight: width > 15 ? "1.1" : "1.0",
                            }}
                          >
                            {/* Smart name truncation based on available width */}
                            {width > 15 && (
                              <div className="font-semibold">
                                {item.name === "Your Brand"
                                  ? "You"
                                  : item.name.length > 12
                                  ? item.name.substring(0, 10) + "..."
                                  : item.name}
                              </div>
                            )}
                            {width > 10 && width <= 15 && (
                              <div className="font-semibold">
                                {item.name === "Your Brand"
                                  ? "You"
                                  : item.name?.split(" ")[0]?.substring(0, 8)}
                              </div>
                            )}
                            {/* Percentage always shown for segments > 6% */}
                            <div
                              className="font-bold"
                              style={{
                                fontSize:
                                  width > 15
                                    ? "0.8rem"
                                    : width > 10
                                    ? "0.7rem"
                                    : "0.65rem",
                                marginTop: width > 15 ? "1px" : "0px",
                              }}
                            >
                              {item.value.toFixed(0)}%
                            </div>
                          </span>
                        </div>
                      )}

                      {/* Fallback label for very small segments (3-6% width) */}
                      {width > 3 && width <= 6 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span
                            className="font-bold text-white text-xs"
                            style={{
                              textShadow:
                                "0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
                              fontSize: "0.6rem",
                            }}
                          >
                            {item.value.toFixed(0)}%
                          </span>
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
                    </div>
                  );
                })}
              </div>

              {/* Progress indicator */}
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Enhanced legend */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {processedChartData.map((item, index) => {
                  const isYourBrand = item.name === "Your Brand";
                  const isOthers = item.isOthersGroup;
                  const rank = index + 1;

                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 hover:shadow-md ${
                        isYourBrand
                          ? "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800"
                          : rank === 1 && !isYourBrand
                          ? "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800"
                          : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                        style={{
                          backgroundColor: isYourBrand
                            ? "hsl(var(--primary))"
                            : isOthers
                            ? "#94a3b8"
                            : item.fill,
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {item.name}
                          </span>
                          {isYourBrand && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs font-medium rounded-full">
                              You
                            </span>
                          )}
                          {rank === 1 && !isYourBrand && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs font-medium rounded-full">
                              Leader 🏆
                            </span>
                          )}
                        </div>
                        {isOthers && item.competitors && (
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {item.competitors
                              .slice(0, 3)
                              .map((c) => c.name)
                              .join(", ")}
                            {item.competitors.length > 3 &&
                              ` +${item.competitors.length - 3} more`}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {item.value.toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          #{rank}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Charts Container with Error Boundaries */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Stacked Area Chart - Share of Voice Over Time */}
          <div>
            <div className="mb-3">
              <h4 className="text-sm font-medium">Share of Voice Over Time</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Stacked area chart showing how each competitor's share of voice
                changes over time
              </p>
            </div>
            <ErrorBoundary fallback={ChartErrorFallback}>
              <div className="relative">
                {stackedAreaData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart
                      data={stackedAreaData}
                      margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                        height={60}
                        tick={{ fontSize: 12 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        labelFormatter={(value) =>
                          new Date(value).toLocaleDateString()
                        }
                        formatter={(value, name) => [
                          `${Number(value).toFixed(1)}%`,
                          name,
                        ]}
                      />

                      {/* Render stacked areas for each competitor */}
                      {competitorsList.map((competitor, index) => {
                        const color = getCompetitorFixedColor({
                          competitorId: competitor.competitorId,
                          name: competitor.name,
                        });

                        return (
                          <Area
                            key={`area-${competitor.competitorId}-${index}`}
                            type="monotone"
                            dataKey={competitor.name}
                            stackId="1"
                            stroke={color}
                            fill={color}
                            fillOpacity={0.7}
                            strokeWidth={2}
                          />
                        );
                      })}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[350px] border border-dashed border-muted-foreground/50 rounded-lg">
                    <Info className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      No time-series data available
                      <br />
                      <span className="text-xs">
                        Time-series data is needed to show Share of Voice over
                        time
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </ErrorBoundary>
          </div>

          {/* Pie Chart */}
          <div>
            <div className="mb-3">
              <h4 className="text-sm font-medium">
                {chartType === "market_share"
                  ? "Market Share Distribution"
                  : "Voice Share Distribution"}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                {chartType === "market_share"
                  ? "Proportional view of market dominance"
                  : "Visual distribution of competitor mentions"}
              </p>
            </div>
            <ErrorBoundary fallback={ChartErrorFallback}>
              <div className="relative">
                {(() => {
                  try {
                    // Use component-level sanitized data for PieChart
                    const validPieData = sanitizedChartData;

                    return (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={validPieData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({
                              name,
                              value,
                            }: {
                              name: string;
                              value: number;
                              index?: number;
                            }) => {
                              // Only show labels for segments > 5% to avoid clutter with robust validation
                              if (
                                typeof value !== "number" ||
                                isNaN(value) ||
                                !isFinite(value) ||
                                value < 5
                              )
                                return "";
                              const shortName =
                                name === "Your Brand"
                                  ? "You"
                                  : name.split(" ")[0];
                              return `${shortName}: ${value.toFixed(1)}%`;
                            }}
                            outerRadius={90}
                            fill="#8884d8"
                            dataKey="value"
                            stroke="#ffffff"
                            strokeWidth={2}
                          >
                            {validPieData.map((entry, index) => (
                              <Cell
                                key={`pie-${entry.name}-${index}`}
                                fill={entry.fill}
                                stroke={entry.fill}
                                strokeWidth={1}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value, name) => [
                              `${value}%`,
                              chartType === "market_share"
                                ? "Market Share"
                                : `${name}`,
                            ]}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    );
                  } catch (error) {
                    console.error("PieChart rendering error:", error);
                    return (
                      <div className="flex flex-col items-center justify-center h-[300px] border border-dashed border-muted-foreground/50 rounded-lg">
                        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground text-center">
                          Chart could not render
                          <br />
                          <span className="text-xs">
                            Try refreshing or selecting a different date range
                          </span>
                        </p>
                      </div>
                    );
                  }
                })()}
              </div>
            </ErrorBoundary>
          </div>
        </div>

        {/* Explanation and Color Legend */}
        <div className="mt-4 space-y-3">
          {chartType === "share_of_voice" && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">Share of Voice Explained</p>
                  <p>
                    This shows each competitor's share of total brand mentions
                    across all AI responses. If there were 100 total mentions of
                    any brand, and Your Brand was mentioned 60 times, your share
                    would be 60%. All shares sum to 100%.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="p-3 bg-muted/30 rounded-lg">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Color Legend
            </h4>
            <ColorLegend
              items={sanitizedChartData.map((item) => {
                if (item.name === "Your Brand") {
                  return {
                    name: item.name,
                    color: item.fill,
                    colorName: "Primary",
                  };
                } else {
                  // Use fixed color slot for consistent legend names
                  const colorInfo = getCompetitorFixedColorInfo({
                    competitorId: item.competitorId,
                    name: item.name,
                  });
                  return {
                    name: item.name,
                    color: item.fill,
                    colorName: colorInfo.name,
                  };
                }
              })}
            />
          </div>
        </div>

        {/* Competitive Insights */}
        {insights.leader && !insights.isLeading && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm">Competitive Insight</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {insights.leader.name} is currently leading with{" "}
                  {insights.leader.value.toFixed(1)}% share of voice. You're{" "}
                  {(insights.leader.value - insights.yourBrandShare).toFixed(1)}{" "}
                  percentage points behind. Focus on topics where they have
                  lower rankings to close the gap.
                </p>
              </div>
            </div>
          </div>
        )}

        {insights.isLeading && (
          <div className="mt-6 p-4 bg-success/10 rounded-lg border border-success/20">
            <div className="flex items-start gap-3">
              <Award className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm text-success">
                  Market Leadership
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Congratulations! You're leading the market with{" "}
                  {insights.yourBrandShare.toFixed(1)}% share of voice. Maintain
                  your position by continuing to create high-quality, relevant
                  content and monitor competitor movements.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
