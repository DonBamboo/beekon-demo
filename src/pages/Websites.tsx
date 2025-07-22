import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { WebsiteSettingsModal } from "@/components/WebsiteSettingsModal";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace, Website } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { sendN8nWebhook } from "@/lib/http-request";
import { addProtocol } from "@/lib/utils";
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
import { useEffect, useState } from "react";

export default function Websites() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [websiteToDelete, setWebsiteToDelete] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [websiteMetrics, setWebsiteMetrics] = useState<
    Record<string, { totalTopics: number; avgVisibility: number }>
  >({});
  const { toast } = useToast();
  const { websites, deleteWebsite, refetchWebsites } = useWorkspace();
  const { workspaceId } = useAuth();

  useEffect(() => {
    websites?.forEach(async (website) => {
      await getTotalTopics(website.id);
    });
  }, [websites]);

  const getTotalTopics = async (websiteId: string) => {
    const totalTopics = await supabase
      .schema("beekon_data")
      .from("topics")
      .select("*", { count: "exact", head: true })
      .eq("website_id", websiteId);

    const visibility = await supabase
      .schema("beekon_data")
      .from("llm_analysis_results")
      .select("is_mentioned")
      .eq("website_id", websiteId);

    const items = visibility.data ?? [];

    const totalItems = items.length;
    const visibleCount = items.filter((item) => item.is_mentioned).length;

    const visibilityPercentage =
      totalItems > 0 ? (visibleCount / totalItems) * 100 : 0;

    setWebsiteMetrics((prev) => ({
      ...prev,
      [websiteId]: {
        totalTopics: totalTopics.count ?? 0,
        avgVisibility: Math.round(visibilityPercentage),
      },
    }));
  };

  // Get website metrics (placeholder implementation)
  const getWebsiteMetrics = (websiteId: string) => {
    // This is a placeholder implementation
    // In a real application, this would fetch from the database

    if (!websiteId) {
      return { totalTopics: 0, avgVisibility: 0 };
    }

    return websiteMetrics[websiteId];
  };

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

    const response = await sendN8nWebhook("webhook/website-onboarding", {
      website: addProtocol(domain),
      display_name: displayName,
      workspace_id: workspaceId,
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

    refetchWebsites();
    setDomain("");
    setDisplayName("");
    setProcessing(false);
    setIsAddDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-primary">Completed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "crawling":
        return <Badge variant="secondary">Crawling</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  const handleOpenSettings = (website: Website) => {
    setSelectedWebsite(website);
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsModalOpen(false);
    setSelectedWebsite(null);
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


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Websites</h1>
          <p className="text-muted-foreground">
            Manage and monitor your websites for AI visibility
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Website
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
          <Card key={website.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>
                      {website.display_name || website.domain}
                    </CardTitle>
                    <CardDescription>{website.domain}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusBadge(website.crawl_status!)}
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
                      {getWebsiteMetrics(website.id)?.totalTopics}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-primary rounded-full" />
                  <div>
                    <p className="text-sm font-medium">Avg Visibility</p>
                    <p className="text-sm text-muted-foreground">
                      {getWebsiteMetrics(website.id)?.avgVisibility}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Website Settings Modal */}
      <WebsiteSettingsModal
        website={selectedWebsite}
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
  );
}
