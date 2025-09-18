import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  sanitizeChartNumber,
  validateAndSanitizeChartData,
  sanitizeCompetitorData,
} from "@/utils/chartDataValidation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  CompetitorAnalytics,
  type CompetitiveGapAnalysis,
} from "@/services/competitorService";
import { useMemo } from "react";
import {
  processGapAnalysis,
  generateOpportunityMatrix,
  generateGapSummary,
} from "@/lib/gap-analysis-utils";
import {
  getCompetitorFixedColor,
  getCompetitorFixedColorInfo,
  getYourBrandColor,
  registerCompetitorsInFixedSlots,
  validateAllColorAssignments,
  autoFixColorConflicts,
} from "@/lib/color-utils";
import { ColorLegend } from "@/components/ui/color-indicator";

// Custom X-Axis Tick Component with multi-line text wrapping
const CustomXAxisTick = ({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) => {
  const text = payload?.value || "";
  const maxCharsPerLine = 20; // Characters per line to prevent overlap

  // Split text into lines based on words and character limit
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Handle single word longer than maxCharsPerLine
        lines.push(word.substring(0, maxCharsPerLine - 3) + "...");
        currentLine = "";
      }
    }
  });

  if (currentLine) lines.push(currentLine);

  // Limit to 2 lines maximum to prevent excessive height
  const displayLines = lines.slice(0, 2);
  if (lines.length > 2 && displayLines[1]) {
    displayLines[1] = displayLines[1].substring(0, 20) + "...";
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        textAnchor="middle"
        fill="currentColor"
        fontSize="13.5"
        className="select-none"
      >
        {displayLines.map((line, index) => (
          <tspan key={index} x={0} dy={index === 0 ? 12 : 14}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

// Helper function for safe string extraction
function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Interface for competitor data from gap analysis
interface CompetitorData {
  competitor_id: string;
  competitor_name: string;
  competitorDomain: string;
  score: number;
  avgRankPosition: number | null;
  totalMentions: number;
}

// Helper function to extract competitor ID with multiple fallbacks
function extractCompetitorId(comp: CompetitorData): string {
  // Try multiple possible ID fields in order of preference
  return (
    safeString(comp.competitor_id) ||
    safeString(comp.competitor_name) ||
    safeString(comp.competitorDomain) ||
    `competitor_${Math.random().toString(36).substr(2, 9)}` // Generate unique fallback
  );
}

// Helper function to extract competitor name with fallbacks
function extractCompetitorName(
  comp: CompetitorData,
  fallbackIndex: number
): string {
  return (
    safeString(comp.competitor_name) ||
    safeString(comp.competitorDomain) ||
    safeString(comp.competitor_id) ||
    `Competitor ${fallbackIndex + 1}`
  );
}

interface CompetitiveGapChartProps {
  gapAnalysis: CompetitiveGapAnalysis[];
  analytics: CompetitorAnalytics | null;
  dateFilter: "7d" | "30d" | "90d";
}

export default function CompetitiveGapChart({
  gapAnalysis,
  analytics,
  dateFilter,
}: CompetitiveGapChartProps) {
  // Enhanced data processing using service-layer utilities
  const processedData = useMemo(() => {
    if (!gapAnalysis || gapAnalysis.length === 0) return null;

    // Validate color assignments and fix conflicts if needed
    const colorValidation = validateAllColorAssignments();
    if (!colorValidation.isValid) {
      autoFixColorConflicts({ logResults: false });
    }

    // Process gap analysis with service-layer utilities
    const gapClassification = processGapAnalysis(gapAnalysis);
    const opportunityMatrix = generateOpportunityMatrix(gapAnalysis);

    // Generate chart data for visualization (individual competitors)
    const validatedGapAnalysis = gapAnalysis.map((gap) => ({
      ...gap,
      yourBrandScore: Math.max(
        0,
        Math.min(100, isNaN(gap.yourBrandScore) ? 0 : gap.yourBrandScore)
      ),
      competitorData: gap.competitorData.map((comp) => ({
        ...comp,
        score: Math.max(0, Math.min(100, isNaN(comp.score) ? 0 : comp.score)),
        totalMentions: Math.max(
          0,
          isNaN(comp.totalMentions) ? 0 : comp.totalMentions
        ),
      })),
    }));

    // Generate bar chart data with individual competitors
    const barChartData = validatedGapAnalysis.map((gap) => {
      const data: Record<string, number | string> = {
        topic: gap.topicName,
        yourBrand: sanitizeChartNumber(gap.yourBrandScore, 0),
      };

      gap.competitorData.forEach((comp, index) => {
        // Use robust competitor identification
        const competitorId = extractCompetitorId(comp);
        const competitorName = extractCompetitorName(comp, index);

        // CRITICAL FIX: Sanitize score to prevent NaN from reaching Recharts
        data[`competitor${index + 1}`] = sanitizeChartNumber(comp.score, 0);
        data[`competitor${index + 1}_name`] = competitorName;
        data[`competitor${index + 1}_id`] = competitorId;
      });
      return data;
    });

    // Get all unique competitor keys for dynamic rendering
    const competitorKeys = new Set<string>();
    barChartData.forEach((item) => {
      Object.keys(item).forEach((key) => {
        if (key.startsWith("competitor") && key.endsWith("_name")) {
          const competitorKey = key.replace("_name", "");
          competitorKeys.add(competitorKey);
        }
      });
    });

    // Extract all unique competitors for standardized mapping
    const allCompetitors: Array<{
      competitorId: string;
      name: string;
      key: string;
    }> = [];

    Array.from(competitorKeys).forEach((key) => {
      const sampleData = barChartData.find((item) => item[`${key}_name`]);
      const competitorId = safeString(sampleData?.[`${key}_id`]);
      const competitorName = safeString(
        sampleData?.[`${key}_name`],
        `Competitor ${allCompetitors.length + 1}`
      );

      allCompetitors.push({
        competitorId,
        name: competitorName,
        key,
      });
    });

    // Register all competitors in fixed color slots for predictable color assignment
    registerCompetitorsInFixedSlots(
      allCompetitors.map((comp) => ({
        competitorId: comp.competitorId,
        name: comp.name,
      }))
    );

    // Create competitor info array for rendering with fixed color assignment
    const competitorInfo = allCompetitors.map((comp) => {
      // Get fixed color slot for predictable competitor coloring
      const colorInfo = getCompetitorFixedColorInfo({
        competitorId: comp.competitorId,
        name: comp.name,
      });

      const color = getCompetitorFixedColor({
        competitorId: comp.competitorId,
        name: comp.name,
      });

      return {
        key: comp.key,
        name: comp.name,
        competitorId: comp.competitorId,
        colorIndex: colorInfo.colorSlot,
        color,
      };
    });

    // Radar chart data with individual competitors using proper identifiers
    const radarData = validatedGapAnalysis.map((gap) => {
      const data: Record<string, number | string> = {
        topic: gap.topicName,
        yourBrand: sanitizeChartNumber(gap.yourBrandScore, 0),
      };

      // Map competitor data to proper competitor keys for consistent coloring
      gap.competitorData.forEach(
        (
          comp: {
            score: string | number;
            competitorId?: string;
            name?: string;
          },
          compIndex: number
        ) => {
          // Find matching competitor info for proper key assignment
          const matchingCompetitor = competitorInfo.find(
            (info) =>
              info.competitorId === comp.competitorId ||
              info.name === comp.name ||
              info.name.includes(String(comp.name || ""))
          );

          if (matchingCompetitor) {
            data[matchingCompetitor.key] = sanitizeChartNumber(comp.score, 0);
          } else {
            // Fallback to generic key if no match found
            data[`competitor${compIndex + 1}`] = sanitizeChartNumber(
              comp.score,
              0
            );
          }
        }
      );

      return data;
    });

    // Final safety validation for all chart data
    const finalBarChartData = sanitizeCompetitorData(barChartData);
    const finalRadarData = sanitizeCompetitorData(radarData);

    return {
      barChartData: finalBarChartData,
      competitorInfo,
      radarData: finalRadarData,
      gapClassification,
      opportunityMatrix,
    };
  }, [gapAnalysis]);

  // Calculate insights using service-layer utility
  const insights = useMemo(() => {
    if (!processedData) return null;
    return generateGapSummary(processedData.gapClassification);
  }, [processedData]);

  // Validate color consistency in development
  useMemo(() => {
    if (
      process.env.NODE_ENV === "development" &&
      (processedData?.competitorInfo?.length ?? 0) > 0
    ) {
      const validation = validateAllColorAssignments();
      if (!validation.isValid) {
        // Color assignment conflicts detected
      }

      // Color mappings available for debugging
    }
  }, [processedData]);

  // Enhanced debugging with data validation
  if (processedData?.barChartData) {
    // Validate chart data for potential issues
    const competitorKeys = Object.keys(
      processedData.barChartData[0] || {}
    ).filter(
      (key) =>
        key.startsWith("competitor") &&
        !key.endsWith("_name") &&
        !key.endsWith("_id")
    );

    const allDataKeys = ["yourBrand", ...competitorKeys];
    const validation = validateAndSanitizeChartData(
      processedData.barChartData,
      allDataKeys
    );

    if (validation.hasIssues && process.env.NODE_ENV !== "production") {
      console.warn(
        "⚠️ CompetitiveGapChart: NaN/Infinity detected in barChartData:",
        {
          issues: validation.issues,
          originalData: processedData.barChartData,
          sanitizedData: validation.data,
        }
      );
    }
  }

  // Only show chart if there are competitors and meaningful data
  if (!processedData || !analytics || analytics.totalCompetitors === 0)
    return null;

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ color: string; name: string; value: number }>;
    label?: string;
  }): React.ReactNode => {
    if (active && payload && payload.length) {
      return (
        <div
          className="bg-background border rounded-lg p-3 shadow-md"
          role="tooltip"
        >
          <p className="font-medium mb-2" aria-label={`Topic: ${label}`}>
            {label}
          </p>
          <div className="space-y-1">
            {payload.map((entry, _) => (
              <div key={_} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm"
                  aria-label={`${entry.name}: ${entry.value.toFixed(
                    1
                  )} percent`}
                >
                  <span className="font-medium">{entry.name}:</span>{" "}
                  {entry.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Competitive Gap Analysis</CardTitle>
            <CardDescription>
              Topic-by-topic comparison with your competitors (last {dateFilter}
              )
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Insights Summary */}
        {insights && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{insights.totalTopics}</div>
              <div className="text-sm text-muted-foreground">
                Topics Analyzed
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-500">
                {insights.opportunities}
              </div>
              <div className="text-sm text-muted-foreground">Opportunities</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {insights.advantages}
              </div>
              <div className="text-sm text-muted-foreground">Advantages</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">
                {insights.highPriorityGaps}
              </div>
              <div className="text-sm text-muted-foreground">High Priority</div>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="radar">Performance Radar</TabsTrigger>
            <TabsTrigger value="gaps">Gap Details</TabsTrigger>
            <TabsTrigger value="matrix">Opportunity Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div
              role="img"
              aria-label="Bar chart showing competitive gap analysis across topics"
            >
              <ResponsiveContainer width="100%" height={430}>
                <BarChart
                  data={processedData.barChartData}
                  accessibilityLayer
                  margin={{ bottom: 20, left: 20, right: 20, top: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="topic"
                    tick={<CustomXAxisTick />}
                    interval={0}
                    height={100}
                    aria-label="Topics"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    aria-label="Performance score percentage"
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="yourBrand"
                    name="Your Brand"
                    fill={getYourBrandColor()}
                    radius={[4, 4, 0, 0]}
                  >
                    {processedData.barChartData.map((entry, index) => (
                      <Cell
                        key={`your-brand-${entry.topic || index}`}
                        fill={getYourBrandColor()}
                        stroke={getYourBrandColor()}
                        strokeWidth={1}
                      />
                    ))}
                  </Bar>
                  {processedData.competitorInfo.map((competitor) => (
                    <Bar
                      key={competitor.key}
                      dataKey={competitor.key}
                      name={competitor.name}
                      fill={competitor.color}
                      radius={[4, 4, 0, 0]}
                    >
                      {processedData.barChartData.map((entry, index) => (
                        <Cell
                          key={`${competitor.key}-${entry.topic || index}`}
                          fill={competitor.color}
                          stroke={competitor.color}
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Color Legend for Accessibility */}
            {processedData.competitorInfo.length > 0 && (
              <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Color Legend
                </h4>
                <ColorLegend
                  items={[
                    {
                      name: "Your Brand",
                      color: getYourBrandColor(),
                      colorName: "Primary",
                    },
                    ...processedData.competitorInfo.map((competitor) => {
                      // Get color info using fixed color slot system
                      const colorInfo = getCompetitorFixedColorInfo({
                        competitorId: competitor.competitorId,
                        name: competitor.name,
                      });
                      return {
                        name: competitor.name,
                        color: competitor.color,
                        colorName: colorInfo.name,
                      };
                    }),
                  ]}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="radar" className="space-y-4">
            <div
              role="img"
              aria-label="Radar chart showing competitive performance across all topics"
            >
              <ResponsiveContainer width="100%" height={450}>
                <RadarChart
                  data={processedData.radarData}
                  accessibilityLayer
                  margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="topic" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar
                    name="Your Brand"
                    dataKey="yourBrand"
                    stroke={getYourBrandColor()}
                    fill={getYourBrandColor()}
                    fillOpacity={0.3}
                  />
                  {processedData.competitorInfo.map((competitor) => (
                    <Radar
                      key={competitor.key}
                      name={competitor.name}
                      dataKey={competitor.key}
                      stroke={competitor.color}
                      fill={competitor.color}
                      fillOpacity={0.2}
                    />
                  ))}
                  <Legend />
                  <RechartsTooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="gaps" className="space-y-4">
            <TooltipProvider>
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Gap Analysis Methodology
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="text-xs space-y-2">
                        <p>
                          Gap scores compare your brand performance against the
                          average of all competitors for each topic.
                        </p>
                        <div className="space-y-1">
                          <p>
                            <strong>Classification:</strong>
                          </p>
                          <p>
                            • <span className="text-green-600">Advantage</span>:
                            +15% or higher gap
                          </p>
                          <p>
                            •{" "}
                            <span className="text-orange-600">Opportunity</span>
                            : -15% or lower gap
                          </p>
                          <p>
                            • <span className="text-blue-600">Competitive</span>
                            : Between -15% and +15%
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p>
                            <strong>Priority considers:</strong>
                          </p>
                          <p>
                            • Gap size, your performance level, and market
                            competitiveness
                          </p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xs text-muted-foreground">
                  Showing gaps vs.{" "}
                  <strong>average competitor performance</strong> across all
                  topics. Individual competitor details are shown in the
                  Overview and Radar charts above.
                </p>
              </div>
              <div className="space-y-3">
                {processedData.gapClassification.map((gap, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      gap.gapType === "advantage"
                        ? "bg-success/10 border-success/20"
                        : gap.gapType === "opportunity"
                        ? "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800"
                        : "bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {gap.gapType === "advantage" ? (
                            <TrendingUp className="h-4 w-4 text-success" />
                          ) : gap.gapType === "opportunity" ? (
                            <Target className="h-4 w-4 text-orange-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <h4 className="font-medium">{gap.topicName}</h4>
                        </div>
                        <Badge
                          variant={
                            gap.priority === "high"
                              ? "destructive"
                              : gap.priority === "medium"
                              ? "default"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {gap.priority} priority
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          Gap: {gap.gapSize > 0 ? "+" : ""}
                          {gap.gapSize.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          You: {gap.yourBrandScore.toFixed(1)}% | Avg
                          Competitor: {gap.avgCompetitor.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          </TabsContent>

          <TabsContent value="matrix" className="space-y-4">
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Strategic Opportunity Matrix
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                This matrix identifies strategic opportunities by plotting{" "}
                <strong>competitive intensity</strong> (x-axis) vs{" "}
                <strong>market opportunity size</strong> (y-axis). Bubble size
                shows your current performance level.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                  <strong className="text-green-700 dark:text-green-300">
                    Top-Left: Blue Ocean
                  </strong>
                  <p className="text-green-600 dark:text-green-400">
                    High opportunity, low competition
                  </p>
                </div>
                <div className="p-2 bg-orange-50 dark:bg-orange-950 rounded border border-orange-200 dark:border-orange-800">
                  <strong className="text-orange-700 dark:text-orange-300">
                    Top-Right: Battleground
                  </strong>
                  <p className="text-orange-600 dark:text-orange-400">
                    High opportunity, high competition
                  </p>
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
                  <strong className="text-blue-700 dark:text-blue-300">
                    Bottom-Left: Niche
                  </strong>
                  <p className="text-blue-600 dark:text-blue-400">
                    Low opportunity, low competition
                  </p>
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                  <strong className="text-red-700 dark:text-red-300">
                    Bottom-Right: Red Ocean
                  </strong>
                  <p className="text-red-600 dark:text-red-400">
                    Low opportunity, high competition
                  </p>
                </div>
              </div>
            </div>
            <div
              role="img"
              aria-label="Opportunity matrix scatter chart showing topics by market competitiveness versus your performance"
            >
              <ResponsiveContainer width="100%" height={450}>
                <ScatterChart
                  data={processedData.opportunityMatrix}
                  accessibilityLayer
                  margin={{ bottom: 60, left: 60, right: 20, top: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  {/* Quadrant dividers */}
                  <ReferenceLine
                    x={50}
                    stroke="#64748b"
                    strokeDasharray="5 5"
                    strokeOpacity={0.6}
                  />
                  <ReferenceLine
                    y={50}
                    stroke="#64748b"
                    strokeDasharray="5 5"
                    strokeOpacity={0.6}
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 100]}
                    name="Competitive Intensity"
                    aria-label="Competitive Intensity percentage"
                    label={{
                      value: "Competitive Intensity (%)",
                      position: "insideBottom",
                      offset: -5,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 100]}
                    name="Market Opportunity Size"
                    aria-label="Market Opportunity Size percentage"
                    label={{
                      value: "Market Opportunity Size (%)",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <RechartsTooltip
                    formatter={(value: unknown, name: unknown) => [
                      name === "size" ? `${value} mentions` : `${value}%`,
                      name === "x"
                        ? "Competitive Intensity"
                        : name === "y"
                        ? "Market Opportunity Size"
                        : "Your Performance Level",
                    ]}
                    labelFormatter={(label: unknown, payload: unknown) => {
                      const data =
                        Array.isArray(payload) && payload.length > 0
                          ? payload[0]?.payload
                          : undefined;
                      return data?.topic
                        ? `Topic: ${data.topic}`
                        : String(label);
                    }}
                  />
                  <Scatter name="Topics" dataKey="y" fill={getYourBrandColor()}>
                    {processedData.opportunityMatrix.map((entry, index) => {
                      // Strategic quadrant-based color coding
                      const opportunitySize = entry.y > 50 ? "high" : "low";
                      const competitiveIntensity =
                        entry.x > 50 ? "high" : "low";

                      let fillColor = getYourBrandColor(); // Default to your brand color

                      // Strategic quadrant color coding
                      if (
                        opportunitySize === "high" &&
                        competitiveIntensity === "low"
                      ) {
                        fillColor = "#22c55e"; // Green for Blue Ocean (high opportunity, low competition)
                      } else if (
                        opportunitySize === "high" &&
                        competitiveIntensity === "high"
                      ) {
                        fillColor = "#f97316"; // Orange for Battleground (high opportunity, high competition)
                      } else if (
                        opportunitySize === "low" &&
                        competitiveIntensity === "low"
                      ) {
                        fillColor = "#3b82f6"; // Blue for Niche (low opportunity, low competition)
                      } else if (
                        opportunitySize === "low" &&
                        competitiveIntensity === "high"
                      ) {
                        fillColor = "#ef4444"; // Red for Red Ocean (low opportunity, high competition)
                      }

                      return (
                        <Cell
                          key={`matrix-${index}-${entry.x}-${entry.y}`}
                          fill={fillColor}
                          stroke={fillColor}
                          strokeWidth={2}
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        {/* Key Insights */}
        {insights && (
          <div className="mt-6 space-y-3">
            {insights.biggestOpportunity && (
              <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm">Biggest Opportunity</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">
                        {insights.biggestOpportunity.topicName}
                      </span>{" "}
                      shows the largest gap (
                      {Math.abs(insights.biggestOpportunity.gapSize).toFixed(1)}{" "}
                      percentage points). Focus your content strategy here for
                      maximum impact.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {insights.strongestAdvantage && (
              <div className="p-4 bg-success/10 rounded-lg border border-success/20">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm text-success">
                      Strongest Advantage
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      You're leading in{" "}
                      <span className="font-medium">
                        {insights.strongestAdvantage.topicName}
                      </span>
                      by {insights.strongestAdvantage.gapSize.toFixed(1)}{" "}
                      percentage points. Leverage this strength to reinforce
                      your market position.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
