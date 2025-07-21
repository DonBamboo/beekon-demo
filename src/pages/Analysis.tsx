import { AnalysisConfigModal } from "@/components/AnalysisConfigModal";
import { AnalysisErrorBoundary } from "@/components/AnalysisErrorBoundary";
import { AnalysisHistoryModal } from "@/components/AnalysisHistoryModal";
import {
  AnalysisFilterSkeleton,
  AnalysisListSkeleton,
  AnalysisStatsSkeleton,
} from "@/components/AnalysisLoadingSkeleton";
import {
  AnalysisVisualization,
  RankingChart,
  SentimentChart,
} from "@/components/AnalysisVisualization";
import { ContextualEmptyState } from "@/components/ContextualEmptyState";
import { DetailedAnalysisModal } from "@/components/DetailedAnalysisModal";
import { FilterBreadcrumbs } from "@/components/FilterBreadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceModal } from "@/components/WorkspaceModal";
import { useToast } from "@/hooks/use-toast";
import { useAnalysisErrorHandler } from "@/hooks/useAnalysisError";
import { useSubscriptionEnforcement } from "@/hooks/useSubscriptionEnforcement";
import { useWorkspace } from "@/hooks/useWorkspace";
import { capitalizeFirstLetters } from "@/lib/utils";
import { analysisService, LLMResult } from "@/services/analysisService";
import { UIAnalysisResult } from "@/types/database";
import {
  AlertCircle,
  Building,
  Calendar,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  History,
  Plus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

// LegacyAnalysisResult interface removed - now using modern AnalysisResult directly

export default function Analysis() {
  const { toast } = useToast();
  const { currentWorkspace, loading, websites } = useWorkspace();
  const { enforceLimit, getRemainingCredits } = useSubscriptionEnforcement();
  const { error, isRetrying, handleError, retryOperation, clearError } =
    useAnalysisErrorHandler();
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [selectedLLM, setSelectedLLM] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<UIAnalysisResult | null>(
    null
  );
  const [isFiltering, setIsFiltering] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<UIAnalysisResult[]>(
    []
  );
  const [topics, setTopics] = useState<
    Array<{ id: string; name: string; resultCount: number }>
  >([]);
  const [availableLLMs, setAvailableLLMs] = useState<
    Array<{ id: string; name: string; resultCount: number }>
  >([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [showVisualization, setShowVisualization] = useState(true);
  const [groupBySession, setGroupBySession] = useState(false);

  // Set selected website to first website when websites load
  useEffect(() => {
    if (websites && websites.length > 0 && !selectedWebsite) {
      setSelectedWebsite(websites[0]!.id);
    }
  }, [websites, selectedWebsite]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Consolidated filter management
  const loadAnalysisResults = useCallback(async () => {
    if (!selectedWebsite) {
      return;
    }

    setIsLoadingResults(true);
    clearError();

    try {
      const filters = {
        topic: selectedTopic !== "all" ? selectedTopic : undefined,
        llmProvider: selectedLLM !== "all" ? selectedLLM : undefined,
        searchQuery: debouncedSearchQuery.trim() || undefined,
      };

      const results = await analysisService.getAnalysisResults(
        selectedWebsite,
        filters
      );

      setAnalysisResults(results);
    } catch (error) {
      console.error("❌ Failed to load analysis results:", error);
      console.error("❌ Error details:", error);
      handleError(error);
      toast({
        title: "Error",
        description: "Failed to load analysis results. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingResults(false);
    }
  }, [
    selectedWebsite,
    selectedTopic,
    selectedLLM,
    debouncedSearchQuery,
    toast,
    handleError,
    clearError,
  ]);

  // Load topics for the selected website
  const loadTopics = useCallback(async () => {
    if (!selectedWebsite) return;

    try {
      const websiteTopics = await analysisService.getTopicsForWebsite(
        selectedWebsite
      );
      setTopics([
        {
          id: "all",
          name: "All Topics",
          resultCount: websiteTopics.reduce(
            (sum, topic) => sum + topic.resultCount,
            0
          ),
        },
        ...websiteTopics,
      ]);
    } catch (error) {
      console.error("Failed to load topics:", error);
      handleError(error);
    }
  }, [selectedWebsite, handleError]);

  // Load available LLMs for the selected website
  const loadAvailableLLMs = useCallback(async () => {
    if (!selectedWebsite) return;

    try {
      const llmProviders = await analysisService.getAvailableLLMProviders(
        selectedWebsite
      );
      setAvailableLLMs([
        {
          id: "all",
          name: "All LLMs",
          resultCount: llmProviders.reduce(
            (sum, llm) => sum + llm.resultCount,
            0
          ),
        },
        ...llmProviders,
      ]);
    } catch (error) {
      console.error("Failed to load LLM providers:", error);
      handleError(error);
    }
  }, [selectedWebsite, handleError]);

  // Load data when dependencies change
  // Consolidated filter and data management
  useEffect(() => {
    // Load metadata (topics and LLMs) when website changes
    if (selectedWebsite) {
      loadTopics();
      loadAvailableLLMs();
    }
  }, [selectedWebsite, loadTopics, loadAvailableLLMs]);

  // Load analysis results when filters change
  useEffect(() => {
    loadAnalysisResults();
  }, [loadAnalysisResults]);

  // Improved filter validation - only reset when necessary
  useEffect(() => {
    if (topics.length > 0 && selectedTopic !== "all") {
      const topicExists = topics.some((topic) => topic.id === selectedTopic);
      if (!topicExists) {
        setSelectedTopic("all");
      }
    }
  }, [topics, selectedTopic]);

  useEffect(() => {
    if (availableLLMs.length > 0 && selectedLLM !== "all") {
      const llmExists = availableLLMs.some((llm) => llm.id === selectedLLM);
      if (!llmExists) {
        setSelectedLLM("all");
      }
    }
  }, [availableLLMs, selectedLLM]);

  // No need for legacy format transformation - work directly with modern format
  const filteredResults = analysisResults;

  // Group results by session if requested
  const groupedResults = useMemo(() => {
    if (!groupBySession) {
      return { ungrouped: filteredResults };
    }

    const groups: Record<string, UIAnalysisResult[]> = {};
    const ungrouped: UIAnalysisResult[] = [];

    filteredResults.forEach((result) => {
      if (result.analysis_session_id && result.analysis_name) {
        const key = `${result.analysis_session_id}:${result.analysis_name}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(result);
      } else {
        ungrouped.push(result);
      }
    });

    return { groups, ungrouped };
  }, [filteredResults, groupBySession]);

  // Memoize expensive statistics calculations
  const resultStats = useMemo(() => {
    const mentionedCount = filteredResults.filter((r) =>
      r.llm_results.some((llm) => llm.is_mentioned)
    ).length;

    const noMentionCount = filteredResults.filter(
      (r) => !r.llm_results.some((llm) => llm.is_mentioned)
    ).length;

    return {
      mentionedCount,
      noMentionCount,
      totalCount: filteredResults.length,
    };
  }, [filteredResults]);

  // Use dynamic LLM filters from server data
  const llmFilters =
    availableLLMs.length > 0
      ? availableLLMs
      : [
          { id: "all", name: "All LLMs", resultCount: 0 },
          { id: "chatgpt", name: "ChatGPT", resultCount: 0 },
          { id: "claude", name: "Claude", resultCount: 0 },
          { id: "gemini", name: "Gemini", resultCount: 0 },
        ];

  const getSentimentColor = (sentiment: string | null) => {
    if (!sentiment) return "";
    switch (sentiment) {
      case "positive":
        return "text-success";
      case "negative":
        return "text-destructive";
      default:
        return "text-warning";
    }
  };

  const getSentimentBadge = (sentiment: string | null) => {
    if (!sentiment) return null;
    const className =
      sentiment === "positive"
        ? "bg-success"
        : sentiment === "negative"
        ? "bg-destructive"
        : "bg-warning";
    return <Badge className={`${className} text-white`}>{sentiment}</Badge>;
  };

  const getSentimentBadgeFromScore = (score: number | null) => {
    if (score === null) return null;
    let sentiment: string;
    let className: string;

    if (score > 0.1) {
      sentiment = "positive";
      className = "bg-success";
    } else if (score < -0.1) {
      sentiment = "negative";
      className = "bg-destructive";
    } else {
      sentiment = "neutral";
      className = "bg-warning";
    }

    return <Badge className={`${className} text-white`}>{sentiment}</Badge>;
  };

  const handleFilterChange = async (filterType: string, value: string) => {
    setIsFiltering(true);
    try {
      if (filterType === "topic") {
        setSelectedTopic(value);
      } else if (filterType === "llm") {
        setSelectedLLM(value);
      }
      // Data will be reloaded automatically via useEffect
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply filter. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsFiltering(false);
    }
  };

  const handleViewDetails = (result: UIAnalysisResult) => {
    setSelectedResult(result);
    setIsDetailModalOpen(true);
  };

  // getSentimentFromScore function removed - now handled in DetailedAnalysisModal

  const handleClearFilters = () => {
    setSelectedTopic("all");
    setSelectedLLM("all");
    setSearchQuery("");
  };

  const getTopicName = (id: string): string => {
    if (!id) {
      return "";
    }

    const index = topics.findIndex((topic) => topic.id === id);

    return topics[index]!.name || "";
  };

  const handleRemoveFilter = (filterType: "topic" | "llm" | "search") => {
    switch (filterType) {
      case "topic":
        setSelectedTopic("all");
        break;
      case "llm":
        setSelectedLLM("all");
        break;
      case "search":
        setSearchQuery("");
        break;
    }
  };

  const hasActiveFilters =
    selectedTopic !== "all" ||
    selectedLLM !== "all" ||
    searchQuery.trim() !== "";

  const createAnalysis = () => {
    if (enforceLimit("websiteAnalyses", "New Analysis")) {
      setIsConfigModalOpen(true);
    }
  };

  const MentionIndicator = ({
    llmResult,
    llmName,
  }: {
    llmResult: LLMResult | undefined;
    llmName: string;
  }) => (
    <div className="text-center">
      <div className="text-xs text-muted-foreground mb-1">{llmName}</div>
      {llmResult?.is_mentioned ? (
        <div className="space-y-1">
          <Check className="h-5 w-5 text-success mx-auto" />
          <div className="text-xs font-medium">
            {llmResult.rank_position !== 0
              ? `#${llmResult.rank_position}`
              : "Not Ranked"}
          </div>
          {getSentimentBadgeFromScore(llmResult.sentiment_score)}
        </div>
      ) : (
        <X className="h-5 w-5 text-muted-foreground mx-auto" />
      )}
    </div>
  );

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analysis Results</h1>
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Show workspace creation prompt when no workspace exists
  if (!currentWorkspace) {
    return (
      <>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Analysis Results</h1>
            <p className="text-muted-foreground">
              Detailed analysis of your brand mentions across AI platforms
            </p>
          </div>
          <div className="text-center py-12">
            <Building className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Workspace Required</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              To run and view analysis results, you need to create a workspace
              first. Your workspace will track your usage and manage your
              analysis credits.
            </p>
            <LoadingButton
              onClick={() => setShowCreateWorkspace(true)}
              icon={<Plus className="h-4 w-4" />}
              size="lg"
            >
              Create Workspace
            </LoadingButton>
          </div>
        </div>
        <WorkspaceModal
          isOpen={showCreateWorkspace}
          onClose={() => setShowCreateWorkspace(false)}
        />
      </>
    );
  }

  return (
    <AnalysisErrorBoundary>
      <>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Analysis Results</h1>
            <p className="text-muted-foreground">
              Detailed analysis of your brand mentions across AI platforms
            </p>
          </div>

          {/* Error State */}
          {error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2 mb-4">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <h3 className="font-semibold text-destructive">
                    Error Loading Analysis Data
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {error.message ||
                    "An unexpected error occurred while loading your analysis data."}
                </p>
                <div className="flex gap-3">
                  <LoadingButton
                    onClick={() => retryOperation(loadAnalysisResults)}
                    loading={isRetrying}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </LoadingButton>
                  <Button onClick={clearError} variant="outline" size="sm">
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters and Search */}
          {loading ? (
            <AnalysisFilterSkeleton />
          ) : (
            <div className="space-y-4">
              {/* Website Selection */}
              {websites && websites.length > 1 && (
                <div className="flex items-center space-x-2">
                  <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={selectedWebsite}
                    onValueChange={setSelectedWebsite}
                    disabled={isLoadingResults}
                  >
                    <SelectTrigger className="w-full sm:w-[250px] min-w-[200px]">
                      <SelectValue placeholder="Select website" />
                    </SelectTrigger>
                    <SelectContent>
                      {websites.map((website) => (
                        <SelectItem key={website.id} value={website.id}>
                          <span className="truncate">
                            {website.display_name || website.domain}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Search and Filters */}
              <div className="space-y-4">
                {/* Top Row: Search and Topic Filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search Input */}
                  <div className="flex items-center space-x-2 flex-1">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Search by analysis name, topic, or prompt..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full min-w-0"
                      disabled={isLoadingResults}
                    />
                  </div>

                  {/* Topic Filter */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={selectedTopic}
                      onValueChange={(value) =>
                        handleFilterChange("topic", value)
                      }
                      disabled={isFiltering || isLoadingResults}
                    >
                      <SelectTrigger className="w-full sm:w-[200px] min-w-[150px]">
                        <SelectValue placeholder="Select topic" />
                      </SelectTrigger>
                      <SelectContent>
                        {topics.map((topic) => (
                          <SelectItem key={topic.id} value={topic.id}>
                            <div className="flex justify-between items-center w-full">
                              <span className="truncate">{topic.name}</span>
                              <Badge variant="outline" className="ml-2 text-xs shrink-0">
                                {topic.resultCount}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Second Row: LLM Filter Buttons */}
                <div className="flex flex-wrap gap-2">
                  {llmFilters.map((filter) => (
                    <LoadingButton
                      key={filter.id}
                      variant={
                        selectedLLM === filter.id ? "default" : "outline"
                      }
                      size="sm"
                      loading={isFiltering && selectedLLM !== filter.id}
                      onClick={() => handleFilterChange("llm", filter.id)}
                      disabled={isLoadingResults || filter.resultCount === 0}
                      className="shrink-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap">{filter.name}</span>
                        <Badge
                          variant="outline"
                          className="text-xs text-default"
                        >
                          {filter.resultCount}
                        </Badge>
                      </div>
                    </LoadingButton>
                  ))}
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                {/* View Controls Group */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowVisualization(!showVisualization)}
                    className="shrink-0"
                  >
                    {showVisualization ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline ml-2">
                      {showVisualization ? "Hide" : "Show"} Analytics
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGroupBySession(!groupBySession)}
                    disabled={!selectedWebsite || isLoadingResults}
                    className="shrink-0"
                  >
                    <span className="whitespace-nowrap">
                      {groupBySession ? "Ungroup" : "Group"} by Session
                    </span>
                  </Button>
                </div>

                {/* Actions Group */}
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsHistoryModalOpen(true)}
                    disabled={!selectedWebsite}
                    className="shrink-0"
                  >
                    <History className="h-4 w-4" />
                    <span className="hidden sm:inline ml-2">History</span>
                  </Button>

                  <LoadingButton
                    onClick={() => {
                      if (enforceLimit("websiteAnalyses", "New Analysis")) {
                        setIsConfigModalOpen(true);
                      }
                    }}
                    icon={<Plus className="h-4 w-4" />}
                    disabled={!selectedWebsite || isLoadingResults}
                    className="shrink-0"
                  >
                    <span className="whitespace-nowrap">New Analysis</span>
                    {currentWorkspace && (
                      <Badge variant="outline" className="ml-2 text-xs shrink-0">
                        <span className="text-background whitespace-nowrap">
                          {getRemainingCredits()} left
                        </span>
                      </Badge>
                    )}
                  </LoadingButton>
                </div>
              </div>
            </div>
          )}

          {/* Filter Breadcrumbs */}
          {!loading && !isLoadingResults && hasActiveFilters && (
            <FilterBreadcrumbs
              filters={{
                topic:
                  selectedTopic !== "all"
                    ? capitalizeFirstLetters(getTopicName(selectedTopic))
                    : undefined,
                llm: selectedLLM !== "all" ? selectedLLM : undefined,
                search: searchQuery.trim() || undefined,
              }}
              onRemoveFilter={handleRemoveFilter}
              onClearAll={handleClearFilters}
              resultCount={filteredResults.length}
            />
          )}

          {/* Analysis Visualization */}
          {!loading &&
            !isLoadingResults &&
            showVisualization &&
            filteredResults.length > 0 && (
              <AnalysisVisualization results={filteredResults} />
            )}

          {/* Additional Charts */}
          {!loading &&
            !isLoadingResults &&
            showVisualization &&
            filteredResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <SentimentChart results={filteredResults} />
                <RankingChart results={filteredResults} />
              </div>
            )}

          {/* Results */}
          <div className="space-y-4">
            {isLoadingResults ? (
              <AnalysisListSkeleton />
            ) : groupBySession ? (
              // Grouped view
              <div className="space-y-6">
                {Object.entries(groupedResults.groups || {}).map(([sessionKey, sessionResults]) => {
                  const [sessionId, sessionName] = sessionKey.split(':');
                  return (
                    <div key={sessionKey} className="space-y-3">
                      <div className="flex items-center space-x-2 px-2">
                        <Badge variant="default" className="text-sm">
                          {sessionName}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {sessionResults.length} results
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          ID: {sessionId?.slice(0, 8)}...
                        </Badge>
                      </div>
                      {sessionResults.map((result) => (
                        <Card key={result.id} className="ml-4">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div className="flex-1 flex flex-col gap-3">
                                <CardTitle>{result.prompt}</CardTitle>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline">{result.topic}</Badge>
                                  <Badge variant="outline" className="text-xs">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    {new Date(result.created_at).toLocaleDateString()}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    Confidence:{" "}
                                    {parseFloat(result.confidence.toFixed(2)) * 100}%
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(result)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
                              <MentionIndicator
                                llmResult={result.llm_results.find(
                                  (r) => r.llm_provider === "chatgpt"
                                )}
                                llmName="ChatGPT"
                              />
                              <MentionIndicator
                                llmResult={result.llm_results.find(
                                  (r) => r.llm_provider === "claude"
                                )}
                                llmName="Claude"
                              />
                              <MentionIndicator
                                llmResult={result.llm_results.find(
                                  (r) => r.llm_provider === "gemini"
                                )}
                                llmName="Gemini"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                })}
                {/* Ungrouped results */}
                {groupedResults.ungrouped && groupedResults.ungrouped.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 px-2">
                      <Badge variant="outline" className="text-sm">
                        Ungrouped Results
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {groupedResults.ungrouped.length} results
                      </Badge>
                    </div>
                    {groupedResults.ungrouped.map((result) => (
                      <Card key={result.id} className="ml-4">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div className="flex-1 flex flex-col gap-3">
                              <CardTitle>{result.prompt}</CardTitle>
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline">{result.topic}</Badge>
                                <Badge variant="outline" className="text-xs">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {new Date(result.created_at).toLocaleDateString()}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Confidence:{" "}
                                  {parseFloat(result.confidence.toFixed(2)) * 100}%
                                </Badge>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(result)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
                            <MentionIndicator
                              llmResult={result.llm_results.find(
                                (r) => r.llm_provider === "chatgpt"
                              )}
                              llmName="ChatGPT"
                            />
                            <MentionIndicator
                              llmResult={result.llm_results.find(
                                (r) => r.llm_provider === "claude"
                              )}
                              llmName="Claude"
                            />
                            <MentionIndicator
                              llmResult={result.llm_results.find(
                                (r) => r.llm_provider === "gemini"
                              )}
                              llmName="Gemini"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Ungrouped view
              filteredResults.map((result) => (
                <Card key={result.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 flex flex-col gap-3">
                        <CardTitle>{result.prompt}</CardTitle>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">{result.topic}</Badge>
                          {result.analysis_name && (
                            <Badge variant="secondary" className="text-xs">
                              {result.analysis_name}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(result.created_at).toLocaleDateString()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Confidence:{" "}
                            {parseFloat(result.confidence.toFixed(2)) * 100}%
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(result)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
                      <MentionIndicator
                        llmResult={result.llm_results.find(
                          (r) => r.llm_provider === "chatgpt"
                        )}
                        llmName="ChatGPT"
                      />
                      <MentionIndicator
                        llmResult={result.llm_results.find(
                          (r) => r.llm_provider === "claude"
                        )}
                        llmName="Claude"
                      />
                      <MentionIndicator
                        llmResult={result.llm_results.find(
                          (r) => r.llm_provider === "gemini"
                        )}
                        llmName="Gemini"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Empty State */}
          {!isLoadingResults && filteredResults.length === 0 && (
            <ContextualEmptyState
              hasData={analysisResults.length > 0}
              hasFilters={hasActiveFilters}
              activeFilters={{
                topic: selectedTopic !== "all" ? selectedTopic : undefined,
                llm: selectedLLM !== "all" ? selectedLLM : undefined,
                search: searchQuery.trim() || undefined,
              }}
              onClearFilters={handleClearFilters}
              onCreateAnalysis={createAnalysis}
              isCreatingAnalysis={isLoadingResults}
            />
          )}

          {/* Results Stats */}
          {isLoadingResults ? (
            <AnalysisStatsSkeleton />
          ) : (
            filteredResults.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate">
                  Showing {resultStats.totalCount} of {analysisResults.length}{" "}
                  results
                  {searchQuery && (
                    <span className="hidden sm:inline">
                      {` for "${searchQuery}"`}
                    </span>
                  )}
                </span>
                <div className="flex items-center space-x-4 shrink-0">
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="whitespace-nowrap">{resultStats.mentionedCount} mentions</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <span className="whitespace-nowrap">{resultStats.noMentionCount} no mentions</span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <AnalysisConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          websiteId={selectedWebsite}
        />

        <DetailedAnalysisModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          analysisResult={selectedResult}
        />

        <AnalysisHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          websiteId={selectedWebsite}
          onSelectSession={(sessionId) => {
            // Future: Navigate to session details or filter by session
            console.log("Selected session:", sessionId);
          }}
        />
      </>
    </AnalysisErrorBoundary>
  );
}
