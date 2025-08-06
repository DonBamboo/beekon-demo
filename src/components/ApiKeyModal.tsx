import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/LoadingStates";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiKeyService, ApiKey as ApiKeyType, ApiKeyUsage } from "@/services/apiKeyService";
import { ConfirmationDialog } from "./ConfirmationDialog";
import {
  Key,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  Calendar,
  Activity,
  Download,
} from "lucide-react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyChange?: () => void;
}

interface DisplayApiKey {
  id: string;
  name: string;
  key: string;
  created: string;
  lastUsed: string;
  requests: number;
  status: "active" | "revoked";
}

export function ApiKeyModal({ isOpen, onClose, onApiKeyChange }: ApiKeyModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showKey, setShowKey] = useState<{ [key: string]: boolean }>({});
  const [newKeyName, setNewKeyName] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);
  const [usage, setUsage] = useState<ApiKeyUsage>({
    total_requests: 0,
    success_rate: 0,
    active_keys: 0,
    last_30_days: 0,
  });

  const [apiKeys, setApiKeys] = useState<DisplayApiKey[]>([
  ]);

  // Load API keys and usage on component mount
  useEffect(() => {
    const loadApiKeys = async () => {
      if (!user?.id || !isOpen) return;
      
      setIsLoading(true);
      try {
        const [keys, usageData] = await Promise.all([
          apiKeyService.getApiKeys(user.id),
          apiKeyService.getApiKeyUsage(user.id),
        ]);
        
        const displayKeys: DisplayApiKey[] = keys.map(key => ({
          id: key.id,
          name: key.name,
          key: key.key_prefix + '...' + key.key_hash.substring(0, 8), // We can't show the full key
          created: key.created_at,
          lastUsed: key.last_used_at || 'Never',
          requests: key.usage_count,
          status: key.is_active ? 'active' : 'revoked',
        }));
        
        setApiKeys(displayKeys);
        setUsage(usageData);
      } catch (error) {
        // Failed to load API keys
        toast({
          title: 'Error',
          description: 'Failed to load API keys.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadApiKeys();
  }, [user?.id, isOpen, toast]);

  const handleGenerateKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the API key",
        variant: "destructive",
      });
      return;
    }

    if (!user?.id) return;

    setIsGenerating(true);
    try {
      const newKeyWithSecret = await apiKeyService.generateApiKey(user.id, newKeyName);
      
      const displayKey: DisplayApiKey = {
        id: newKeyWithSecret.id,
        name: newKeyWithSecret.name,
        key: newKeyWithSecret.key, // Show full key only for newly generated keys
        created: newKeyWithSecret.created_at,
        lastUsed: newKeyWithSecret.last_used_at || 'Never',
        requests: newKeyWithSecret.usage_count,
        status: newKeyWithSecret.is_active ? 'active' : 'revoked',
      };

      setApiKeys(prev => [displayKey, ...prev]);
      setNewKeyName("");
      setShowKey(prev => ({ ...prev, [newKeyWithSecret.id]: true })); // Show the newly generated key
      
      // Update usage stats
      const updatedUsage = await apiKeyService.getApiKeyUsage(user.id);
      setUsage(updatedUsage);
      
      // Notify parent component
      onApiKeyChange?.();

      toast({
        title: "API key generated",
        description: "Your new API key has been created successfully. Make sure to copy it now!",
      });
    } catch (error) {
      // Failed to generate API key
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!user?.id) return;
    
    setIsRevoking(true);
    try {
      await apiKeyService.revokeApiKey(user.id, keyId);

      setApiKeys(prev => 
        prev.map(key => 
          key.id === keyId ? { ...key, status: "revoked" as const } : key
        )
      );
      
      // Update usage stats
      const updatedUsage = await apiKeyService.getApiKeyUsage(user.id);
      setUsage(updatedUsage);
      
      // Notify parent component
      onApiKeyChange?.();

      toast({
        title: "API key revoked",
        description: "The API key has been successfully revoked.",
      });
    } catch (error) {
      // Failed to revoke API key
      toast({
        title: "Error",
        description: "Failed to revoke API key. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRevoking(false);
      setShowConfirmation(false);
      setKeyToRevoke(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${label} has been copied to your clipboard.`,
    });
  };

  const toggleKeyVisibility = (keyId: string) => {
    setShowKey(prev => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const maskKey = (key: string) => {
    return `${key.substring(0, 8)}${"*".repeat(20)}${key.substring(key.length - 8)}`;
  };

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <Badge className="bg-success">Active</Badge>
    ) : (
      <Badge variant="destructive">Revoked</Badge>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-3">
              <Key className="h-5 w-5" />
              <span>API Key Management</span>
            </DialogTitle>
            <DialogDescription>
              Generate and manage API keys for programmatic access to Beekon.ai
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Usage Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>Usage Overview</span>
                </CardTitle>
                <CardDescription>
                  Current month API usage statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{usage.total_requests.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Requests</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-success">{usage.success_rate.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{usage.active_keys}</div>
                    <div className="text-sm text-muted-foreground">Active Keys</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Generate New Key */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Generate New API Key</CardTitle>
                <CardDescription>
                  Create a new API key for accessing Beekon.ai services
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="keyName">API Key Name</Label>
                  <Input
                    id="keyName"
                    placeholder="e.g., Production API, Dashboard Integration"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="focus-ring"
                  />
                </div>
                <LoadingButton
                  onClick={handleGenerateKey}
                  loading={isGenerating}
                  loadingText="Generating..."
                  icon={<Key className="h-4 w-4" />}
                  className="w-full"
                >
                  Generate API Key
                </LoadingButton>
                <div className="flex items-start space-x-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-warning">Important:</div>
                    <div className="text-muted-foreground">
                      Make sure to copy your API key immediately after generation. 
                      You won't be able to see it again for security reasons.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Existing API Keys */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your API Keys</CardTitle>
                <CardDescription>
                  Manage your existing API keys
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="default" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {apiKeys.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No API keys found. Generate your first API key above.
                      </div>
                    ) : (
                      apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="font-medium">{apiKey.name}</div>
                          {getStatusBadge(apiKey.status)}
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleKeyVisibility(apiKey.id)}
                            disabled={apiKey.status === "revoked"}
                          >
                            {showKey[apiKey.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(apiKey.key, "API key")}
                            disabled={apiKey.status === "revoked"}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {apiKey.status === "active" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setKeyToRevoke(apiKey.id);
                                setShowConfirmation(true);
                              }}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="font-mono text-sm bg-muted p-2 rounded">
                        {showKey[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-3 w-3" />
                          <span>Created: {new Date(apiKey.created).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Activity className="h-3 w-3" />
                          <span>Last used: {apiKey.lastUsed}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>Requests: {apiKey.requests.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documentation Link */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">API Documentation</div>
                    <div className="text-sm text-muted-foreground">
                      Learn how to integrate with our API endpoints
                    </div>
                  </div>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    View Docs
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={() => {
          setShowConfirmation(false);
          setKeyToRevoke(null);
        }}
        onConfirm={() => keyToRevoke && handleRevokeKey(keyToRevoke)}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? This action cannot be undone and will immediately stop all requests using this key."
        confirmText="Revoke Key"
        variant="destructive"
      />
    </>
  );
}