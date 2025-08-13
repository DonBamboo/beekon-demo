import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { ExportDropdown } from "@/components/ui/export-components";
import { DashboardMetrics } from "@/hooks/useDashboard";
import { Workspace } from "@/types/database";
import { ExportFormat } from "@/lib/export-utils";
import { RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  currentWorkspace: Workspace;
  metrics: DashboardMetrics | null;
  dateFilter: "7d" | "30d" | "90d";
  setDateFilter: (filter: "7d" | "30d" | "90d") => void;
  showAllCharts: boolean;
  setShowAllCharts: (show: boolean) => void;
  isRefreshing: boolean;
  isExporting: boolean;
  hasData: boolean;
  refreshData: () => void;
  handleExportData: (format: ExportFormat) => Promise<void>;
}

export function DashboardHeader({
  currentWorkspace,
  metrics,
  dateFilter,
  setDateFilter,
  showAllCharts,
  setShowAllCharts,
  isRefreshing,
  isExporting,
  hasData,
  refreshData,
  handleExportData,
}: DashboardHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your brand's AI visibility performance
          <span className="ml-2">
            • {currentWorkspace.name}
            {currentWorkspace.credits_remaining !== null && (
              <span className="ml-1 text-sm">
                ({currentWorkspace.credits_remaining} credits remaining)
              </span>
            )}
            {metrics && (
              <span className="ml-1 text-sm">
                • {metrics.activeWebsites} websites, {metrics.totalAnalyses}{" "}
                analyses
              </span>
            )}
          </span>
        </p>
      </div>
      <div className="flex items-center space-x-2">
        <div className="flex gap-1 mr-2">
          {["7d", "30d", "90d"].map((period) => (
            <Button
              key={period}
              variant={dateFilter === period ? "default" : "ghost"}
              size="sm"
              onClick={() => setDateFilter(period as "7d" | "30d" | "90d")}
              disabled={isRefreshing}
            >
              {period}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAllCharts(!showAllCharts)}
          disabled={!hasData}
        >
          {showAllCharts ? "Hide" : "Show"} Details
        </Button>
        <LoadingButton
          variant="outline"
          size="sm"
          loading={isRefreshing}
          loadingText="Refreshing..."
          onClick={refreshData}
          icon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh
        </LoadingButton>
        <ExportDropdown
          onExport={handleExportData}
          isLoading={isExporting}
          disabled={!hasData}
          formats={["pdf", "csv", "json", "word"]}
          data={metrics ? [metrics as unknown as Record<string, unknown>] : []}
          showEstimatedSize={true}
        />
      </div>
    </div>
  );
}