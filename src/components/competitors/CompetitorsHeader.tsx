import { LoadingButton } from "@/components/ui/loading-button";
import { Button } from "@/components/ui/button";
import { ExportDropdown } from "@/components/ui/export-components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Globe } from "lucide-react";
import { ExportFormat } from "@/types/database";
import { useSelectedWebsite } from "@/hooks/appStateHooks";

interface CompetitorsHeaderProps {
  totalCompetitors: number;
  activeCompetitors: number;
  dateFilter: "7d" | "30d" | "90d";
  // sortBy: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore"; // Currently unused
  isRefreshing: boolean;
  hasData: boolean;
  isAddDialogOpen: boolean;
  competitorDomain: string;
  competitorName: string;
  isAdding: boolean;
  websitesLoading: boolean;
  setDateFilter: (value: "7d" | "30d" | "90d") => void;
  // setSortBy: (value: "shareOfVoice" | "averageRank" | "mentionCount" | "sentimentScore") => void; // Currently unused
  setIsAddDialogOpen: (value: boolean) => void;
  setCompetitorDomain: (value: string) => void;
  setCompetitorName: (value: string) => void;
  refreshData: () => void;
  handleAddCompetitor: () => void;
  isExporting: boolean;
  competitorsData: unknown[];
  handleExportData: (format: ExportFormat) => Promise<void>;
}

export default function CompetitorsHeader({
  totalCompetitors,
  activeCompetitors,
  dateFilter,
  // sortBy, // Currently unused
  isRefreshing,
  hasData,
  isAddDialogOpen,
  competitorDomain,
  competitorName,
  isAdding,
  websitesLoading,
  setDateFilter,
  // setSortBy, // Currently unused
  setIsAddDialogOpen,
  setCompetitorDomain,
  setCompetitorName,
  refreshData,
  handleAddCompetitor,
  isExporting,
  competitorsData,
  handleExportData,
}: CompetitorsHeaderProps) {
  // Use global website selection state
  const { selectedWebsiteId, setSelectedWebsite, websites } =
    useSelectedWebsite();
  return (
    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
      <div>
        <h1 className="text-3xl font-bold">Competitors</h1>
        <p className="text-muted-foreground flex flex-col">
          Monitor your competitive landscape in AI responses
          {totalCompetitors > 0 && (
            <span>
              {totalCompetitors} competitors tracked • {activeCompetitors}{" "}
              active
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Website Selector - Primary control */}
        <Select
          value={selectedWebsiteId || ""}
          onValueChange={(value) => {
            // Optimistic website change for instant UI feedback
            // Immediate optimistic update - UI responds instantly
            setSelectedWebsite(value);
          }}
          disabled={websitesLoading || websites.length === 0}
        >
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <Globe className="h-4 w-4 mr-2" />
                <SelectValue
                  placeholder={
                    websitesLoading
                      ? "Loading websites..."
                      : websites.length === 0
                      ? "No websites available"
                      : "Select website..."
                  }
                >
                  {selectedWebsiteId && websites.length > 0 && (
                    <span className="truncate">
                      {websites.find((w) => w.id === selectedWebsiteId)
                        ?.display_name ||
                        websites.find((w) => w.id === selectedWebsiteId)
                          ?.domain ||
                        "Selected website"}
                    </span>
                  )}
                </SelectValue>
              </div>
              {(isRefreshing || (websitesLoading && websites.length === 0)) && (
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </SelectTrigger>
          <SelectContent>
            {websites.length > 0 ? (
              websites.map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {website.display_name || website.domain}
                      </span>
                      {website.display_name && (
                        <span className="text-sm text-muted-foreground">
                          {website.domain}
                        </span>
                      )}
                    </div>
                    <Badge
                      variant={website.is_active ? "default" : "secondary"}
                      className="ml-2"
                    >
                      {website.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground">
                No websites available. Please add a website first.
              </div>
            )}
          </SelectContent>
        </Select>

        {/* Filters Group */}
        <div className="flex items-center gap-1 border-l border-border pl-2">
          <div className="flex gap-1">
            {(["7d", "30d", "90d"] as const).map((period) => (
              <Button
                key={period}
                variant={dateFilter === period ? "default" : "ghost"}
                size="sm"
                onClick={() => setDateFilter(period)}
                disabled={isRefreshing}
                className={
                  isRefreshing && dateFilter !== period ? "opacity-50" : ""
                }
              >
                {period}
              </Button>
            ))}
          </div>

          {/* Disable this for now since we are not really sorting stuff. */}
          {/* <Select value={sortBy} onValueChange={setSortBy} disabled={isRefreshing}>
            <SelectTrigger className={`w-[180px] ${isRefreshing ? "opacity-75" : ""}`}>
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shareOfVoice">Share of Voice</SelectItem>
              <SelectItem value="averageRank">Average Rank</SelectItem>
              <SelectItem value="mentionCount">Mention Count</SelectItem>
              <SelectItem value="sentimentScore">Sentiment Score</SelectItem>
            </SelectContent>
          </Select> */}
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-2 border-l border-border pl-2">
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

          {hasData && competitorsData && competitorsData.length > 0 && (
            <ExportDropdown
              onExport={handleExportData}
              isLoading={isExporting}
              disabled={
                !hasData || !competitorsData || competitorsData.length === 0
              }
              formats={["csv", "json", "pdf"]}
              data={competitorsData as Record<string, unknown>[]}
              showEstimatedSize={true}
            />
          )}
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Competitor</DialogTitle>
              <DialogDescription>
                Add a competitor to track their AI visibility performance
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="websiteSelect">Website</Label>
                <Select
                  value={selectedWebsiteId || ""}
                  onValueChange={setSelectedWebsite}
                  disabled={websitesLoading || websites.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        websitesLoading
                          ? "Loading websites..."
                          : websites.length === 0
                          ? "No websites available"
                          : "Select a website..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {websites.length > 0 ? (
                      websites.map((website) => (
                        <SelectItem key={website.id} value={website.id}>
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {website.display_name || website.domain}
                              </span>
                              {website.display_name && (
                                <span className="text-sm text-muted-foreground">
                                  {website.domain}
                                </span>
                              )}
                            </div>
                            <Badge
                              variant={
                                website.is_active ? "default" : "secondary"
                              }
                              className="ml-2"
                            >
                              {website.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">
                        No websites available. Please add a website first.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitorDomain">Competitor Domain</Label>
                <Input
                  id="competitorDomain"
                  placeholder="competitor.com"
                  value={competitorDomain}
                  onChange={(e) => setCompetitorDomain(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitorName">Company Name (Optional)</Label>
                <Input
                  id="competitorName"
                  placeholder="Competitor Inc"
                  value={competitorName}
                  onChange={(e) => setCompetitorName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                disabled={isAdding}
              >
                Cancel
              </Button>
              <LoadingButton
                onClick={handleAddCompetitor}
                loading={isAdding}
                loadingText="Adding..."
                icon={<Plus className="h-4 w-4" />}
                disabled={
                  isAdding || websites.length === 0 || !selectedWebsiteId
                }
              >
                Add Competitor
              </LoadingButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
