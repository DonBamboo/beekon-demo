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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { Info, TrendingUp, Award } from "lucide-react";
import { useMemo } from "react";
import { getCompetitorColor, getYourBrandColor, getColorInfo, getCompetitorColorIndex } from "@/lib/color-utils";
import { ColorLegend } from "@/components/ui/color-indicator";

interface ShareOfVoiceData {
  name: string;
  value: number;
  fill: string;
  competitorId?: string;
  mentions?: number;
  avgRank?: number;
}

interface ShareOfVoiceChartProps {
  data: ShareOfVoiceData[];
  dateFilter: "7d" | "30d" | "90d";
}

export default function ShareOfVoiceChart({
  data,
  dateFilter,
}: ShareOfVoiceChartProps) {
  // Enhanced data processing with validation
  const chartData = useMemo(() => {
    // Validate and sanitize data
    const validatedData = data.map((item, index) => {
      // Ensure value is a valid number and not negative
      const sanitizedValue = Math.max(0, isNaN(item.value) ? 0 : item.value);
      
      return {
        ...item,
        value: sanitizedValue,
        fill: item.name === "Your Brand" 
          ? getYourBrandColor()
          : getCompetitorColor(undefined, item.name, index),
      };
    });

    // Check for total percentage validation
    const totalPercentage = validatedData.reduce((sum, item) => sum + item.value, 0);
    if (totalPercentage > 105) { // Allow 5% tolerance for rounding
      console.warn('Share of Voice total exceeds 100%:', {
        total: totalPercentage,
        breakdown: validatedData.map(item => ({ name: item.name, value: item.value }))
      });
    }

    return validatedData;
  }, [data]);

  // Calculate insights
  const insights = useMemo(() => {
    const totalVoice = data.reduce((sum, item) => sum + item.value, 0);
    const yourBrand = data.find(item => item.name === "Your Brand");
    const competitors = data.filter(item => item.name !== "Your Brand");
    const leader = competitors.reduce((prev, current) => 
      prev.value > current.value ? prev : current, competitors[0]
    );

    return {
      totalVoice,
      yourBrandShare: yourBrand?.value || 0,
      leader: leader || null,
      competitorCount: competitors.length,
      isLeading: (yourBrand?.value || 0) > (leader?.value || 0),
    };
  }, [data]);

  // Only show chart if there are competitors to compare against
  const hasCompetitors = data.length > 1 || (data.length === 1 && data[0].name !== "Your Brand");
  
  if (!hasCompetitors) return null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-md">
          <p className="font-medium">{label}</p>
          <p className="text-primary">
            Share of Voice: <span className="font-bold">{payload[0].value}%</span>
          </p>
          {data.mentions && (
            <p className="text-sm text-muted-foreground">
              Mentions: {data.mentions}
            </p>
          )}
          {data.avgRank && (
            <p className="text-sm text-muted-foreground">
              Avg. Rank: #{data.avgRank.toFixed(1)}
            </p>
          )}
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
            <CardTitle className="flex items-center gap-2">
              Share of Voice Comparison
              {insights.isLeading && (
                <Badge variant="outline" className="text-success border-success">
                  <Award className="h-3 w-3 mr-1" />
                  Leading
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              How your brand compares to competitors in AI responses (last{" "}
              {dateFilter})
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Insights Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {insights.yourBrandShare.toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">Your Share</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {insights.competitorCount}
            </div>
            <div className="text-sm text-muted-foreground">Competitors</div>
          </div>
          {insights.leader && (
            <div className="text-center">
              <div className="text-2xl font-bold">
                {insights.leader.value.toFixed(1)}%
              </div>
              <div className="text-sm text-muted-foreground">
                {insights.leader.name} (Leader)
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="text-2xl font-bold flex items-center justify-center gap-1">
              {insights.isLeading ? (
                <TrendingUp className="h-5 w-5 text-success" />
              ) : (
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              )}
              {insights.isLeading ? "1st" : "Behind"}
            </div>
            <div className="text-sm text-muted-foreground">Position</div>
          </div>
        </div>

        {/* Charts Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Detailed Comparison</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, Math.max(100, Math.max(...data.map(d => d.value)) + 10)]} />
                <YAxis dataKey="name" type="category" width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Market Share Distribution</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}%`, "Share of Voice"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Color Legend for Accessibility */}
        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Info className="h-4 w-4" />
            Color Legend
          </h4>
          <ColorLegend 
            items={chartData.map((item, index) => ({
              name: item.name,
              color: item.fill,
              colorName: item.name === "Your Brand" 
                ? "Primary" 
                : (() => {
                    const colorIndex = getCompetitorColorIndex(undefined, item.name, index);
                    return getColorInfo(colorIndex).name;
                  })()
            }))}
          />
        </div>

        {/* Competitive Insights */}
        {insights.leader && !insights.isLeading && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm">Competitive Insight</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {insights.leader.name} is currently leading with {insights.leader.value.toFixed(1)}% 
                  share of voice. You're {(insights.leader.value - insights.yourBrandShare).toFixed(1)} 
                  percentage points behind. Focus on topics where they have lower rankings to close the gap.
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
                <h4 className="font-medium text-sm text-success">Market Leadership</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Congratulations! You're leading the market with {insights.yourBrandShare.toFixed(1)}% 
                  share of voice. Maintain your position by continuing to create high-quality, 
                  relevant content and monitor competitor movements.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
