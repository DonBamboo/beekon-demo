import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  analysisService,
  type AnalysisSession,
} from "@/services/analysisService";
import {
  Calendar,
  Clock,
  Search,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  ExternalLink,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface AnalysisHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  websiteId?: string;
  onSelectSession?: (sessionId: string) => void;
}

export function AnalysisHistoryModal({
  isOpen,
  onClose,
  websiteId,
  onSelectSession,
}: AnalysisHistoryModalProps) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredSessions, setFilteredSessions] = useState<AnalysisSession[]>([]);

  const loadAnalysisSessions = useCallback(async () => {
    if (!websiteId) return;

    setIsLoading(true);
    try {
      const analysisSessions = await analysisService.getAnalysisSessionsForWebsite(websiteId);
      setSessions(analysisSessions);
      setFilteredSessions(analysisSessions);
    } catch (error) {
      console.error("Failed to load analysis sessions:", error);
      toast({
        title: "Error",
        description: "Failed to load analysis history. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [websiteId, toast]);

  useEffect(() => {
    if (isOpen && websiteId) {
      loadAnalysisSessions();
    }
  }, [isOpen, websiteId, loadAnalysisSessions]);

  // Filter sessions based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessions(sessions);
    } else {
      const filtered = sessions.filter((session) =>
        session.analysis_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.status.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSessions(filtered);
    }
  }, [searchQuery, sessions]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Play className="h-4 w-4 text-primary" />;
      case "pending":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-success";
      case "failed":
        return "bg-destructive";
      case "running":
        return "bg-primary";
      case "pending":
        return "bg-warning";
      default:
        return "bg-muted";
    }
  };

  const handleSelectSession = (sessionId: string) => {
    if (onSelectSession) {
      onSelectSession(sessionId);
    }
    onClose();
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt || !completedAt) return null;
    
    const start = new Date(startedAt);
    const end = new Date(completedAt);
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    if (durationMinutes < 1) return "< 1 min";
    if (durationMinutes < 60) return `${durationMinutes} min`;
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const getConfigurationSummary = (config: any) => {
    if (!config) return "No configuration data";
    
    const topics = config.topics?.length || 0;
    const llmModels = config.llmModels?.length || 0;
    const prompts = config.customPrompts?.length || 0;
    
    return `${topics} topics, ${llmModels} LLMs, ${prompts} prompts`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Analysis History</span>
          </DialogTitle>
          <DialogDescription>
            View and manage your previous analysis sessions
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="flex items-center space-x-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search analysis sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
        </div>

        {/* Sessions List */}
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredSessions.length > 0 ? (
            filteredSessions.map((session) => (
              <Card 
                key={session.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleSelectSession(session.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center space-x-2">
                      {getStatusIcon(session.status)}
                      <span>{session.analysis_name}</span>
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        className={`${getStatusColor(session.status)} text-white`}
                      >
                        {session.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSession(session.id);
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {session.started_at && session.completed_at && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {formatDuration(session.started_at, session.completed_at)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs">
                      {getConfigurationSummary(session.configuration)}
                    </div>
                    {session.error_message && (
                      <div className="text-xs text-destructive">
                        Error: {session.error_message}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Analysis History</h3>
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No analysis sessions match your search criteria."
                  : "You haven't run any analyses for this website yet."}
              </p>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {!isLoading && sessions.length > 0 && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-semibold mb-2">Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-2xl font-bold">
                  {sessions.length}
                </div>
                <div className="text-muted-foreground">Total Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-success">
                  {sessions.filter(s => s.status === "completed").length}
                </div>
                <div className="text-muted-foreground">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive">
                  {sessions.filter(s => s.status === "failed").length}
                </div>
                <div className="text-muted-foreground">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {sessions.filter(s => s.status === "running").length}
                </div>
                <div className="text-muted-foreground">Running</div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}