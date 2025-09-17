import React, { forwardRef, useMemo, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type {
  LLMPerformance,
  WebsitePerformance,
} from "@/services/dashboardService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  validateAndSanitizeChartData,
  sanitizeChartNumber,
} from "@/utils/chartDataValidation";

interface LLMPerformanceChartProps {
  llmData: LLMPerformance[];
}

export const LLMPerformanceChart = React.memo(
  forwardRef<HTMLDivElement, LLMPerformanceChartProps>(({ llmData }, ref) => {
    // Validate and sanitize chart data to detect NaN/Infinity values
    const sanitizedData = useMemo(() => {
      const validation = validateAndSanitizeChartData(
        llmData as unknown as Record<string, unknown>[],
        ["mentionRate", "sentiment"]
      );

      if (validation.hasIssues && process.env.NODE_ENV !== "production") {
        console.warn(
          "⚠️ LLMPerformanceChart: NaN/Infinity detected in llmData:",
          {
            issues: validation.issues,
            originalData: llmData,
            sanitizedData: validation.data,
          }
        );
      }

      return validation.data as unknown as LLMPerformance[];
    }, [llmData]);

    return (
      <Card ref={ref}>
        <CardHeader>
          <CardTitle>LLM Performance Comparison</CardTitle>
          <CardDescription>
            Compare mention rates and sentiment across different AI models
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sanitizedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis domain={[0, 100]} />
              <Tooltip
                formatter={(value, name) => [
                  `${value}%`,
                  name === "mentionRate" ? "Mention Rate" : "Sentiment Score",
                ]}
              />
              <Bar
                dataKey="mentionRate"
                fill="hsl(var(--primary))"
                name="Mention Rate"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="sentiment"
                fill="hsl(var(--secondary))"
                name="Sentiment Score"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  })
);

LLMPerformanceChart.displayName = "LLMPerformanceChart";

interface WebsitePerformanceChartProps {
  websiteData: WebsitePerformance[];
}

export const WebsitePerformanceChart = React.memo(
  forwardRef<HTMLDivElement, WebsitePerformanceChartProps>(
    ({ websiteData }, ref) => {
      // Sanitize website data to prevent display issues
      const sanitizedWebsites = useMemo(() => {
        return websiteData.map((website) => ({
          ...website,
          visibility: sanitizeChartNumber(website.visibility),
          mentions: sanitizeChartNumber(website.mentions),
          sentiment: sanitizeChartNumber(website.sentiment),
        }));
      }, [websiteData]);

      const topWebsites = sanitizedWebsites.slice(0, 5); // Show top 5 websites

      // Add development-only logging for validation issues
      useEffect(() => {
        if (process.env.NODE_ENV !== "production" && websiteData.length > 0) {
          const hasValidationIssues = websiteData.some(
            (site) =>
              typeof site.visibility !== "number" ||
              isNaN(site.visibility) ||
              typeof site.mentions !== "number" ||
              isNaN(site.mentions) ||
              typeof site.sentiment !== "number" ||
              isNaN(site.sentiment)
          );

          if (hasValidationIssues) {
            console.warn(
              "⚠️ WebsitePerformanceChart: Invalid numeric values detected in website data"
            );
          }
        }
      }, [websiteData]);

      return (
        <Card ref={ref}>
          <CardHeader>
            <CardTitle>Website Performance Breakdown</CardTitle>
            <CardDescription>
              Visibility performance across your tracked websites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topWebsites.map((website) => (
                <div key={website.websiteId} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full" />
                      <span className="font-medium">
                        {website.displayName || website.domain}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {website.visibility}% visibility
                    </div>
                  </div>
                  <Progress value={website.visibility} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{website.mentions} mentions</span>
                    <span>{website.sentiment}% sentiment</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }
  )
);

WebsitePerformanceChart.displayName = "WebsitePerformanceChart";

interface SentimentDistributionChartProps {
  sentimentData: { name: string; value: number; color: string }[];
}

export const SentimentDistributionChart = React.memo(
  forwardRef<HTMLDivElement, SentimentDistributionChartProps>(
    ({ sentimentData }, ref) => {
      const COLORS = ["#10B981", "#F59E0B", "#EF4444"]; // green, orange, red

      // Sanitize sentiment data to prevent chart rendering issues
      const sanitizedSentimentData = useMemo(() => {
        return sentimentData.map((item) => ({
          ...item,
          value: sanitizeChartNumber(item.value),
        }));
      }, [sentimentData]);

      // Add development-only logging for validation issues
      useEffect(() => {
        if (process.env.NODE_ENV !== "production" && sentimentData.length > 0) {
          const hasValidationIssues = sentimentData.some(
            (item) =>
              typeof item.value !== "number" ||
              isNaN(item.value) ||
              !isFinite(item.value)
          );

          if (hasValidationIssues) {
            console.warn(
              "⚠️ SentimentDistributionChart: Invalid numeric values detected in sentiment data"
            );
          }
        }
      }, [sentimentData]);

      return (
        <Card ref={ref}>
          <CardHeader>
            <CardTitle>Sentiment Distribution</CardTitle>
            <CardDescription>
              Overall sentiment breakdown across all mentions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sanitizedSentimentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => {
                    // Protect against NaN in label formatter
                    const safePercent = sanitizeChartNumber(percent);
                    return `${name} ${(safePercent * 100).toFixed(0)}%`;
                  }}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sanitizedSentimentData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => {
                    // Protect against NaN in tooltip formatter
                    const safeValue = sanitizeChartNumber(value);
                    return [`${safeValue}%`, "Percentage"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      );
    }
  )
);

SentimentDistributionChart.displayName = "SentimentDistributionChart";

interface MentionTrendChartProps {
  trendData: Array<{
    date: string;
    mentions: number;
    sentiment: number;
  }>;
}

export const MentionTrendChart = React.memo(
  forwardRef<HTMLDivElement, MentionTrendChartProps>(({ trendData }, ref) => {
    // Validate and sanitize chart data to detect NaN/Infinity values
    const sanitizedData = useMemo(() => {
      const validation = validateAndSanitizeChartData(
        trendData as unknown as Record<string, unknown>[],
        ["mentions", "sentiment"]
      );

      if (validation.hasIssues && process.env.NODE_ENV !== "production") {
        console.warn(
          "⚠️ MentionTrendChart: NaN/Infinity detected in trendData:",
          {
            issues: validation.issues,
            originalData: trendData,
            sanitizedData: validation.data,
          }
        );
      }

      return validation.data as unknown as Array<{
        date: string;
        mentions: number;
        sentiment: number;
      }>;
    }, [trendData]);

    return (
      <Card ref={ref}>
        <CardHeader>
          <CardTitle>Mention Trends</CardTitle>
          <CardDescription>
            Track mention volume and sentiment over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sanitizedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis yAxisId="left" orientation="left" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value, name) => [
                  name === "mentions" ? value : `${value}%`,
                  name === "mentions" ? "Mentions" : "Sentiment Score",
                ]}
              />
              <Bar
                yAxisId="left"
                dataKey="mentions"
                fill="hsl(var(--primary))"
                name="Mentions"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="right"
                dataKey="sentiment"
                fill="hsl(var(--secondary))"
                name="Sentiment Score"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer> */}
        </CardContent>
      </Card>
    );
  })
);

MentionTrendChart.displayName = "MentionTrendChart";

interface TopicRadarChartProps {
  topicData: Array<{
    topic: string;
    visibility: number;
    mentions: number;
    sentiment: number;
  }>;
}

export const TopicRadarChart = React.memo(
  forwardRef<HTMLDivElement, TopicRadarChartProps>(({ topicData }, ref) => {
    // Transform and sanitize data for radar chart
    const radarData = useMemo(() => {
      return topicData.slice(0, 6).map((topic) => ({
        topic:
          topic.topic.substring(0, 15) + (topic.topic.length > 15 ? "..." : ""),
        visibility: sanitizeChartNumber(topic.visibility),
        sentiment: sanitizeChartNumber(topic.sentiment),
        mentions: sanitizeChartNumber(
          Math.min(sanitizeChartNumber(topic.mentions) * 10, 100)
        ), // Scale mentions to 0-100
      }));
    }, [topicData]);

    // Add development-only logging for validation issues
    useEffect(() => {
      if (process.env.NODE_ENV !== "production" && topicData.length > 0) {
        const hasValidationIssues = topicData.some(
          (topic) =>
            typeof topic.visibility !== "number" ||
            isNaN(topic.visibility) ||
            typeof topic.sentiment !== "number" ||
            isNaN(topic.sentiment) ||
            typeof topic.mentions !== "number" ||
            isNaN(topic.mentions)
        );

        if (hasValidationIssues) {
          console.warn(
            "⚠️ TopicRadarChart: Invalid numeric values detected in topic data"
          );
        }
      }
    }, [topicData]);

    return (
      <Card ref={ref}>
        <CardHeader>
          <CardTitle>Topic Performance Radar</CardTitle>
          <CardDescription>
            Comprehensive view of topic performance across metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="topic" />
              <PolarRadiusAxis domain={[0, 100]} />
              <Radar
                name="Visibility"
                dataKey="visibility"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
              />
              <Radar
                name="Sentiment"
                dataKey="sentiment"
                stroke="hsl(var(--secondary))"
                fill="hsl(var(--secondary))"
                fillOpacity={0.3}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${value}${name === "mentions" ? "" : "%"}`,
                  name === "mentions" ? "Mentions (scaled)" : name,
                ]}
              />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  })
);

TopicRadarChart.displayName = "TopicRadarChart";

interface QuickStatsProps {
  stats: {
    totalWebsites: number;
    totalTopics: number;
    averageVisibility: number;
    topPerformingTopic: string | null;
  };
}

export const QuickStats = React.memo(
  forwardRef<HTMLDivElement, QuickStatsProps>(({ stats }, ref) => {
    const statCards = [
      {
        title: "Websites Tracked",
        value: stats.totalWebsites,
        description: "Active websites monitored",
      },
      {
        title: "Topics Analyzed",
        value: stats.totalTopics,
        description: "Different topics tracked",
      },
      {
        title: "Average Visibility",
        value: `${stats.averageVisibility}%`,
        description: "Across all websites",
      },
      {
        title: "Top Topic",
        value: stats.topPerformingTopic || "None",
        description: "Best performing topic",
      },
    ];

    return (
      <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.title}</p>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  })
);

QuickStats.displayName = "QuickStats";
