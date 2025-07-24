import {
  LLMPerformanceChart,
  MentionTrendChart,
  QuickStats,
  SentimentDistributionChart,
  TopicRadarChart,
  WebsitePerformanceChart,
} from "@/components/DashboardCharts";
import { DashboardErrorState } from "@/components/dashboard/DashboardErrorState";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardLoadingState } from "@/components/dashboard/DashboardLoadingState";
import { DashboardMetricsCards } from "@/components/dashboard/DashboardMetricsCards";
import { VisibilityChart } from "@/components/dashboard/VisibilityChart";
import { WorkspaceCreationPrompt } from "@/components/dashboard/WorkspaceCreationPrompt";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExportFormat, useExportHandler } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";
import { useDashboardMetrics } from "@/hooks/useDashboard";
import { useWorkspace } from "@/hooks/useWorkspace";
import { dashboardService } from "@/services/dashboardService";
import {
  AlertCircle,
  BarChart3,
  Building,
  Download,
  ExternalLink,
  MessageSquare,
  Plus,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

export default function Dashboard() {
  const { toast } = useToast();
  const { currentWorkspace, loading, websites } = useWorkspace();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [dateFilter, setDateFilter] = useState<"7d" | "30d" | "90d">("7d");
  const [showAllCharts, setShowAllCharts] = useState(false);
  const { handleExport } = useExportHandler();
  const filters = useMemo(
    () => ({
      period: dateFilter,
    }),
    [dateFilter]
  );

  // Use dashboard data hooks
  const {
    metrics,
    timeSeriesData,
    topicPerformance,
    llmPerformance,
    websitePerformance,
    isLoading: isDashboardLoading,
    isRefreshing,
    refreshData,
    error: dashboardError,
    hasData,
    clearError,
  } = useDashboardMetrics(filters);

  const websiteIds = useMemo(() => websites?.map((w) => w.id) || [], [websites]);

  const getSentimentColor = (sentiment: number) => {
    if (sentiment >= 60) return "bg-success";
    if (sentiment <= 40) return "bg-destructive";
    return "bg-warning";
  };

  const getSentimentText = (sentiment: number) => {
    if (sentiment >= 60) return "text-success";
    if (sentiment <= 40) return "text-destructive";
    return "text-warning";
  };

  const getSentimentLabel = (sentiment: number) => {
    if (sentiment >= 60) return "positive";
    if (sentiment <= 40) return "negative";
    return "neutral";
  };

  const handleExportData = async (format: ExportFormat) => {
    if (!hasData || websiteIds.length === 0) {
      toast({
        title: "No data to export",
        description: "Please ensure you have analysis data before exporting.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      // Import the export service dynamically
      const { exportService } = await import("@/services/exportService");
      
      // Prepare comprehensive dashboard export data as tabular format for PDF
      const dashboardExportData = [
        // Summary section
        { category: "Summary", metric: "Total Websites", value: websiteIds.length.toString(), unit: "count" },
        { category: "Summary", metric: "Time Period", value: dateFilter.toUpperCase(), unit: "period" },
        { category: "Summary", metric: "Export Date", value: new Date().toLocaleDateString(), unit: "date" },
        { category: "Summary", metric: "Total Analyses", value: (metrics?.totalAnalyses || 0).toLocaleString(), unit: "count" },
        { category: "Summary", metric: "Top Performing Topic", value: topicPerformance?.[0]?.topic || "N/A", unit: "text" },
        
        // Performance Metrics
        { category: "Performance", metric: "Average Confidence", value: `${(metrics?.averageConfidence || 0).toFixed(1)}%`, unit: "percentage" },
        { category: "Performance", metric: "Average Sentiment", value: `${(metrics?.averageSentiment || 0).toFixed(1)}%`, unit: "percentage" },
        { category: "Performance", metric: "Mention Rate", value: `${(metrics?.mentionRate || 0).toFixed(1)}%`, unit: "percentage" },
        { category: "Performance", metric: "Sentiment Trend", value: getSentimentLabel(metrics?.averageSentiment || 0), unit: "text" },
        
        // Website Statistics
        ...(websites?.filter(w => 
          w?.display_name && w?.domain // Only include websites with required fields
        ).map(w => ({
          category: "Websites", 
          metric: w.display_name, 
          value: w.domain, 
          unit: `${w.is_active ? 'Active' : 'Inactive'}${w.monitoring_enabled ? ' | Monitored' : ''}`
        })) || []),
        
        // Topic Performance (top 5)
        ...(topicPerformance?.filter(topic => 
          topic?.topic && typeof topic?.averageConfidence === 'number' // Only include valid topics
        ).slice(0, 5).map((topic, index) => ({
          category: "Top Topics",
          metric: `#${index + 1} ${topic.topic}`,
          value: `${topic.averageConfidence.toFixed(1)}%`,
          unit: "confidence"
        })) || []),
        
        // LLM Performance
        ...(llmPerformance?.filter(llm => 
          llm?.name && typeof llm?.averageConfidence === 'number' && typeof llm?.totalResults === 'number'
        ).map(llm => ({
          category: "LLM Performance",
          metric: llm.name,
          value: `${llm.averageConfidence.toFixed(1)}%`,
          unit: `${llm.totalResults} results`
        })) || []),
        
        // Website Performance (top performers)
        ...(websitePerformance?.filter(site => 
          site?.displayName && typeof site?.averageConfidence === 'number' && typeof site?.totalResults === 'number'
        ).slice(0, 5).map((site, index) => ({
          category: "Website Performance",
          metric: `#${index + 1} ${site.displayName}`,
          value: `${site.averageConfidence.toFixed(1)}%`,
          unit: `${site.totalResults} analyses`
        })) || []),
        
        // Time Series Summary (if available)
        ...(timeSeriesData && timeSeriesData.length > 0 ? [
          { category: "Time Series", metric: "Data Points", value: timeSeriesData.length.toString(), unit: "count" },
          { category: "Time Series", metric: "Date Range", value: `${new Date(Math.min(...timeSeriesData.map(d => new Date(d.date).getTime()))).toLocaleDateString()} - ${new Date(Math.max(...timeSeriesData.map(d => new Date(d.date).getTime()))).toLocaleDateString()}`, unit: "range" },
        ] : []),
      ];

      // Create export content with proper structure
      const exportContent = {
        title: `Dashboard Analytics Report - ${dateFilter.toUpperCase()}`,
        data: dashboardExportData,
        exportedAt: new Date().toISOString(),
        totalRecords: websiteIds.length,
        filters: {
          period: dateFilter,
          totalWebsites: websiteIds.length,
          activeWebsites: websites?.filter(w => w.is_active).length || 0,
          dataTypes: ["metrics", "timeSeriesData", "topicPerformance", "llmPerformance", "websitePerformance"],
        },
        dateRange: {
          start: new Date(Date.now() - (dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
        dataType: "dashboard", // Use dashboard field mapping
        metadata: {
          exportType: "dashboard_analytics",
          generatedBy: "Beekon AI Export Service",
          workspaceId: currentWorkspace?.id,
          totalWebsites: websiteIds.length,
          analysisCount: metrics?.totalAnalyses || 0,
          averageConfidence: metrics?.averageConfidence || 0,
          averageSentiment: metrics?.averageSentiment || 0,
          mentionRate: metrics?.mentionRate || 0,
        },
      };

      const blob = await exportService.exportData(exportContent, format, { 
        exportType: "dashboard", 
        customFilename: `dashboard_analytics_${dateFilter}_${new Date().toISOString().split('T')[0]}` 
      });

      await handleExport(
        () => Promise.resolve(blob),
        {
          filename: `dashboard-analytics-${dateFilter}`,
          format,
          includeTimestamp: true,
          metadata: {
            websiteCount: websiteIds.length,
            period: dateFilter,
            exportType: "dashboard_analytics",
            dataTypes: ["metrics", "timeSeriesData", "topicPerformance", "llmPerformance", "websitePerformance"],
            generatedBy: "Beekon AI",
          },
        }
      );

      toast({
        title: "Export Successful",
        description: `Dashboard analytics exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleMetricClick = (
    metricName: string,
    additionalParams?: Record<string, string>
  ) => {
    // Navigate to Analysis page with context
    const params = new URLSearchParams();
    params.set("focus", metricName.toLowerCase().replace(/ /g, "-"));

    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        params.set(key, value);
      });
    }

    navigate(`/analysis?${params.toString()}`);
  };

  const formatTrendText = (trend: number) => {
    const abs = Math.abs(trend);
    const direction = trend >= 0 ? "improvement" : "decline";
    return `${abs}% ${direction}`;
  };

  const getTrendIcon = (trend: number) => {
    return trend >= 0 ? TrendingUp : TrendingDown;
  };

  const getTrendColor = (trend: number) => {
    return trend >= 0 ? "text-success" : "text-destructive";
  };

  // Show loading state
  if (loading || isDashboardLoading) {
    return <DashboardLoadingState />;
  }

  // Show workspace creation prompt when no workspace exists
  if (!currentWorkspace) {
    return <WorkspaceCreationPrompt />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <DashboardHeader
          currentWorkspace={currentWorkspace}
          metrics={metrics}
          dateFilter={dateFilter}
          setDateFilter={setDateFilter}
          showAllCharts={showAllCharts}
          setShowAllCharts={setShowAllCharts}
          isRefreshing={isRefreshing}
          isExporting={isExporting}
          hasData={hasData}
          refreshData={refreshData}
          handleExportData={handleExportData}
        />

        {/* Error State */}
        {dashboardError && (
          <DashboardErrorState
            error={dashboardError}
            onRetry={refreshData}
            onDismiss={clearError}
            isRefreshing={isRefreshing}
          />
        )}

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleMetricClick("Overall Visibility Score")}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>Overall Visibility Score</CardTitle>
                  <div className="flex items-center space-x-1">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {metrics?.overallVisibilityScore ?? 0}%
                  </div>
                  {metrics && metrics.improvementTrend !== 0 && (
                    <p
                      className={`text-xs flex items-center ${getTrendColor(
                        metrics.improvementTrend
                      )}`}
                    >
                      {React.createElement(
                        getTrendIcon(metrics.improvementTrend),
                        { className: "h-3 w-3 mr-1" }
                      )}
                      {formatTrendText(metrics.improvementTrend)}
                    </p>
                  )}
                  {(!metrics || metrics.improvementTrend === 0) && (
                    <p className="text-xs text-muted-foreground">
                      No trend data
                    </p>
                  )}
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>Click to view detailed visibility analysis</p>
            </TooltipContent>
          </Tooltip>

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleMetricClick("Average Rank")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>Average Rank</CardTitle>
              <div className="flex items-center space-x-1">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.averageRanking
                  ? metrics.averageRanking.toFixed(1)
                  : "0.0"}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.totalMentions
                  ? "Across all mentions"
                  : "No ranking data"}
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleMetricClick("Total Mentions")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>Total Mentions</CardTitle>
              <div className="flex items-center space-x-1">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics?.totalMentions?.toLocaleString() ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.totalAnalyses
                  ? `From ${metrics.totalAnalyses} analyses`
                  : "No mention data"}
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleMetricClick("Sentiment Score")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>Sentiment Score</CardTitle>
              <div className="flex items-center space-x-1">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  metrics ? getSentimentText(metrics.sentimentScore) : ""
                }`}
              >
                {metrics?.sentimentScore ?? 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics
                  ? getSentimentLabel(metrics.sentimentScore)
                  : "No sentiment data"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Visibility Chart */}
        {timeSeriesData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Visibility Over Time</CardTitle>
                  <CardDescription>
                    Your brand's visibility trend across all LLMs (last{" "}
                    {dateFilter})
                  </CardDescription>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportData("csv")}
                    disabled={!hasData}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString()
                    }
                  />
                  <YAxis domain={[0, 100]} />
                  <RechartsTooltip
                    labelFormatter={(value) =>
                      new Date(value).toLocaleDateString()
                    }
                    formatter={(value) => [`${value}%`, "Visibility Score"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="visibility"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        {hasData && (
          <QuickStats
            stats={{
              totalWebsites: metrics?.activeWebsites || 0,
              totalTopics: topicPerformance.length,
              averageVisibility: metrics?.overallVisibilityScore || 0,
              topPerformingTopic: metrics?.topPerformingTopic ?? null,
            }}
          />
        )}

        {/* Enhanced Analytics Charts */}
        {hasData && showAllCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LLM Performance Chart */}
            {llmPerformance.length > 0 && (
              <LLMPerformanceChart llmData={llmPerformance} />
            )}

            {/* Website Performance Chart */}
            {websitePerformance.length > 0 && (
              <WebsitePerformanceChart websiteData={websitePerformance} />
            )}

            {/* Sentiment Distribution */}
            {metrics && (
              <SentimentDistributionChart
                sentimentData={[
                  {
                    name: "Positive",
                    value: metrics.sentimentScore > 60 ? 60 : 20,
                    color: "#10B981",
                  },
                  { name: "Neutral", value: 20, color: "#F59E0B" },
                  {
                    name: "Negative",
                    value: metrics.sentimentScore < 40 ? 20 : 20,
                    color: "#EF4444",
                  },
                ]}
              />
            )}

            {/* Mention Trends */}
            {timeSeriesData.length > 0 && (
              <MentionTrendChart trendData={timeSeriesData} />
            )}

            {/* Topic Radar Chart */}
            {topicPerformance.length > 0 && (
              <TopicRadarChart topicData={topicPerformance} />
            )}
          </div>
        )}

        {/* Performance by Topic */}
        {topicPerformance.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Performance by Topic</CardTitle>
                  <CardDescription>
                    How your brand performs across different topics and keywords
                  </CardDescription>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportData("pdf")}
                    disabled={!hasData}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Report
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topicPerformance.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() =>
                      handleMetricClick("topic-details", { topic: item.topic })
                    }
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-medium">{item.topic}</h4>
                        {item.trend !== 0 &&
                          React.createElement(getTrendIcon(item.trend), {
                            className: `h-4 w-4 ${getTrendColor(item.trend)}`,
                          })}
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Visibility</span>
                            <span className="font-medium">
                              {item.visibility}%
                            </span>
                          </div>
                          <Progress value={item.visibility} className="h-2" />
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-muted-foreground">
                            Avg Rank
                          </div>
                          <div className="font-medium">
                            {item.averageRank > 0
                              ? item.averageRank.toFixed(1)
                              : "N/A"}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-muted-foreground">
                            Sentiment
                          </div>
                          <div className="flex items-center justify-center">
                            <div
                              className={`w-2 h-2 rounded-full ${getSentimentColor(
                                item.sentiment
                              )} mr-1`}
                            />
                            <span
                              className={`text-sm capitalize ${getSentimentText(
                                item.sentiment
                              )}`}
                            >
                              {getSentimentLabel(item.sentiment)}
                            </span>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-muted-foreground">
                            Mentions
                          </div>
                          <div className="font-medium">{item.mentions}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!hasData && !isDashboardLoading && (
          <Card className="text-center py-12">
            <CardContent>
              <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="mb-2">No Dashboard Data</CardTitle>
              <CardDescription className="mb-4">
                {websiteIds.length === 0
                  ? "Add websites to your workspace to start tracking your brand's AI visibility."
                  : "Run some analyses to see your dashboard metrics and insights."}
              </CardDescription>
              <Button
                onClick={() =>
                  (window.location.href =
                    websiteIds.length === 0 ? "/websites" : "/analysis")
                }
              >
                {websiteIds.length === 0 ? "Add Websites" : "Run Analysis"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
