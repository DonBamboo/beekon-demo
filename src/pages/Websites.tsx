import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import { WebsiteStatusIndicator, WebsiteStatusType } from "@/components/WebsiteStatusIndicator";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportDropdown } from "@/components/ui/export-components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { WebsiteSettingsModal } from "@/components/WebsiteSettingsModal";
import { WorkspaceGuard } from "@/components/WorkspaceGuard";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace, Website } from "@/hooks/useWorkspace";
import { useWebsitesCoordinated } from "@/hooks/useWebsitesCoordinated";
import { useSelectedWebsite } from "@/hooks/appStateHooks";
import { supabase } from "@/integrations/supabase/client";
import { sendN8nWebhook } from "@/lib/http-request";
import { useExportHandler } from "@/lib/export-utils";
import { addProtocol } from "@/lib/utils";
import type { ExportFormat } from "@/types/database";
import {
  BarChart3,
  Calendar,
  Download,
  Globe,
  MoreHorizontal,
  Play,
  Plus,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function Websites() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedWebsiteForModal, setSelectedWebsiteForModal] = useState<Website | null>(null);
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [websiteToDelete, setWebsiteToDelete] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const { websites, deleteWebsite, refetchWebsites, currentWorkspace, loading: workspaceLoading, addWebsiteToMonitoring } = useWorkspace();
  const { selectedWebsiteId, setSelectedWebsite } = useSelectedWebsite();
  const { handleExport } = useExportHandler();
  
  // Use coordinated websites loading to prevent flickering
  const {
    websites: websitesWithMetrics,
    totalMetrics,
    isLoading: isLoadingMetrics,
    isInitialLoad,
    refresh: refreshMetrics,
    getWebsiteMetrics,
  } = useWebsitesCoordinated();

  // Ensure a website is selected for global state consistency
  useEffect(() => {
    if (websites && websites.length > 0 && !selectedWebsiteId) {
      setSelectedWebsite(websites[0].id);
      if (process.env.NODE_ENV === 'development') {
        console.log('Websites page: Auto-selected first website', websites[0].id);
      }
    }
  }, [websites, selectedWebsiteId, setSelectedWebsite]);


  const handleAddWebsite = async () => {
    setProcessing(true);
    if (!domain) {
      toast({
        title: "Error",
        description: "Please enter a domain name",
        variant: "destructive",
      });
      setProcessing(false);
      return;
    }

    if (!displayName) {
      toast({
        title: "Error",
        description: "Please enter a display name",
        variant: "destructive",
      });
      setProcessing(false);
      return;
    }

    // Validate domain format
    const domainRegex =
      /^(https?:\/\/)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(\/.*)?$/i;

    if (!domainRegex.test(domain)) {
      toast({
        title: "Error",
        description: "Please enter a valid domain name",
        variant: "destructive",
      });
      setProcessing(false);
      return;
    }

    // Ensure we have a valid workspace before proceeding
    if (!currentWorkspace?.id) {
      toast({
        title: "Error",
        description: "No workspace selected. Please create or select a workspace first.",
        variant: "destructive",
      });
      setProcessing(false);
      return;
    }

    const response = await sendN8nWebhook("webhook/website-onboarding", {
      website: addProtocol(domain),
      display_name: displayName,
      workspace_id: currentWorkspace.id,
    });

    if (!response.success) {
      toast({
        title: "Error",
        description: "Website crawl failed. Website not found.",
        variant: "destructive",
      });
      setProcessing(false);
      return;
    }

    // Here you would typically make an API call to add the website
    toast({
      title: "Website added!",
      description: `Analysis started for ${domain}`,
    });

    // Refetch websites to get the new website data
    await refetchWebsites();
    
    // Find the newly added website and start monitoring it
    const updatedWebsites = await supabase
      .schema('beekon_data')
      .from('websites')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .eq('domain', addProtocol(domain))
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (updatedWebsites.data && updatedWebsites.data.length > 0) {
      const newWebsite = updatedWebsites.data[0];
      await addWebsiteToMonitoring(newWebsite.id);
      
      // Select the new website
      setSelectedWebsite(newWebsite.id);
      
      toast({
        title: "Real-time monitoring started",
        description: "You'll receive updates as the website is analyzed",
        variant: "default",
      });
    }

    setDomain("");
    setDisplayName("");
    setProcessing(false);
    setIsAddDialogOpen(false);
  };

  const getStatusIndicator = (website: Website) => {
    return (
      <WebsiteStatusIndicator
        status={website.crawl_status as WebsiteStatusType}
        lastCrawledAt={website.last_crawled_at}
        variant="badge"
        size="sm"
        showLabel={true}
        showTimestamp={false}
      />
    );
  };

  const handleOpenSettings = (website: Website) => {
    setSelectedWebsiteForModal(website);
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsModalOpen(false);
    setSelectedWebsiteForModal(null);
  };

  const handleAnalyzeNow = async (
    websiteId: string,
    domain: string,
    name: string
  ) => {
    setIsAnalyzing(websiteId);
    if (!websiteId) {
      toast({
        title: "Error",
        description: "Website not found.",
        variant: "destructive",
      });
    }

    const response = await sendN8nWebhook("webhook/re-analyze", {
      id: websiteId,
      website: domain,
      name: name,
    });

    if (!response.success) {
      toast({
        title: "Error",
        description: "There was an error during re-analysis.",
        variant: "destructive",
      });

      setIsAnalyzing(null);
      return;
    }

    toast({
      title: "Website added!",
      description: `We're in the process of analyzing ${domain}`,
    });
    setIsAnalyzing(null);
  };

  const handleDeleteWebsite = async (websiteId: string) => {
    deleteWebsite(websiteId);
  };

  const confirmDelete = (websiteId: string) => {
    setWebsiteToDelete(websiteId);
    setShowDeleteConfirm(true);
  };

  const handleExportData = async (format: ExportFormat) => {
    if (!websites || websites.length === 0) {
      toast({
        title: "No Data to Export",
        description: "Please add websites before attempting to export.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    
    try {
      const { exportService } = await import("@/services/exportService");
      
      // Prepare website IDs for export
      const websiteIds = websites.map(website => website.id);
      
      // Export with comprehensive options
      const blob = await exportService.exportWebsiteData(
        websiteIds,
        format,
        {
          includeMetrics: true,
          includeAnalysisHistory: false, // Can be made configurable later
          dateRange: undefined, // Can add date filtering later
        }
      );

      // Use the export handler for consistent file handling
      await handleExport(
        () => Promise.resolve(blob),
        {
          filename: `website-data-${new Date().toISOString().split('T')[0]}`,
          format,
          includeTimestamp: true,
          metadata: {
            websiteCount: websites.length,
            exportType: "website_data",
            includeMetrics: true,
          },
        }
      );

      toast({
        title: "Export Successful",
        description: `Website data exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      // Export failed
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export website data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };


  // Show loading for initial metrics load to prevent flickering stats
  const showMetricsLoading = isLoadingMetrics && isInitialLoad;

  return (
    <WorkspaceGuard requireWorkspace={true}>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Websites</h1>
          <p className="text-muted-foreground">
            Manage and monitor your websites for AI visibility
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {websites && websites.length > 0 && (
            <ExportDropdown
              onExport={handleExportData}
              isLoading={isExporting}
              disabled={!websites || websites.length === 0}
              formats={["pdf", "csv", "json"]}
              data={websites}
              showEstimatedSize={true}
            />
          )}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!currentWorkspace?.id || workspaceLoading}>
                <Plus className="h-4 w-4 mr-2" />
                {workspaceLoading ? "Loading..." : "Add Website"}
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Website</DialogTitle>
              <DialogDescription>
                Add a website to start monitoring its AI visibility
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  placeholder="https://www.example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name (Optional)</Label>
                <Input
                  id="displayName"
                  placeholder="My Company"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <LoadingButton
                onClick={handleAddWebsite}
                loading={processing}
                loadingText="Starting..."
                disabled={!currentWorkspace?.id}
                icon={<Play className="h-4 w-4" />}
              >
                Start Analysis
              </LoadingButton>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Empty State */}
      {websites?.length === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Primary Empty State */}
          <EmptyState
            icon={Globe}
            title="Start Monitoring Your Websites"
            description="Add your first website to begin tracking its AI visibility performance across different LLMs and discover how your brand appears in AI responses."
            size="lg"
            actions={[
              {
                label: "Add Your First Website",
                onClick: () => setIsAddDialogOpen(true),
                variant: "default",
                icon: Plus,
              },
            ]}
          />

          {/* Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                What We'll Track
              </CardTitle>
              <CardDescription>
                Comprehensive AI visibility analysis for your website
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                  <div>
                    <h4 className="font-medium text-sm">Brand Mentions</h4>
                    <p className="text-xs text-muted-foreground">
                      Track how often your brand is mentioned in AI responses
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                  <div>
                    <h4 className="font-medium text-sm">Ranking Analysis</h4>
                    <p className="text-xs text-muted-foreground">
                      Monitor your position in AI recommendation lists
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                  <div>
                    <h4 className="font-medium text-sm">Topic Performance</h4>
                    <p className="text-xs text-muted-foreground">
                      Analyze visibility across different topics and keywords
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                  <div>
                    <h4 className="font-medium text-sm">Sentiment Tracking</h4>
                    <p className="text-xs text-muted-foreground">
                      Monitor how your brand is perceived in AI responses
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsAddDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Get Started
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Websites Grid */}
      <div className="grid gap-6">
        {websites?.map((website) => (
          <Card 
            key={website.id}
            className={`cursor-pointer transition-colors ${
              selectedWebsiteId === website.id 
                ? 'ring-2 ring-primary bg-primary/5' 
                : 'hover:bg-accent/50'
            }`}
            onClick={() => setSelectedWebsite(website.id)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                    selectedWebsiteId === website.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-primary/10 text-primary'
                  }`}>
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {website.display_name || website.domain}
                      {selectedWebsiteId === website.id && (
                        <Badge variant="default" className="text-xs">Selected</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{website.domain}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusIndicator(website)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          handleAnalyzeNow(
                            website.id,
                            website.domain,
                            website.display_name
                          )
                        }
                        disabled={isAnalyzing === website.id}
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        {isAnalyzing === website.id
                          ? "Analyzing..."
                          : "Analyze Now"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenSettings(website)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => confirmDelete(website.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Status Information */}
                <div className="p-3 bg-muted/50 rounded-lg">
                  <WebsiteStatusIndicator
                    status={website.crawl_status as WebsiteStatusType}
                    lastCrawledAt={website.last_crawled_at}
                    variant="card"
                    size="md"
                    showLabel={true}
                    showTimestamp={true}
                  />
                </div>
                
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Last Analyzed</p>
                      <p className="text-sm text-muted-foreground">
                        {website.last_crawled_at
                          ? new Date(website.created_at).toLocaleDateString()
                          : new Date(website.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Total Topics</p>
                      <p className="text-sm text-muted-foreground">
                        {showMetricsLoading ? "..." : getWebsiteMetrics(website.id)?.totalTopics || 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-primary rounded-full" />
                    <div>
                      <p className="text-sm font-medium">Avg Visibility</p>
                      <p className="text-sm text-muted-foreground">
                        {showMetricsLoading ? "..." : `${Math.round(getWebsiteMetrics(website.id)?.avgVisibility || 0)}%`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Website Settings Modal */}
      <WebsiteSettingsModal
        website={selectedWebsiteForModal}
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
      />

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setWebsiteToDelete(null);
        }}
        onConfirm={() => {
          if (websiteToDelete !== null) {
            return handleDeleteWebsite(websiteToDelete);
          }
          return;
        }}
        title="Delete Website"
        description="Are you sure you want to delete this website? This will remove all associated analysis data and cannot be undone."
        confirmText="Delete Website"
        variant="destructive"
      />
      </div>
    </WorkspaceGuard>
  );
}
