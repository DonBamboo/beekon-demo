import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { CompetitorTimeSeriesData } from '@/services/competitorService';
import {
  getCompetitorFixedColor,
  registerCompetitorsInFixedSlots,
  validateAllColorAssignments,
  autoFixColorConflicts
} from '@/lib/color-utils';
import { sanitizeChartNumber } from '@/utils/chartDataValidation';
import { Info } from 'lucide-react';

interface TimeSeriesChartProps {
  data: CompetitorTimeSeriesData[];
}

export default function TimeSeriesChart({ data }: TimeSeriesChartProps) {
  // Get competitors from first data point for analysis (before early return)
  const competitorsList = React.useMemo(() => 
    data?.[0]?.competitors || [], 
    [data]
  );
  
  // Calculate benchmarks and trends with comprehensive validation
  const marketAverage = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map(point => {
      // Validate competitors array exists and has content
      if (!point.competitors || point.competitors.length === 0) {
        return {
          date: point.date,
          avgShareOfVoice: 0,
          avgRank: 0,
          avgMentions: 0
        };
      }

      // Calculate averages with NaN protection
      const avgShareOfVoice = sanitizeChartNumber(
        point.competitors.reduce((sum, comp) =>
          sum + sanitizeChartNumber(comp.shareOfVoice), 0
        ) / point.competitors.length
      );

      const avgRank = sanitizeChartNumber(
        point.competitors.reduce((sum, comp) =>
          sum + sanitizeChartNumber(comp.averageRank), 0
        ) / point.competitors.length
      );

      const avgMentions = sanitizeChartNumber(
        point.competitors.reduce((sum, comp) =>
          sum + sanitizeChartNumber(comp.mentionCount), 0
        ) / point.competitors.length
      );

      return {
        date: point.date,
        avgShareOfVoice,
        avgRank,
        avgMentions
      };
    });
  }, [data]);

  // Find top performer for each metric with comprehensive validation
  const topPerformer = React.useMemo(() => {
    if (!data || data.length === 0) return null;
    const latestPoint = data[data.length - 1];
    if (!latestPoint || !latestPoint.competitors || latestPoint.competitors.length === 0) return null;

    const topByShareOfVoice = latestPoint.competitors.reduce((prev, current) => {
      const prevValue = sanitizeChartNumber(prev.shareOfVoice);
      const currentValue = sanitizeChartNumber(current.shareOfVoice);
      return (currentValue > prevValue) ? current : prev;
    });

    return {
      shareOfVoice: sanitizeChartNumber(topByShareOfVoice.shareOfVoice),
      name: topByShareOfVoice.name
    };
  }, [data]);

  // Validate color assignments to ensure consistency across all competitor components
  const colorValidation = validateAllColorAssignments();
  if (!colorValidation.isValid) {
    autoFixColorConflicts({ logResults: false });
  }

  // Use the same competitors list for consistency

  // Register all competitors in fixed color slots for predictable coloring
  React.useEffect(() => {
    if (competitorsList.length > 0) {
      registerCompetitorsInFixedSlots(
        competitorsList.map(comp => ({
          competitorId: comp.competitorId,
          name: comp.name
        }))
      );
    }
  }, [competitorsList]);

  // Sanitize all data before rendering to prevent Recharts errors
  const sanitizedData = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map(point => ({
      ...point,
      competitors: point.competitors?.map(comp => ({
        ...comp,
        shareOfVoice: sanitizeChartNumber(comp.shareOfVoice),
        averageRank: sanitizeChartNumber(comp.averageRank),
        mentionCount: sanitizeChartNumber(comp.mentionCount)
      })) || []
    }));
  }, [data]);

  // Add development-only logging for validation issues
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && data && data.length > 0) {
      const hasValidationIssues = data.some(point =>
        point.competitors?.some(comp =>
          typeof comp.shareOfVoice !== 'number' || isNaN(comp.shareOfVoice) ||
          typeof comp.averageRank !== 'number' || isNaN(comp.averageRank) ||
          typeof comp.mentionCount !== 'number' || isNaN(comp.mentionCount)
        )
      );

      if (hasValidationIssues) {
        console.warn('⚠️ TimeSeriesChart: Invalid numeric values detected in competitor data');
      }
    }
  }, [data]);

  if (!sanitizedData || sanitizedData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Competitive Performance Dashboard
            </CardTitle>
            <CardDescription>
              Multi-metric analysis with benchmarks and trend indicators
            </CardDescription>
          </div>
          {topPerformer && (
            <div className="text-right">
              <Badge variant="outline" className="flex items-center gap-1">
                <Target className="h-3 w-3" />
                Market Leader: {topPerformer.name}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {topPerformer.shareOfVoice.toFixed(1)}% Share of Voice
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="shareOfVoice" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="shareOfVoice">Share of Voice</TabsTrigger>
            <TabsTrigger value="ranking">Average Ranking</TabsTrigger>
            <TabsTrigger value="mentions">Mention Count</TabsTrigger>
          </TabsList>

          <TabsContent value="shareOfVoice" className="space-y-4">
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart
                data={sanitizedData}
                margin={{ bottom: 60, left: 20, right: 20, top: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  height={60}
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis domain={[0, 100]} />
                
                {/* Market Average Reference Line - simplified without data prop */}
                <ReferenceLine 
                  y={marketAverage[marketAverage.length - 1]?.avgShareOfVoice || 50}
                  stroke="#64748b"
                  strokeDasharray="5 5"
                  label="Market Avg"
                />
                
                {/* Top Performer Reference Line */}
                {topPerformer && (
                  <ReferenceLine 
                    y={topPerformer.shareOfVoice}
                    stroke="#22c55e"
                    strokeDasharray="3 3"
                    label="Top Performer"
                  />
                )}
                
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                />
                
                {/* Competitor Lines */}
                {competitorsList.map((comp, index) => {
                  const color = getCompetitorFixedColor({
                    competitorId: comp.competitorId,
                    name: comp.name
                  });
                  
                  // Generate robust key with fallback
                  const uniqueKey = comp.competitorId || comp.name || `competitor-share-${index}`;
                  
                  return (
                    <Line 
                      key={`share-${uniqueKey}`}
                      type="monotone" 
                      dataKey={`competitors[${index}].shareOfVoice`}
                      stroke={color}
                      strokeWidth={2}
                      name={comp.name}
                      dot={{ r: 3 }}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="ranking" className="space-y-4">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart
                data={sanitizedData}
                margin={{ bottom: 60, left: 20, right: 20, top: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  height={60}
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis domain={[0, 10]} reversed />
                
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value, name) => [`Rank ${Number(value).toFixed(1)}`, name]}
                />
                
                {competitorsList.map((comp, index) => {
                  const color = getCompetitorFixedColor({
                    competitorId: comp.competitorId,
                    name: comp.name
                  });
                  
                  // Generate robust key with fallback
                  const uniqueKey = comp.competitorId || comp.name || `competitor-rank-${index}`;
                  
                  return (
                    <Line 
                      key={`rank-${uniqueKey}`}
                      type="monotone" 
                      dataKey={`competitors[${index}].averageRank`}
                      stroke={color}
                      strokeWidth={2}
                      name={comp.name}
                      dot={{ r: 3 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="mentions" className="space-y-4">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart
                data={sanitizedData}
                margin={{ bottom: 60, left: 20, right: 20, top: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString()}
                  height={60}
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis />
                
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value, name) => [`${value} mentions`, name]}
                />
                
                {competitorsList.map((comp, index) => {
                  const color = getCompetitorFixedColor({
                    competitorId: comp.competitorId,
                    name: comp.name
                  });
                  
                  // Generate robust key with fallback
                  const uniqueKey = comp.competitorId || comp.name || `competitor-mentions-${index}`;
                  
                  return (
                    <Line 
                      key={`mentions-${uniqueKey}`}
                      type="monotone" 
                      dataKey={`competitors[${index}].mentionCount`}
                      stroke={color}
                      strokeWidth={2}
                      name={comp.name}
                      dot={{ r: 3 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>

        {/* Enhanced Color Legend with Performance Indicators */}
        {competitorsList.length > 0 && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Competitor Performance Summary
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {competitorsList.map((comp, index) => {                
                const color = getCompetitorFixedColor({
                  competitorId: comp.competitorId,
                  name: comp.name
                });

                const latestData = sanitizedData[sanitizedData.length - 1]?.competitors.find(c => c.competitorId === comp.competitorId);
                const prevData = sanitizedData[sanitizedData.length - 2]?.competitors.find(c => c.competitorId === comp.competitorId);

                const trend = latestData && prevData ?
                  (sanitizeChartNumber(latestData.shareOfVoice) > sanitizeChartNumber(prevData.shareOfVoice) ? 'up' :
                   sanitizeChartNumber(latestData.shareOfVoice) < sanitizeChartNumber(prevData.shareOfVoice) ? 'down' : 'stable') : 'stable';
                
                // Generate robust key with fallback
                const uniqueKey = comp.competitorId || comp.name || `competitor-summary-${index}`;
                
                return (
                  <div key={`summary-${uniqueKey}`} className="flex items-center gap-2 p-2 rounded border">
                    <div 
                      className="w-3 h-3 rounded-sm flex-shrink-0" 
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium truncate">{comp.name}</p>
                        {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                        {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                      </div>
                      {latestData && (
                        <p className="text-xs text-muted-foreground">
                          {sanitizeChartNumber(latestData.shareOfVoice).toFixed(1)}% • Rank {sanitizeChartNumber(latestData.averageRank).toFixed(1)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}