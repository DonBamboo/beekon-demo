import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AnalysisAnalytics } from "@/services/analyticsService";
import type { UIAnalysisResult } from "@/types/database";
import { BarChart3, Target, TrendingDown, TrendingUp, Zap } from "lucide-react";

interface AnalysisVisualizationProps {
  analytics: AnalysisAnalytics;
}

export function AnalysisVisualization({
  analytics,
}: AnalysisVisualizationProps) {
  // Use pre-calculated analytics data
  const {
    totalResults,
    totalMentioned,
    mentionRate,
    averageConfidence,
    llmPerformance,
    topPerformingTopics,
  } = analytics;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {/* Overall Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Overall Performance</span>
          </CardTitle>
          <CardDescription>Brand mention statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Mention Rate</span>
            <Badge variant="outline">{mentionRate.toFixed(1)}%</Badge>
          </div>
          <Progress value={mentionRate} className="w-full" />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Avg. Confidence</span>
            <Badge variant="outline">{averageConfidence.toFixed(1)}%</Badge>
          </div>
          <Progress value={averageConfidence} className="w-full" />

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center space-x-1">
              <TrendingUp className="h-3 w-3 text-success" />
              <span>{totalMentioned} mentions</span>
            </div>
            <div className="flex items-center space-x-1">
              <TrendingDown className="h-3 w-3 text-muted-foreground" />
              <span>{totalResults - totalMentioned} no mentions</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LLM Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>LLM Performance</span>
          </CardTitle>
          <CardDescription>Performance across AI models</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {llmPerformance.map((llmStats) => (
            <div key={llmStats.provider} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">
                  {llmStats.provider}
                </span>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    {llmStats.totalResults} total
                  </Badge>
                  {llmStats.averageRank > 0 && (
                    <Badge variant="outline" className="text-xs">
                      Avg. #{llmStats.averageRank.toFixed(1)}
                    </Badge>
                  )}
                </div>
              </div>
              <Progress value={llmStats.mentionRate} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {llmStats.mentionRate.toFixed(1)}% mention rate,{" "}
                {llmStats.averageConfidence.toFixed(1)}% confidence
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top Topics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Top Topics</span>
          </CardTitle>
          <CardDescription>Most analyzed topics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {topPerformingTopics.slice(0, 5).map((topicData) => (
            <div key={topicData.topic} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">
                  {topicData.topic}
                </span>
                <Badge variant="outline" className="text-xs">
                  {topicData.mentionRate.toFixed(1)}% mention rate
                </Badge>
              </div>
              <Progress value={topicData.mentionRate} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {topicData.resultCount} results, avg rank #
                {topicData.averageRank.toFixed(1)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Sentiment Chart Component
export function SentimentChart({ results }: { results: UIAnalysisResult[] }) {
  const sentimentCounts = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  results.forEach((result: UIAnalysisResult) => {
    result.llm_results.forEach((llm: UIAnalysisResult["llm_results"][0]) => {
      if (llm.is_mentioned && llm.sentiment_score !== null) {
        if (llm.sentiment_score > 0.1) {
          sentimentCounts.positive++;
        } else if (llm.sentiment_score < -0.1) {
          sentimentCounts.negative++;
        } else {
          sentimentCounts.neutral++;
        }
      }
    });
  });

  const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sentiment Distribution</CardTitle>
        <CardDescription>Overall sentiment across all mentions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(sentimentCounts).map(([sentiment, count]) => (
          <div key={sentiment} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium capitalize">
                {sentiment}
              </span>
              <Badge
                variant="outline"
                className={`text-xs ${
                  sentiment === "positive"
                    ? "border-success text-success"
                    : sentiment === "negative"
                    ? "border-destructive text-destructive"
                    : "border-warning text-warning"
                }`}
              >
                {count} ({((count / total) * 100).toFixed(1)}%)
              </Badge>
            </div>
            <Progress value={(count / total) * 100} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Ranking Performance Chart
export function RankingChart({ results }: { results: UIAnalysisResult[] }) {
  const rankingData = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    "5+": 0,
  };

  results.forEach((result: UIAnalysisResult) => {
    result.llm_results.forEach((llm: UIAnalysisResult["llm_results"][0]) => {
      if (llm.is_mentioned && llm.rank_position) {
        if (llm.rank_position <= 5) {
          rankingData[llm.rank_position as keyof typeof rankingData]++;
        } else {
          rankingData["5+"]++;
        }
      }
    });
  });

  const totalRanked = Object.values(rankingData).reduce((a, b) => a + b, 0);

  if (totalRanked === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Ranking Distribution</CardTitle>
        <CardDescription>Position rankings across all mentions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(rankingData).map(([rank, count]) => (
          <div key={rank} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">#{rank}</span>
              <Badge variant="outline" className="text-xs">
                {count} mentions
              </Badge>
            </div>
            <Progress value={(count / totalRanked) * 100} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
