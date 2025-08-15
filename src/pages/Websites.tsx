import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import {
  WebsiteStatusIndicator,
  WebsiteStatusType,
} from "@/components/WebsiteStatusIndicator";
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
  Globe,
  MoreHorizontal,
  Play,
  Plus,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";

export default function Websites() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedWebsiteForModal, setSelectedWebsiteForModal] =
    useState<Website | null>(null);
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [websiteToDelete, setWebsiteToDelete] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAddingWebsite, setIsAddingWebsite] = useState(false);
  const modalCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const {
    websites,
    deleteWebsite,
    refetchWebsites,
    currentWorkspace,
    loading: workspaceLoading,
    addWebsiteToMonitoring,
  } = useWorkspace();
  const { selectedWebsiteId, setSelectedWebsite } = useSelectedWebsite();
  const { handleExport } = useExportHandler();
  
  // Debug: Get real-time connection status for development
  const [debugInfo, setDebugInfo] = useState<{
    workspaceId: string;
    timestamp: string;
    isActive: boolean;
    hasRealtime: boolean;
    monitoredWebsites: number;
    pollingWebsites: number;
    connectionHealth?: {
      isHealthy: boolean;
      lastSeenAgo: number;
      reconnectAttempts: number;
    };
  } | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && currentWorkspace?.id) {
      const updateDebugInfo = async () => {
        const { websiteStatusService } = await import("@/services/websiteStatusService");
        const status = websiteStatusService.getSubscriptionStatus(currentWorkspace.id);
        
        if (status) {
          setDebugInfo({
            workspaceId: currentWorkspace.id,
            timestamp: new Date().toISOString(),
            isActive: status.isActive,
            hasRealtime: status.hasRealtime,
            monitoredWebsites: status.monitoredWebsites,
            pollingWebsites: status.pollingWebsites,
            connectionHealth: status.connectionHealth
          });
        }
      };
      
      updateDebugInfo();
      const interval = setInterval(updateDebugInfo, 5000);
      return () => clearInterval(interval);
    }
    return () => {}; // No cleanup needed when not in development
  }, [currentWorkspace?.id]);

  // Use coordinated websites loading to prevent flickering
  const {
    websites: _websitesWithMetrics,
    totalMetrics: _totalMetrics,
    isLoading: isLoadingMetrics,
    isInitialLoad,
    refresh: _refreshMetrics,
    getWebsiteMetrics,
  } = useWebsitesCoordinated();

  // Ensure a website is selected for global state consistency
  useEffect(() => {
    if (websites && websites.length > 0 && !selectedWebsiteId) {
      setSelectedWebsite(websites[0]?.id || "");
      if (process.env.NODE_ENV === "development") {
        console.log(
          "Websites page: Auto-selected first website",
          websites[0]?.id
        );
      }
    }
  }, [websites, selectedWebsiteId, setSelectedWebsite]);

  // Debounced modal state handler to prevent rapid open/close cycles
  const handleModalStateChange = useCallback((open: boolean) => {
    // Prevent any modal state changes while adding a website
    if (isAddingWebsite && open) {
      return;
    }

    if (modalCloseTimeoutRef.current) {
      clearTimeout(modalCloseTimeoutRef.current);
      modalCloseTimeoutRef.current = null;
    }
    
    if (!open) {
      // Delay modal closure slightly to prevent immediate reopening
      modalCloseTimeoutRef.current = setTimeout(() => {
        if (!isAddingWebsite) { // Double-check the state hasn't changed
          setIsAddDialogOpen(false);
        }
      }, 50);
    } else {
      // Open immediately but only if not currently adding a website
      if (!isAddingWebsite) {
        setIsAddDialogOpen(true);
      }
    }
  }, [isAddingWebsite]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (modalCloseTimeoutRef.current) {
        clearTimeout(modalCloseTimeoutRef.current);
      }
    };
  }, []);

  const handleAddWebsite = async () => {
    setProcessing(true);
    setIsAddingWebsite(true);
    if (!domain) {
      toast({
        title: "Error",
        description: "Please enter a domain name",
        variant: "destructive",
      });
      setProcessing(false);
      setIsAddingWebsite(false);
      return;
    }

    if (!displayName) {
      toast({
        title: "Error",
        description: "Please enter a display name",
        variant: "destructive",
      });
      setProcessing(false);
      setIsAddingWebsite(false);
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
      setIsAddingWebsite(false);
      return;
    }

    // Ensure we have a valid workspace before proceeding
    if (!currentWorkspace?.id) {
      toast({
        title: "Error",
        description:
          "No workspace selected. Please create or select a workspace first.",
        variant: "destructive",
      });
      setProcessing(false);
      setIsAddingWebsite(false);
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
      setIsAddingWebsite(false);
      return;
    }

    // Here you would typically make an API call to add the website
    toast({
      title: "Website added!",
      description: `Analysis started for ${domain}`,
    });

    // Close modal immediately after successful webhook response
    // This prevents race conditions with state updates
    setDomain("");
    setDisplayName("");
    setProcessing(false);
    handleModalStateChange(false);

    // Use setTimeout to defer async operations until after modal closure
    setTimeout(async () => {
      try {
        // Refetch websites to get the new website data
        await refetchWebsites();

        // Find the newly added website and start monitoring it
        const updatedWebsites = await supabase
          .schema("beekon_data")
          .from("websites")
          .select("*")
          .eq("workspace_id", currentWorkspace.id)
          .eq("domain", addProtocol(domain))
          .order("created_at", { ascending: false })
          .limit(1);

        if (updatedWebsites.data && updatedWebsites.data.length > 0) {
          const newWebsite = updatedWebsites.data[0];
          if (newWebsite?.id) {
            await addWebsiteToMonitoring(newWebsite.id);

            // Select the new website
            setSelectedWebsite(newWebsite.id);

            toast({
              title: "Real-time monitoring started",
              description: "You'll receive updates as the website is analyzed",
              variant: "default",
            });
          }
        }
      } catch (error) {
        // Handle any errors during post-modal operations
        console.error("Error during website setup:", error);
        toast({
          title: "Setup Warning",
          description: "Website added successfully, but monitoring setup may need manual retry.",
          variant: "default",
        });
      } finally {
        // Reset adding state when all operations complete
        setIsAddingWebsite(false);
      }
    }, 100); // Small delay to ensure modal has closed
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
      const websiteIds = websites.map((website) => website.id);

      // Export with comprehensive options
      const blob = await exportService.exportWebsiteData(websiteIds, format, {
        includeMetrics: true,
        includeAnalysisHistory: false, // Can be made configurable later
        dateRange: undefined, // Can add date filtering later
      });

      // Use the export handler for consistent file handling
      await handleExport(() => Promise.resolve(blob), {
        filename: `website-data-${new Date().toISOString().split("T")[0]}`,
        format,
        includeTimestamp: true,
        metadata: {
          websiteCount: websites.length,
          exportType: "website_data",
          includeMetrics: true,
        },
      });

      toast({
        title: "Export Successful",
        description: `Website data exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      // Export failed
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to export website data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Show loading for initial metrics load to prevent flickering stats
  const showMetricsLoading = isLoadingMetrics && isInitialLoad;

  // Debug: Track component renders and website array changes
  const websitesRefDebug = useRef(websites);
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const websiteStates = websites?.map(w => `${w.id.slice(-4)}:${w.crawl_status}`).join(', ') || 'none';
      const refChanged = websitesRefDebug.current !== websites;
      
      console.log(`[WEBSITES-PAGE] 📄 COMPONENT RE-RENDERED:`, {
        websiteCount: websites?.length || 0,
        states: websiteStates,
        refChanged,
        websiteObjectReference: websites,
        previousReference: websitesRefDebug.current,
        sameReference: websitesRefDebug.current === websites,
        timestamp: new Date().toISOString(),
        fullWebsiteData: websites?.map(w => ({
          id: w.id.slice(-8),
          domain: w.domain.slice(0, 20),
          status: w.crawl_status,
          lastCrawled: w.last_crawled_at?.slice(0, 16),
          updated: w.updated_at?.slice(0, 16)
        }))
      });
      
      // Also check if individual website statuses changed
      if (websitesRefDebug.current && websites && websitesRefDebug.current.length === websites.length) {
        const statusChanges = websites.map((w, i) => {
          const prev = websitesRefDebug.current?.[i];
          if (prev && prev.id === w.id && prev.crawl_status !== w.crawl_status) {
            return `${w.id.slice(-8)}: ${prev.crawl_status} → ${w.crawl_status}`;
          }
          return null;
        }).filter(Boolean);
        
        if (statusChanges.length > 0) {
          console.log(`[WEBSITES-PAGE] 🎯 STATUS CHANGES DETECTED IN UI:`, statusChanges);
        }
      }
      
      websitesRefDebug.current = websites;
    }
  }, [websites]);

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
                data={websites as unknown as Array<Record<string, unknown>>}
                showEstimatedSize={true}
              />
            )}
            <Dialog open={isAddDialogOpen && !isAddingWebsite} onOpenChange={handleModalStateChange}>
              <DialogTrigger asChild>
                <Button disabled={!currentWorkspace?.id || workspaceLoading || isAddingWebsite}>
                  <Plus className="h-4 w-4 mr-2" />
                  {workspaceLoading ? "Loading..." : isAddingWebsite ? "Adding..." : "Add Website"}
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
                    onClick={() => handleModalStateChange(false)}
                  >
                    Cancel
                  </Button>
                  <LoadingButton
                    onClick={handleAddWebsite}
                    loading={processing || isAddingWebsite}
                    loadingText="Starting..."
                    disabled={!currentWorkspace?.id || isAddingWebsite}
                    icon={<Play className="h-4 w-4" />}
                  >
                    Start Analysis
                  </LoadingButton>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Development Debug Panel */}
        {process.env.NODE_ENV === 'development' && debugInfo && (
          <div className="bg-gray-100 border rounded-lg p-4 text-xs font-mono space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-700">🐛 Real-time Status Debug</h3>
              <div className="flex gap-2">
                <span className="text-gray-500">Updated: {new Date(debugInfo.timestamp).toLocaleTimeString()}</span>
                <button 
                  onClick={() => refetchWebsites()} 
                  className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                >
                  Force Refresh
                </button>
                <button 
                  onClick={async () => {
                    if (websites && websites.length > 0) {
                      const { websiteStatusService } = await import("@/services/websiteStatusService");
                      console.log('[DEBUG] 🔍 Manual database sync verification started');
                      for (const website of websites) {
                        const dbData = await websiteStatusService.getWebsiteStatusFromDB(website.id);
                        console.log(`[DEBUG] 📊 Website ${website.id} comparison:`, {
                          appState: website.crawl_status,
                          database: dbData?.crawl_status,
                          inSync: website.crawl_status === dbData?.crawl_status,
                          website: website.domain
                        });
                      }
                    }
                  }}
                  className="px-2 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600"
                >
                  Check DB Sync
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-gray-600">Connection</div>
                <div className={debugInfo.hasRealtime ? 'text-green-600' : 'text-red-600'}>
                  {debugInfo.hasRealtime ? '🟢 Real-time' : '🔴 Polling'}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Health</div>
                <div className={debugInfo.connectionHealth?.isHealthy ? 'text-green-600' : 'text-orange-600'}>
                  {debugInfo.connectionHealth?.isHealthy ? '💚 Healthy' : '⚠️ Stale'}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Monitored</div>
                <div className="text-blue-600">{debugInfo.monitoredWebsites || 0} websites</div>
              </div>
              <div>
                <div className="text-gray-600">Reconnects</div>
                <div className="text-purple-600">{debugInfo.connectionHealth?.reconnectAttempts || 0} attempts</div>
              </div>
            </div>
            
            {debugInfo.connectionHealth?.lastSeenAgo && (
              <div className="text-gray-600">
                Last activity: {Math.round(debugInfo.connectionHealth.lastSeenAgo / 1000)}s ago
              </div>
            )}
            
            {/* Website Status Table */}
            {websites && websites.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Website Status Details:</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-left p-1">Domain</th>
                        <th className="text-left p-1">App Status</th>
                        <th className="text-left p-1">Last Crawled</th>
                        <th className="text-left p-1">Updated At</th>
                        <th className="text-left p-1">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {websites.map(website => (
                        <tr key={website.id} className="border-b border-gray-200">
                          <td className="p-1 truncate max-w-32" title={website.domain}>
                            {website.domain.replace(/^https?:\/\//, '')}
                          </td>
                          <td className="p-1">
                            <span className={
                              website.crawl_status === 'completed' ? 'text-green-600' :
                              website.crawl_status === 'crawling' ? 'text-blue-600' :
                              website.crawl_status === 'pending' ? 'text-yellow-600' :
                              'text-red-600'
                            }>
                              {website.crawl_status}
                            </span>
                          </td>
                          <td className="p-1 text-gray-600">
                            {website.last_crawled_at ? 
                              new Date(website.last_crawled_at).toLocaleTimeString() : 
                              'Never'
                            }
                          </td>
                          <td className="p-1 text-gray-600">
                            {website.updated_at ? 
                              new Date(website.updated_at).toLocaleTimeString() :
                              'Unknown'
                            }
                          </td>
                          <td className="p-1">
                            <button 
                              onClick={async () => {
                                const { websiteStatusService } = await import("@/services/websiteStatusService");
                                const dbData = await websiteStatusService.getWebsiteStatusFromDB(website.id);
                                const inSync = website.crawl_status === dbData?.crawl_status;
                                alert(`App: ${website.crawl_status}\nDB: ${dbData?.crawl_status}\nIn Sync: ${inSync ? 'Yes' : 'No'}`);
                              }}
                              className="px-1 py-0.5 bg-gray-400 text-white rounded text-xs hover:bg-gray-500"
                              title="Compare with database"
                            >
                              🔍
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {websites?.length === 0 && !isAddingWebsite && (
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
                  onClick: () => !isAddingWebsite && handleModalStateChange(true),
                  variant: "default",
                  icon: Plus,
                  loading: isAddingWebsite,
                  loadingText: "Adding...",
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
                      <h4 className="font-medium text-sm">
                        Sentiment Tracking
                      </h4>
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
                    onClick={() => !isAddingWebsite && handleModalStateChange(true)}
                    disabled={isAddingWebsite}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isAddingWebsite ? "Adding..." : "Get Started"}
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
                  ? "ring-2 ring-primary bg-primary/5"
                  : "hover:bg-accent/50"
              }`}
              onClick={() => setSelectedWebsite(website.id)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                        selectedWebsiteId === website.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {website.display_name || website.domain}
                        {selectedWebsiteId === website.id && (
                          <Badge variant="default" className="text-xs">
                            Selected
                          </Badge>
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
                          {showMetricsLoading
                            ? "..."
                            : getWebsiteMetrics(website.id)?.totalTopics || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-primary rounded-full" />
                      <div>
                        <p className="text-sm font-medium">Avg Visibility</p>
                        <p className="text-sm text-muted-foreground">
                          {showMetricsLoading
                            ? "..."
                            : `${Math.round(
                                getWebsiteMetrics(website.id)?.avgVisibility ||
                                  0
                              )}%`}
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
