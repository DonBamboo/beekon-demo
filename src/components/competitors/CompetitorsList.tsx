import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Globe, MoreHorizontal, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { CompetitorPerformance } from '@/services/competitorService';
import { CompetitorWithStatus } from '@/hooks/useCompetitorsQuery';
import { CompetitorStatusIndicator } from './CompetitorStatusIndicator';
import { useCompetitorStatus } from '@/hooks/useCompetitorStatus';

interface MarketShareItem {
  name: string;
  normalizedValue: number;
  rawValue: number;
  competitorId?: string;
  mentions?: number;
  avgRank?: number;
  dataType: 'market_share';
}

interface CompetitorsListProps {
  competitorsWithStatus: CompetitorWithStatus[];
  marketShareData: MarketShareItem[];
  performance: CompetitorPerformance[];
  sortBy: 'shareOfVoice' | 'averageRank' | 'mentionCount' | 'sentimentScore';
  confirmDelete: (competitorId: string) => void;
  isDeleting?: boolean;
}

export default function CompetitorsList({
  competitorsWithStatus,
  marketShareData,
  performance,
  sortBy,
  confirmDelete,
  isDeleting = false,
}: CompetitorsListProps) {
  const { getCompetitorStatus } = useCompetitorStatus();

  // Helper function to get market share for a competitor
  const getCompetitorMarketShare = (competitorId: string, competitorName: string): number => {
    // First try to find by competitor ID
    const byId = marketShareData.find(item => item.competitorId === competitorId);
    if (byId) return byId.normalizedValue;
    
    // Fallback to matching by name (excluding "Your Brand")
    const byName = marketShareData.find(item => 
      item.name !== "Your Brand" && 
      (item.name === competitorName || item.name.includes(competitorName))
    );
    if (byName) return byName.normalizedValue;
    
    return 0; // Default if not found
  };

  // Helper function to get performance data for other metrics
  const getCompetitorPerformance = (competitorId: string): CompetitorPerformance | undefined => {
    return performance.find(p => p.competitorId === competitorId);
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return TrendingUp;
      case 'down':
        return TrendingDown;
      default:
        return () => <div className="w-5 h-5" />; // Placeholder for stable
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-success';
      case 'down':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  // Get real-time status for a competitor
  const getCompetitorRealtimeStatus = (competitorId: string) => {
    const statusData = getCompetitorStatus(competitorId);
    // Fallback to legacy status if no real-time status available
    return statusData || null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Tracked Competitors</CardTitle>
            <CardDescription>
              Competitors you're currently monitoring (sorted by {sortBy.replace(/([A-Z])/g, ' $1').toLowerCase()})
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {competitorsWithStatus.length} competitor{competitorsWithStatus.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {competitorsWithStatus.map((competitor) => {
            // Get unified data sources
            const performanceData = getCompetitorPerformance(competitor.id) || competitor.performance;
            const marketShareValue = getCompetitorMarketShare(competitor.id, competitor.competitor_name || competitor.competitor_domain);
            const TrendIcon = performanceData ? getTrendIcon(performanceData.trend) : () => <div className="w-5 h-5" />;
            
            // Get real-time status data
            const realtimeStatus = getCompetitorRealtimeStatus(competitor.id);
            const currentStatus = realtimeStatus?.status || (competitor.analysisStatus === 'in_progress' ? 'analyzing' : competitor.analysisStatus === 'completed' ? 'completed' : 'pending');
            const isAnalyzed = currentStatus === 'completed';
            
            // Debug logging for rank data
            if (performanceData?.averageRank !== null && performanceData?.averageRank !== undefined) {
              // Debug: competitor rank data available
            }
            
            return (
              <div key={competitor.id} className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${!isAnalyzed ? 'opacity-75' : ''} ${currentStatus === 'analyzing' ? 'border-blue-200 bg-blue-50/30' : ''} ${currentStatus === 'failed' ? 'border-red-200 bg-red-50/30' : ''}`}>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-muted rounded-lg">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{competitor.competitor_name || competitor.competitor_domain}</h4>
                      <CompetitorStatusIndicator
                        status={currentStatus as 'pending' | 'analyzing' | 'completed' | 'failed'}
                        progress={realtimeStatus?.progress}
                        errorMessage={realtimeStatus?.errorMessage}
                        size="sm"
                        showProgress={currentStatus === 'analyzing'}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{competitor.competitor_domain}</p>
                    {/* Show analysis timing based on real-time status */}
                    {realtimeStatus?.completedAt && isAnalyzed && (
                      <p className="text-xs text-muted-foreground">
                        Analyzed: {new Date(realtimeStatus.completedAt).toLocaleDateString()}
                      </p>
                    )}
                    {realtimeStatus?.startedAt && currentStatus === 'analyzing' && (
                      <p className="text-xs text-muted-foreground">
                        Started: {new Date(realtimeStatus.startedAt).toLocaleDateString()}
                      </p>
                    )}
                    {/* Fallback to legacy data if no real-time status */}
                    {!realtimeStatus && performanceData?.lastAnalyzed && (
                      <p className="text-xs text-muted-foreground">
                        Last analyzed: {new Date(performanceData.lastAnalyzed).toLocaleDateString()}
                      </p>
                    )}
                    {!isAnalyzed && (
                      <p className="text-xs text-muted-foreground">
                        Added: {new Date(competitor.addedAt).toLocaleDateString()}
                      </p>
                    )}
                    {/* Progress bar for analyzing competitors */}
                    {currentStatus === 'analyzing' && realtimeStatus?.progress !== undefined && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${Math.min(Math.max(realtimeStatus.progress, 0), 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-blue-600 font-medium min-w-0 whitespace-nowrap">
                            {realtimeStatus.progress}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Share of Voice</div>
                    <div className={`font-medium text-lg ${!isAnalyzed ? 'text-muted-foreground' : ''}`}>
                      {marketShareValue.toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Avg Rank</div>
                    <div className={`font-medium text-lg ${!isAnalyzed ? 'text-muted-foreground' : ''}`}>
                      {performanceData?.averageRank !== null && performanceData?.averageRank !== undefined && performanceData.averageRank > 0 
                        ? performanceData.averageRank.toFixed(1) 
                        : 'N/A'}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Mentions</div>
                    <div className={`font-medium text-lg ${!isAnalyzed ? 'text-muted-foreground' : ''}`}>
                      {performanceData?.mentionCount ?? 0}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Sentiment</div>
                    <div className={`font-medium text-lg ${!isAnalyzed ? 'text-muted-foreground' : ''}`}>
                      {performanceData?.sentimentScore ?? 0}%
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground">Trend</div>
                    <div className="flex justify-center">
                      <TrendIcon className={`h-5 w-5 ${performanceData ? getTrendColor(performanceData.trend) : 'text-muted-foreground'}`} />
                    </div>
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={isDeleting}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => confirmDelete(competitor.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {isDeleting ? "Removing..." : "Remove"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}