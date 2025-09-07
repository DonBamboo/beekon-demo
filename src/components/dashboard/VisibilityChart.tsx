import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

interface VisibilityChartProps {
  timeSeriesData: Array<{
    date: string;
    visibility: number;
  }>;
  dateFilter: string;
  hasData: boolean;
  onExportData: (format: "csv") => void;
}

export const VisibilityChart = forwardRef<HTMLDivElement, VisibilityChartProps>(({
  timeSeriesData,
  dateFilter,
  hasData,
  onExportData,
}, ref) => {
  if (timeSeriesData.length === 0) return null;

  return (
    <Card ref={ref}>
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
              onClick={() => onExportData("csv")}
              disabled={!hasData}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart 
            data={timeSeriesData}
            margin={{ bottom: 60, left: 20, right: 20, top: 20 }}
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
  );
});

VisibilityChart.displayName = "VisibilityChart";