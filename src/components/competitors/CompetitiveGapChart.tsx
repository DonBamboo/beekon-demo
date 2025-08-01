import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
} from "recharts";
import { TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react";
import { CompetitorAnalytics, type CompetitiveGapAnalysis } from "@/services/competitorService";
import { useMemo } from "react";

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
  // Enhanced data processing with validation
  const processedData = useMemo(() => {
    if (!gapAnalysis || gapAnalysis.length === 0) return null;

    // Validate gap analysis data
    const validatedGapAnalysis = gapAnalysis.map(gap => ({
      ...gap,
      yourBrandScore: Math.max(0, Math.min(100, isNaN(gap.yourBrandScore) ? 0 : gap.yourBrandScore)),
      competitorData: gap.competitorData.map(comp => ({
        ...comp,
        score: Math.max(0, Math.min(100, isNaN(comp.score) ? 0 : comp.score)),
        totalMentions: Math.max(0, isNaN(comp.totalMentions) ? 0 : comp.totalMentions)
      }))
    }));

    // Generate bar chart data with individual competitors
    const barChartData = validatedGapAnalysis.map(gap => {
      const data: Record<string, number | string> = {
        topic: gap.topicName,
        yourBrand: gap.yourBrandScore,
      };
      gap.competitorData.forEach((comp, index) => {
        data[`competitor${index + 1}`] = comp.score;
        data[`competitor${index + 1}_name`] = comp.competitor_name;
      });
      return data;
    });

    // Get all unique competitor keys for dynamic rendering
    const competitorKeys = new Set<string>();
    barChartData.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key.startsWith('competitor') && key.endsWith('_name')) {
          const competitorKey = key.replace('_name', '');
          competitorKeys.add(competitorKey);
        }
      });
    });

    // Create competitor info array for rendering
    const competitorInfo = Array.from(competitorKeys).map((key, index) => {
      // Get competitor name from first data point that has this competitor
      const sampleData = barChartData.find(item => item[`${key}_name`]);
      return {
        key,
        name: sampleData?.[`${key}_name`] as string || `Competitor ${index + 1}`,
        colorIndex: (index % 4) + 2 // Use chart-2 to chart-5
      };
    });

    // Radar chart data with individual competitors
    const radarData = validatedGapAnalysis.map(gap => {
      const data: Record<string, number | string> = {
        topic: gap.topicName,
        yourBrand: gap.yourBrandScore,
      };
      gap.competitorData.forEach((comp, index) => {
        data[`competitor${index + 1}`] = comp.score;
      });
      return data;
    });

    // Gap analysis with classifications using validated data
    const gapClassification = validatedGapAnalysis.map(gap => {
      const avgCompetitor = gap.competitorData.length > 0 
        ? gap.competitorData.reduce((sum, comp) => sum + comp.score, 0) / gap.competitorData.length
        : 0;
      const gapSize = gap.yourBrandScore - avgCompetitor;
      
      return {
        ...gap,
        avgCompetitor,
        gapSize,
        gapType: gapSize > 10 ? 'advantage' : gapSize < -10 ? 'opportunity' : 'competitive',
        priority: Math.abs(gapSize) > 20 ? 'high' : Math.abs(gapSize) > 10 ? 'medium' : 'low',
      };
    });

    // Opportunity matrix data using validated data
    const opportunityMatrix = validatedGapAnalysis.map(gap => ({
      topic: gap.topicName,
      x: gap.competitorData.length > 0 
        ? gap.competitorData.reduce((sum, comp) => sum + comp.score, 0) / gap.competitorData.length
        : 0, // Market competitiveness
      y: gap.yourBrandScore, // Your performance
      size: gap.competitorData.reduce((sum, comp) => sum + comp.totalMentions, 0), // Market size
    }));

    return {
      barChartData,
      competitorInfo,
      radarData,
      gapClassification,
      opportunityMatrix,
    };
  }, [gapAnalysis]);

  // Calculate insights
  const insights = useMemo(() => {
    if (!processedData) return null;

    const opportunities = processedData.gapClassification.filter(gap => gap.gapType === 'opportunity');
    const advantages = processedData.gapClassification.filter(gap => gap.gapType === 'advantage');
    const highPriorityGaps = processedData.gapClassification.filter(gap => gap.priority === 'high');

    return {
      totalTopics: gapAnalysis.length,
      opportunities: opportunities.length,
      advantages: advantages.length,
      highPriorityGaps: highPriorityGaps.length,
      biggestOpportunity: opportunities.reduce((prev, current) => 
        Math.abs(prev.gapSize) > Math.abs(current.gapSize) ? prev : current, 
        opportunities[0]
      ),
      strongestAdvantage: advantages.reduce((prev, current) => 
        prev.gapSize > current.gapSize ? prev : current, 
        advantages[0]
      ),
    };
  }, [processedData, gapAnalysis]);

  // Only show chart if there are competitors and meaningful data
  if (!processedData || !analytics || analytics.totalCompetitors === 0) return null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg p-3 shadow-md" role="tooltip">
          <p className="font-medium mb-2" aria-label={`Topic: ${label}`}>{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm" 
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                <span className="text-sm" aria-label={`${entry.name}: ${entry.value.toFixed(1)} percent`}>
                  <span className="font-medium">{entry.name}:</span> {entry.value.toFixed(1)}%
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
              Topic-by-topic comparison with your competitors (last {dateFilter})
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
              <div className="text-sm text-muted-foreground">Topics Analyzed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-500">{insights.opportunities}</div>
              <div className="text-sm text-muted-foreground">Opportunities</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{insights.advantages}</div>
              <div className="text-sm text-muted-foreground">Advantages</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{insights.highPriorityGaps}</div>
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
            <div role="img" aria-label="Bar chart showing competitive gap analysis across topics">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                  data={processedData.barChartData}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="topic" 
                    angle={-45} 
                    textAnchor="end" 
                    height={100}
                    aria-label="Topics"
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    aria-label="Performance score percentage"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="yourBrand"
                    name="Your Brand"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                  {processedData.competitorInfo.map((competitor, index) => (
                    <Bar
                      key={competitor.key}
                      dataKey={competitor.key}
                      name={competitor.name}
                      fill={`hsl(var(--chart-${competitor.colorIndex}))`}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="radar" className="space-y-4">
            <div role="img" aria-label="Radar chart showing competitive performance across all topics">
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart 
                  data={processedData.radarData}
                  accessibilityLayer
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="topic" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar
                    name="Your Brand"
                    dataKey="yourBrand"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                  {processedData.competitorInfo.map((competitor, index) => (
                    <Radar
                      key={competitor.key}
                      name={competitor.name}
                      dataKey={competitor.key}
                      stroke={`hsl(var(--chart-${competitor.colorIndex}))`}
                      fill={`hsl(var(--chart-${competitor.colorIndex}))`}
                      fillOpacity={0.2}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="gaps" className="space-y-4">
            <div className="space-y-3">
              {processedData.gapClassification.map((gap, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    gap.gapType === 'advantage' 
                      ? 'bg-success/10 border-success/20' 
                      : gap.gapType === 'opportunity'
                      ? 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800'
                      : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {gap.gapType === 'advantage' ? (
                          <TrendingUp className="h-4 w-4 text-success" />
                        ) : gap.gapType === 'opportunity' ? (
                          <Target className="h-4 w-4 text-orange-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-muted-foreground" />
                        )}
                        <h4 className="font-medium">{gap.topicName}</h4>
                      </div>
                      <Badge 
                        variant={
                          gap.priority === 'high' ? 'destructive' :
                          gap.priority === 'medium' ? 'default' : 'outline'
                        }
                        className="text-xs"
                      >
                        {gap.priority} priority
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        Gap: {gap.gapSize > 0 ? '+' : ''}{gap.gapSize.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        You: {gap.yourBrandScore.toFixed(1)}% | Avg: {gap.avgCompetitor.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="matrix" className="space-y-4">
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                This matrix shows topics plotted by market competitiveness (x-axis) vs. your performance (y-axis). 
                Bubble size represents total market mentions.
              </p>
            </div>
            <div role="img" aria-label="Opportunity matrix scatter chart showing topics by market competitiveness versus your performance">
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart 
                  data={processedData.opportunityMatrix}
                  accessibilityLayer
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    domain={[0, 100]}
                    name="Market Competitiveness"
                    aria-label="Market Competitiveness percentage"
                    label={{ value: 'Market Competitiveness (%)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    domain={[0, 100]}
                    name="Your Performance"
                    aria-label="Your Performance percentage"
                    label={{ value: 'Your Performance (%)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'size' ? `${value} mentions` : `${value}%`,
                      name === 'x' ? 'Market Competitiveness' : 
                      name === 'y' ? 'Your Performance' : 'Market Size'
                    ]}
                    labelFormatter={(label, payload) => {
                      const data = payload?.[0]?.payload;
                      return data ? `Topic: ${data.topic}` : label;
                    }}
                  />
                  <Scatter name="Topics" dataKey="y" fill="hsl(var(--primary))">
                    {processedData.opportunityMatrix.map((entry, index) => (
                      <Cell key={`cell-${index}`} />
                    ))}
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
                      <span className="font-medium">{insights.biggestOpportunity.topicName}</span> shows 
                      the largest gap ({Math.abs(insights.biggestOpportunity.gapSize).toFixed(1)} percentage points). 
                      Focus your content strategy here for maximum impact.
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
                    <h4 className="font-medium text-sm text-success">Strongest Advantage</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      You're leading in <span className="font-medium">{insights.strongestAdvantage.topicName}</span> 
                      by {insights.strongestAdvantage.gapSize.toFixed(1)} percentage points. 
                      Leverage this strength to reinforce your market position.
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
