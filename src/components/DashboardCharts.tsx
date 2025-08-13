import React, { forwardRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { LLMPerformance, WebsitePerformance } from "@/services/dashboardService";
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

interface LLMPerformanceChartProps {
  llmData: LLMPerformance[];
}

export const LLMPerformanceChart = React.memo(forwardRef<HTMLDivElement, LLMPerformanceChartProps>(({ llmData }, ref) => {

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
          <BarChart data={llmData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="provider" />
            <YAxis domain={[0, 100]} />
            <Tooltip 
              formatter={(value, name) => [
                `${value}%`,
                name === "mentionRate" ? "Mention Rate" : "Sentiment Score"
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
}));

LLMPerformanceChart.displayName = "LLMPerformanceChart";

interface WebsitePerformanceChartProps {
  websiteData: WebsitePerformance[];
}

export const WebsitePerformanceChart = React.memo(forwardRef<HTMLDivElement, WebsitePerformanceChartProps>(({ websiteData }, ref) => {
  const topWebsites = websiteData.slice(0, 5); // Show top 5 websites

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
}));

WebsitePerformanceChart.displayName = "WebsitePerformanceChart";

interface SentimentDistributionChartProps {
  sentimentData: { name: string; value: number; color: string }[];
}

export const SentimentDistributionChart = React.memo(forwardRef<HTMLDivElement, SentimentDistributionChartProps>(({ sentimentData }, ref) => {
  const COLORS = ['#10B981', '#F59E0B', '#EF4444']; // green, orange, red

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
              data={sentimentData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {sentimentData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [`${value}%`, "Percentage"]} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}));

SentimentDistributionChart.displayName = "SentimentDistributionChart";

interface MentionTrendChartProps {
  trendData: Array<{
    date: string;
    mentions: number;
    sentiment: number;
  }>;
}

export const MentionTrendChart = React.memo(forwardRef<HTMLDivElement, MentionTrendChartProps>(({ trendData }, ref) => {
  return (
    <Card ref={ref}>
      <CardHeader>
        <CardTitle>Mention Trends</CardTitle>
        <CardDescription>
          Track mention volume and sentiment over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendData}>
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
                name === "mentions" ? "Mentions" : "Sentiment Score"
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
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}));

MentionTrendChart.displayName = "MentionTrendChart";

interface TopicRadarChartProps {
  topicData: Array<{
    topic: string;
    visibility: number;
    mentions: number;
    sentiment: number;
  }>;
}

export const TopicRadarChart = React.memo(forwardRef<HTMLDivElement, TopicRadarChartProps>(({ topicData }, ref) => {
  // Transform data for radar chart
  const radarData = topicData.slice(0, 6).map(topic => ({
    topic: topic.topic.substring(0, 15) + (topic.topic.length > 15 ? '...' : ''),
    visibility: topic.visibility,
    sentiment: topic.sentiment,
    mentions: Math.min(topic.mentions * 10, 100), // Scale mentions to 0-100
  }));

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
                name === "mentions" ? "Mentions (scaled)" : name
              ]}
            />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}));

TopicRadarChart.displayName = "TopicRadarChart";

interface QuickStatsProps {
  stats: {
    totalWebsites: number;
    totalTopics: number;
    averageVisibility: number;
    topPerformingTopic: string | null;
  };
}

export const QuickStats = React.memo(forwardRef<HTMLDivElement, QuickStatsProps>(({ stats }, ref) => {
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
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}));

QuickStats.displayName = "QuickStats";