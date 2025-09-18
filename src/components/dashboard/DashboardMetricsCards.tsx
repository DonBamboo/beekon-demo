import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardMetrics } from "@/hooks/useDashboard";
import {
  BarChart3,
  ExternalLink,
  MessageSquare,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import React from "react";

interface DashboardMetricsCardsProps {
  metrics: DashboardMetrics | null;
  onMetricClick: (metric: string) => void;
}

export function DashboardMetricsCards({
  metrics,
  onMetricClick,
}: DashboardMetricsCardsProps) {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onMetricClick("Overall Visibility Score")}
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
                  {React.createElement(getTrendIcon(metrics.improvementTrend), {
                    className: "h-3 w-3 mr-1",
                  })}
                  {formatTrendText(metrics.improvementTrend)}
                </p>
              )}
              {(!metrics || metrics.improvementTrend === 0) && (
                <p className="text-xs text-muted-foreground">No trend data</p>
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
        onClick={() => onMetricClick("Average Rank")}
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
            {metrics?.totalMentions ? "Across all mentions" : "No ranking data"}
          </p>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => onMetricClick("Total Mentions")}
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
        onClick={() => onMetricClick("Sentiment Score")}
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
  );
}
