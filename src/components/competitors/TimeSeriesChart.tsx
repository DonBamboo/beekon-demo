import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CompetitorTimeSeriesData } from '@/services/competitorService';
import { 
  getCompetitorColorStandardized,
  getCompetitorColorIndexStandardized,
  getColorInfo, 
  registerCompetitorsGlobally,
  getGlobalStableIndex,
  validateAllColorAssignments, 
  autoFixColorConflicts 
} from '@/lib/color-utils';
import { ColorLegend } from '@/components/ui/color-indicator';
import { Info } from 'lucide-react';

interface TimeSeriesChartProps {
  data: CompetitorTimeSeriesData[];
}

export default function TimeSeriesChart({ data }: TimeSeriesChartProps) {
  if (!data || data.length === 0) return null;

  // Validate color assignments to ensure consistency across all competitor components
  const colorValidation = validateAllColorAssignments();
  if (!colorValidation.isValid) {
    autoFixColorConflicts({ logResults: false });
  }

  // Get competitors from first data point for legend
  const competitors = data[0]?.competitors || [];

  // Register all competitors in global registry for consistent coloring
  registerCompetitorsGlobally(
    competitors.map(comp => ({
      competitorId: comp.competitorId,
      name: comp.name
    }))
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Competitive Performance Over Time</CardTitle>
        <CardDescription>
          Share of voice trends for you and your competitors
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart 
            data={data}
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
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value, name) => [`${value}%`, name]}
            />
            {competitors.map((comp, index) => {
              // Get global stable index for consistent coloring across all charts
              const globalStableIndex = getGlobalStableIndex({
                competitorId: comp.competitorId,
                name: comp.name
              });
              
              const color = getCompetitorColorStandardized({
                competitorId: comp.competitorId,
                name: comp.name
              }, globalStableIndex);
              
              return (
                <Line 
                  key={comp.competitorId}
                  type="monotone" 
                  dataKey={`competitors[${index}].shareOfVoice`}
                  stroke={color}
                  strokeWidth={2}
                  name={comp.name}
                  dot={{ r: 3 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>

        {/* Color Legend for Accessibility */}
        {competitors.length > 0 && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Color Legend
            </h4>
            <ColorLegend 
              items={competitors.map((comp) => {
                // Get global stable index for consistent color legend names
                const globalStableIndex = getGlobalStableIndex({
                  competitorId: comp.competitorId,
                  name: comp.name
                });
                
                const colorIndex = getCompetitorColorIndexStandardized({
                  competitorId: comp.competitorId,
                  name: comp.name
                }, globalStableIndex);
                
                const color = getCompetitorColorStandardized({
                  competitorId: comp.competitorId,
                  name: comp.name
                }, globalStableIndex);
                
                return {
                  name: comp.name,
                  color: color,
                  colorName: getColorInfo(colorIndex).name
                };
              })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}