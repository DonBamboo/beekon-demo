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
import { ExportDropdown } from "@/components/ui/export-components";
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
import { UIAnalysisResult, ExportFormat } from "@/types/database";
import { useExportHandler } from "@/lib/export-utils";
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
import { useInfiniteAnalysisResults } from "@/hooks/useInfiniteAnalysisResults";
import { InfiniteScrollContainer } from "@/components/InfiniteScrollContainer";

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

  // New filter states
  const [selectedMentionStatus, setSelectedMentionStatus] = useState("all"); // "all", "mentioned", "not_mentioned"
  const [selectedDateRange, setSelectedDateRange] = useState("all"); // "all", "7d", "30d", "90d", "custom"
  const [customDateRange, setCustomDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [selectedConfidenceRange, setSelectedConfidenceRange] = useState<
    [number, number]
  >([0, 100]);
  const [selectedSentiment, setSelectedSentiment] = useState("all"); // "all", "positive", "neutral", "negative"
  const [selectedAnalysisSession, setSelectedAnalysisSession] = useState("all");

  // Enhanced filtering state
  const [sortBy, setSortBy] = useState<
    "date" | "confidence" | "mentions" | "rank"
  >("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterPresets, setFilterPresets] = useState<
    Array<{
      id: string;
      name: string;
      filters: Record<string, any>;
    }>
  >([]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedSearchQuery, setAdvancedSearchQuery] = useState("");
  const [searchInResponses, setSearchInResponses] = useState(false);
  const [searchInInsights, setSearchInInsights] = useState(false);

  // Performance & UX improvements
  const [showPerformanceStats, setShowPerformanceStats] = useState(false);
  const [infiniteScrollEnabled, setInfiniteScrollEnabled] = useState(true);
  const [initialLoadSize, setInitialLoadSize] = useState(20);
  const [loadMoreSize, setLoadMoreSize] = useState(20);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<UIAnalysisResult | null>(
    null
  );
  const [isFiltering, setIsFiltering] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [topics, setTopics] = useState<
    Array<{ id: string; name: string; resultCount: number }>
  >([]);
  const [availableLLMs, setAvailableLLMs] = useState<
    Array<{ id: string; name: string; resultCount: number }>
  >([]);
  const [availableAnalysisSessions, setAvailableAnalysisSessions] = useState<
    Array<{ id: string; name: string; resultCount: number }>
  >([]);
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [showVisualization, setShowVisualization] = useState(true);
  const [groupBySession, setGroupBySession] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { handleExport } = useExportHandler();

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

  // Debounce advanced search query
  const [debouncedAdvancedSearchQuery, setDebouncedAdvancedSearchQuery] =
    useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAdvancedSearchQuery(advancedSearchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [advancedSearchQuery]);

  // Enhanced search function
  const performAdvancedSearch = useCallback(
    (
      results: UIAnalysisResult[],
      query: string,
      searchInResponses: boolean,
      searchInInsights: boolean
    ) => {
      if (!query.trim()) return results;

      const searchTerm = query.toLowerCase().trim();

      return results.filter((result) => {
        // Basic search in prompt and topic
        if (
          result.prompt.toLowerCase().includes(searchTerm) ||
          result.topic.toLowerCase().includes(searchTerm) ||
          (result.analysis_name &&
            result.analysis_name.toLowerCase().includes(searchTerm))
        ) {
          return true;
        }

        // Search in LLM responses if enabled
        if (searchInResponses) {
          const hasResponseMatch = result.llm_results.some(
            (llm) =>
              llm.response_text?.toLowerCase().includes(searchTerm) ||
              llm.summary_text?.toLowerCase().includes(searchTerm)
          );
          if (hasResponseMatch) return true;
        }

        // Search in insights if enabled
        if (searchInInsights) {
          const hasInsightMatch =
            result.prompt_strengths?.some((strength) =>
              strength.toLowerCase().includes(searchTerm)
            ) ||
            result.prompt_opportunities?.some((opp) =>
              opp.toLowerCase().includes(searchTerm)
            ) ||
            result.recommendation_text?.toLowerCase().includes(searchTerm) ||
            result.reporting_text?.toLowerCase().includes(searchTerm);
          if (hasInsightMatch) return true;
        }

        return false;
      });
    },
    []
  );

  // Sorting utility function
  const sortResults = useCallback(
    (results: UIAnalysisResult[], sortBy: string, sortOrder: string) => {
      return [...results].sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case "date":
            comparison =
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime();
            break;
          case "confidence":
            comparison = a.confidence - b.confidence;
            break;
          case "mentions": {
            const aMentions = a.llm_results.filter(
              (llm) => llm.is_mentioned
            ).length;
            const bMentions = b.llm_results.filter(
              (llm) => llm.is_mentioned
            ).length;
            comparison = aMentions - bMentions;
            break;
          }
          case "rank": {
            const aAvgRank =
              a.llm_results
                .filter((llm) => llm.rank_position !== null)
                .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) /
                a.llm_results.filter((llm) => llm.rank_position !== null)
                  .length || 0;
            const bAvgRank =
              b.llm_results
                .filter((llm) => llm.rank_position !== null)
                .reduce((sum, llm) => sum + (llm.rank_position || 0), 0) /
                b.llm_results.filter((llm) => llm.rank_position !== null)
                  .length || 0;
            comparison = aAvgRank - bAvgRank;
            break;
          }
          default:
            comparison = 0;
        }

        return sortOrder === "asc" ? comparison : -comparison;
      });
    },
    []
  );

  // Calculate date range based on selection
  const dateRange = useMemo(() => {
    if (selectedDateRange === "all") return undefined;

    const now = new Date();
    if (selectedDateRange === "custom" && customDateRange) {
      return customDateRange;
    } else {
      const days = parseInt(selectedDateRange.replace("d", ""));
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return {
        start: startDate.toISOString(),
        end: now.toISOString(),
      };
    }
  }, [selectedDateRange, customDateRange]);

  // Helper function to get topic name for filtering
  const getTopicNameForFilter = useCallback(
    (topicId: string): string | undefined => {
      if (topicId === "all") return undefined;

      const topic = topics.find((topic) => topic.id === topicId);
      return topic?.name;
    },
    [topics]
  );

  // Prepare filters for infinite scroll hook
  const filters = useMemo(
    () => ({
      topic: getTopicNameForFilter(selectedTopic),
      llmProvider: selectedLLM !== "all" ? selectedLLM : undefined,
      searchQuery: debouncedSearchQuery.trim() || undefined,
      mentionStatus:
        selectedMentionStatus !== "all" ? selectedMentionStatus : undefined,
      dateRange,
      confidenceRange:
        selectedConfidenceRange[0] > 0 || selectedConfidenceRange[1] < 100
          ? selectedConfidenceRange
          : undefined,
      sentiment: selectedSentiment !== "all" ? selectedSentiment : undefined,
      analysisSession:
        selectedAnalysisSession !== "all" ? selectedAnalysisSession : undefined,
    }),
    [
      selectedTopic,
      selectedLLM,
      debouncedSearchQuery,
      selectedMentionStatus,
      dateRange,
      selectedConfidenceRange,
      selectedSentiment,
      selectedAnalysisSession,
      getTopicNameForFilter,
    ]
  );

  // Use infinite scroll hook for data management
  const {
    loadedResults: analysisResults,
    hasMore,
    isLoading: isLoadingResults,
    isLoadingMore,
    error: infiniteScrollError,
    loadMore,
    refresh: refreshResults,
    totalLoaded,
  } = useInfiniteAnalysisResults(
    selectedWebsite || "",
    filters,
    debouncedAdvancedSearchQuery,
    searchInResponses,
    searchInInsights,
    sortBy,
    sortOrder,
    {
      initialLimit: initialLoadSize,
      loadMoreLimit: loadMoreSize,
    }
  );

  // Handle infinite scroll errors
  useEffect(() => {
    if (infiniteScrollError) {
      handleError(infiniteScrollError);
      toast({
        title: "Error",
        description: "Failed to load analysis results. Please try again.",
        variant: "destructive",
      });
    }
  }, [infiniteScrollError, handleError, toast]);

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

  // Load available analysis sessions for the selected website
  const loadAvailableAnalysisSessions = useCallback(async () => {
    if (!selectedWebsite) return;

    try {
      // For now, we'll extract sessions from the analysis results
      // In a future version, this could be a separate API endpoint
      const results = await analysisService.getAnalysisResults(
        selectedWebsite,
        {}
      );

      // Group by analysis session
      const sessionsMap = new Map<string, { name: string; count: number }>();
      results.forEach((result) => {
        if (result.analysis_session_id && result.analysis_name) {
          const key = result.analysis_session_id;
          const existing = sessionsMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            sessionsMap.set(key, {
              name: result.analysis_name,
              count: 1,
            });
          }
        }
      });

      const sessions = Array.from(sessionsMap.entries()).map(([id, info]) => ({
        id,
        name: info.name,
        resultCount: info.count,
      }));

      setAvailableAnalysisSessions(sessions);
    } catch (error) {
      console.error("Failed to load available analysis sessions:", error);
      // Don't handle error here as it's not critical
      setAvailableAnalysisSessions([]);
    }
  }, [selectedWebsite]);

  // Load data when dependencies change
  // Consolidated filter and data management
  useEffect(() => {
    // Load metadata (topics, LLMs, and sessions) when website changes
    if (selectedWebsite) {
      loadTopics();
      loadAvailableLLMs();
      loadAvailableAnalysisSessions();
    }
  }, [
    selectedWebsite,
    loadTopics,
    loadAvailableLLMs,
    loadAvailableAnalysisSessions,
  ]);

  // No longer needed - infinite scroll hook handles data loading automatically

  // Improved filter validation with debouncing to prevent unnecessary resets
  useEffect(() => {
    // Only validate if we have topics loaded and a specific topic selected
    if (topics.length > 0 && selectedTopic !== "all") {
      const topicExists = topics.some((topic) => topic.id === selectedTopic);
      if (!topicExists) {
        // Add a small delay to prevent unnecessary state updates during rapid data changes
        const timeoutId = setTimeout(() => {
          console.log(
            `Topic "${selectedTopic}" no longer exists, resetting to "all"`
          );
          setSelectedTopic("all");
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [topics, selectedTopic]);

  useEffect(() => {
    if (availableLLMs.length > 0 && selectedLLM !== "all") {
      const llmExists = availableLLMs.some((llm) => llm.id === selectedLLM);
      if (!llmExists) {
        // Add a small delay to prevent unnecessary state updates during rapid data changes
        const timeoutId = setTimeout(() => {
          console.log(
            `LLM "${selectedLLM}" no longer exists, resetting to "all"`
          );
          setSelectedLLM("all");
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [availableLLMs, selectedLLM]);

  // No need for legacy format transformation - work directly with modern format
  // Use analysisResults directly from infinite scroll hook

  // Group results by session if requested
  const groupedResults = useMemo(() => {
    if (!groupBySession) {
      return { ungrouped: analysisResults };
    }

    const groups: Record<string, UIAnalysisResult[]> = {};
    const ungrouped: UIAnalysisResult[] = [];

    analysisResults.forEach((result) => {
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
  }, [analysisResults, groupBySession]);

  // Memoize expensive statistics calculations
  const resultStats = useMemo(() => {
    const mentionedCount = analysisResults.filter((r) =>
      r.llm_results.some((llm) => llm.is_mentioned)
    ).length;

    const noMentionCount = analysisResults.filter(
      (r) => !r.llm_results.some((llm) => llm.is_mentioned)
    ).length;

    return {
      mentionedCount,
      noMentionCount,
      totalCount: analysisResults.length,
    };
  }, [analysisResults]);

  // Performance monitoring and optimization
  const performanceStats = useMemo(() => {
    const startTime = performance.now();

    const totalResults = analysisResults.length;
    const totalLLMResults = analysisResults.reduce(
      (sum, r) => sum + r.llm_results.length,
      0
    );
    const uniqueTopics = new Set(analysisResults.map((r) => r.topic)).size;
    const uniqueSessions = new Set(
      analysisResults.map((r) => r.analysis_session_id).filter(Boolean)
    ).size;

    const endTime = performance.now();
    const calculationTime = endTime - startTime;

    return {
      totalResults,
      totalLLMResults,
      uniqueTopics,
      uniqueSessions,
      calculationTime: Math.round(calculationTime * 100) / 100,
      averageConfidence:
        resultStats.mentionedCount > 0
          ? (
              (analysisResults.reduce((sum, r) => sum + r.confidence, 0) /
                analysisResults.length) *
              100
            ).toFixed(1)
          : "0",
    };
  }, [analysisResults, resultStats]);

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
    setSelectedMentionStatus("all");
    setSelectedDateRange("all");
    setCustomDateRange(null);
    setSelectedConfidenceRange([0, 100]);
    setSelectedSentiment("all");
    setSelectedAnalysisSession("all");
  };

  const getTopicName = (id: string): string => {
    if (!id) {
      return "";
    }

    const topic = topics.find((topic) => topic.id === id);
    return topic?.name || "";
  };

  // Filter preset management
  const saveFilterPreset = useCallback(
    (name: string) => {
      const preset = {
        id: Date.now().toString(),
        name,
        filters: {
          selectedTopic,
          selectedLLM,
          selectedMentionStatus,
          selectedDateRange,
          customDateRange,
          selectedConfidenceRange,
          selectedSentiment,
          selectedAnalysisSession,
          searchQuery,
          sortBy,
          sortOrder,
        },
      };

      const updatedPresets = [...filterPresets, preset];
      setFilterPresets(updatedPresets);
      localStorage.setItem(
        "analysisFilterPresets",
        JSON.stringify(updatedPresets)
      );

      toast({
        title: "Filter Preset Saved",
        description: `"${name}" has been saved as a filter preset.`,
      });
    },
    [
      selectedTopic,
      selectedLLM,
      selectedMentionStatus,
      selectedDateRange,
      customDateRange,
      selectedConfidenceRange,
      selectedSentiment,
      selectedAnalysisSession,
      searchQuery,
      sortBy,
      sortOrder,
      filterPresets,
      toast,
    ]
  );

  const loadFilterPreset = useCallback(
    (preset: any) => {
      setSelectedTopic(preset.filters.selectedTopic || "all");
      setSelectedLLM(preset.filters.selectedLLM || "all");
      setSelectedMentionStatus(preset.filters.selectedMentionStatus || "all");
      setSelectedDateRange(preset.filters.selectedDateRange || "all");
      setCustomDateRange(preset.filters.customDateRange || null);
      setSelectedConfidenceRange(
        preset.filters.selectedConfidenceRange || [0, 100]
      );
      setSelectedSentiment(preset.filters.selectedSentiment || "all");
      setSelectedAnalysisSession(
        preset.filters.selectedAnalysisSession || "all"
      );
      setSearchQuery(preset.filters.searchQuery || "");
      setSortBy(preset.filters.sortBy || "date");
      setSortOrder(preset.filters.sortOrder || "desc");

      toast({
        title: "Filter Preset Loaded",
        description: `"${preset.name}" filters have been applied.`,
      });
    },
    [toast]
  );

  // Load filter presets from localStorage on mount
  useEffect(() => {
    const savedPresets = localStorage.getItem("analysisFilterPresets");
    if (savedPresets) {
      try {
        setFilterPresets(JSON.parse(savedPresets));
      } catch {
        setFilterPresets([]);
      }
    }
  }, []);

  // Quick preset filters
  const quickPresets = [
    {
      name: "High Confidence",
      filters: {
        selectedConfidenceRange: [80, 100] as [number, number],
        sortBy: "confidence" as const,
        sortOrder: "desc" as const,
      },
    },
    {
      name: "Recent Mentions",
      filters: {
        selectedMentionStatus: "mentioned",
        selectedDateRange: "7d",
        sortBy: "date" as const,
        sortOrder: "desc" as const,
      },
    },
    {
      name: "Top Rankings",
      filters: {
        selectedMentionStatus: "mentioned",
        sortBy: "rank" as const,
        sortOrder: "asc" as const,
      },
    },
    {
      name: "Positive Sentiment",
      filters: {
        selectedSentiment: "positive",
        sortBy: "confidence" as const,
        sortOrder: "desc" as const,
      },
    },
  ];

  const applyQuickPreset = useCallback(
    (preset: (typeof quickPresets)[0]) => {
      if (preset.filters.selectedConfidenceRange) {
        setSelectedConfidenceRange(preset.filters.selectedConfidenceRange);
      }
      if (preset.filters.selectedMentionStatus) {
        setSelectedMentionStatus(preset.filters.selectedMentionStatus);
      }
      if (preset.filters.selectedDateRange) {
        setSelectedDateRange(preset.filters.selectedDateRange);
      }
      if (preset.filters.selectedSentiment) {
        setSelectedSentiment(preset.filters.selectedSentiment);
      }
      if (preset.filters.sortBy) {
        setSortBy(preset.filters.sortBy);
      }
      if (preset.filters.sortOrder) {
        setSortOrder(preset.filters.sortOrder);
      }

      toast({
        title: "Quick Filter Applied",
        description: `"${preset.name}" filter has been applied.`,
      });
    },
    [toast]
  );

  // Clear all filters function
  const clearAllFilters = useCallback(() => {
    setSelectedTopic("all");
    setSelectedLLM("all");
    setSelectedMentionStatus("all");
    setSelectedDateRange("all");
    setCustomDateRange(null);
    setSelectedConfidenceRange([0, 100]);
    setSelectedSentiment("all");
    setSelectedAnalysisSession("all");
    setSearchQuery("");
    setAdvancedSearchQuery("");
    setSearchInResponses(false);
    setSearchInInsights(false);
    setSortBy("date");
    setSortOrder("desc");

    toast({
      title: "Filters Cleared",
      description: "All filters have been reset to default values.",
    });
  }, [toast]);

  const handleRemoveFilter = (
    filterType:
      | "topic"
      | "llm"
      | "search"
      | "mentionStatus"
      | "dateRange"
      | "confidence"
      | "sentiment"
      | "analysisSession"
  ) => {
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
      case "mentionStatus":
        setSelectedMentionStatus("all");
        break;
      case "dateRange":
        setSelectedDateRange("all");
        setCustomDateRange(null);
        break;
      case "confidence":
        setSelectedConfidenceRange([0, 100]);
        break;
      case "sentiment":
        setSelectedSentiment("all");
        break;
      case "analysisSession":
        setSelectedAnalysisSession("all");
        break;
    }
  };

  const handleExportData = async (format: ExportFormat) => {
    if (!analysisResults || analysisResults.length === 0) {
      toast({
        title: "No Data to Export",
        description:
          "Please ensure you have analysis results before exporting.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);

    try {
      // Extract analysis IDs for export
      const analysisIds = analysisResults.map((result) => result.id);

      // Export with comprehensive options using the analysisService
      const blob = await analysisService.exportAnalysisResults(
        analysisIds,
        format
      );

      await handleExport(() => Promise.resolve(blob), {
        filename: `analysis-results-${new Date().toISOString().split("T")[0]}`,
        format,
        includeTimestamp: true,
        metadata: {
          resultCount: analysisResults.length,
          exportType: "analysis_results",
          filters: {
            topic: selectedTopic !== "all" ? getTopicName(selectedTopic) : null,
            llm: selectedLLM !== "all" ? selectedLLM : null,
            search: searchQuery || null,
          },
        },
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred during export.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const hasActiveFilters =
    selectedTopic !== "all" ||
    selectedLLM !== "all" ||
    searchQuery.trim() !== "" ||
    selectedMentionStatus !== "all" ||
    selectedDateRange !== "all" ||
    selectedConfidenceRange[0] > 0 ||
    selectedConfidenceRange[1] < 100 ||
    selectedSentiment !== "all" ||
    selectedAnalysisSession !== "all";

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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">Analysis Results</h1>
              <p className="text-muted-foreground">
                Detailed analysis of your brand mentions across AI platforms
              </p>
            </div>
            {analysisResults && analysisResults.length > 0 && (
              <ExportDropdown
                onExport={handleExportData}
                isLoading={isExporting}
                disabled={!analysisResults || analysisResults.length === 0}
                formats={["pdf", "csv", "json", "word"]}
                data={analysisResults}
                showEstimatedSize={true}
              />
            )}
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
                    onClick={() => retryOperation(refreshResults)}
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
                {/* Date Range Filter Row */}
                <div className="flex flex-wrap gap-2 items-center">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Date Range:
                  </span>
                  {[
                    { id: "all", name: "All Time" },
                    { id: "7d", name: "Last 7 Days" },
                    { id: "30d", name: "Last 30 Days" },
                    { id: "90d", name: "Last 90 Days" },
                  ].map((filter) => (
                    <LoadingButton
                      key={filter.id}
                      variant={
                        selectedDateRange === filter.id ? "default" : "outline"
                      }
                      size="sm"
                      loading={isFiltering && selectedDateRange !== filter.id}
                      onClick={() => setSelectedDateRange(filter.id)}
                      disabled={isLoadingResults}
                      className="shrink-0"
                    >
                      <span className="whitespace-nowrap">{filter.name}</span>
                    </LoadingButton>
                  ))}
                </div>

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
                              <Badge
                                variant="outline"
                                className="ml-2 text-xs shrink-0"
                              >
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

                {/* Third Row: Mention Status Filter */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-medium text-muted-foreground">
                    Mention Status:
                  </span>
                  {[
                    { id: "all", name: "All Results", icon: null },
                    {
                      id: "mentioned",
                      name: "Mentioned",
                      icon: <Check className="h-3 w-3" />,
                    },
                    {
                      id: "not_mentioned",
                      name: "Not Mentioned",
                      icon: <X className="h-3 w-3" />,
                    },
                  ].map((filter) => (
                    <LoadingButton
                      key={filter.id}
                      variant={
                        selectedMentionStatus === filter.id
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      loading={
                        isFiltering && selectedMentionStatus !== filter.id
                      }
                      onClick={() => setSelectedMentionStatus(filter.id)}
                      disabled={isLoadingResults}
                      className="shrink-0"
                    >
                      <div className="flex items-center gap-1">
                        {filter.icon}
                        <span className="whitespace-nowrap">{filter.name}</span>
                      </div>
                    </LoadingButton>
                  ))}
                </div>

                {/* Advanced Filters Toggle */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Advanced Filters
                    {showAdvancedFilters ? (
                      <div className="ml-2 rotate-180 transition-transform">
                        ▼
                      </div>
                    ) : (
                      <div className="ml-2 transition-transform">▼</div>
                    )}
                  </Button>
                  {(selectedTopic !== "all" ||
                    selectedLLM !== "all" ||
                    selectedMentionStatus !== "all" ||
                    selectedDateRange !== "all" ||
                    selectedConfidenceRange[0] > 0 ||
                    selectedConfidenceRange[1] < 100 ||
                    selectedSentiment !== "all" ||
                    selectedAnalysisSession !== "all" ||
                    searchQuery.trim() ||
                    advancedSearchQuery.trim() ||
                    sortBy !== "date" ||
                    sortOrder !== "desc") && (
                    <>
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear All
                      </Button>
                    </>
                  )}
                </div>

                {/* Advanced Filters Section */}
                {showAdvancedFilters && (
                  <div className="space-y-4 p-4 bg-muted/20 rounded-lg border">
                    {/* Confidence Range Filter */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          Confidence Score Range
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {selectedConfidenceRange[0]}% -{" "}
                          {selectedConfidenceRange[1]}%
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={selectedConfidenceRange[0]}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setSelectedConfidenceRange([
                              value,
                              Math.max(value, selectedConfidenceRange[1]),
                            ]);
                          }}
                          className="flex-1"
                          disabled={isLoadingResults}
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={selectedConfidenceRange[1]}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setSelectedConfidenceRange([
                              Math.min(selectedConfidenceRange[0], value),
                              value,
                            ]);
                          }}
                          className="flex-1"
                          disabled={isLoadingResults}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Sentiment Filter */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Sentiment</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: "all", name: "All Sentiments" },
                          {
                            id: "positive",
                            name: "Positive",
                            color: "text-green-600",
                          },
                          {
                            id: "neutral",
                            name: "Neutral",
                            color: "text-gray-600",
                          },
                          {
                            id: "negative",
                            name: "Negative",
                            color: "text-red-600",
                          },
                        ].map((filter) => (
                          <Button
                            key={filter.id}
                            variant={
                              selectedSentiment === filter.id
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() => setSelectedSentiment(filter.id)}
                            disabled={isLoadingResults}
                            className={`shrink-0 ${filter.color || ""}`}
                          >
                            <span className="whitespace-nowrap">
                              {filter.name}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Analysis Session Filter */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Analysis Session
                      </label>
                      <Select
                        value={selectedAnalysisSession}
                        onValueChange={setSelectedAnalysisSession}
                        disabled={isLoadingResults}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select analysis session" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sessions</SelectItem>
                          {availableAnalysisSessions.map((session) => (
                            <SelectItem key={session.id} value={session.id}>
                              <div className="flex justify-between items-center w-full">
                                <span className="truncate">{session.name}</span>
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-xs shrink-0"
                                >
                                  {session.resultCount}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Enhanced Search Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">
                          Enhanced Search
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowAdvancedSearch(!showAdvancedSearch)
                          }
                          className="text-xs"
                        >
                          {showAdvancedSearch ? "Simple" : "Advanced"} Search
                        </Button>
                      </div>

                      {showAdvancedSearch && (
                        <div className="space-y-3">
                          <Input
                            placeholder="Advanced search in analysis data..."
                            value={advancedSearchQuery}
                            onChange={(e) =>
                              setAdvancedSearchQuery(e.target.value)
                            }
                            disabled={isLoadingResults}
                          />
                          <div className="flex flex-wrap gap-2">
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={searchInResponses}
                                onChange={(e) =>
                                  setSearchInResponses(e.target.checked)
                                }
                                className="w-3 h-3"
                              />
                              Search in LLM responses
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={searchInInsights}
                                onChange={(e) =>
                                  setSearchInInsights(e.target.checked)
                                }
                                className="w-3 h-3"
                              />
                              Search in insights & recommendations
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sort Options */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Sort Results
                      </label>
                      <div className="flex gap-2">
                        <Select
                          value={sortBy}
                          onValueChange={(value: any) => setSortBy(value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="confidence">
                              Confidence
                            </SelectItem>
                            <SelectItem value="mentions">Mentions</SelectItem>
                            <SelectItem value="rank">Average Rank</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={sortOrder}
                          onValueChange={(value: any) => setSortOrder(value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desc">↓ Desc</SelectItem>
                            <SelectItem value="asc">↑ Asc</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Quick Filters
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {quickPresets.map((preset) => (
                          <Button
                            key={preset.name}
                            variant="secondary"
                            size="sm"
                            onClick={() => applyQuickPreset(preset)}
                            className="text-xs"
                          >
                            {preset.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Filter Presets */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Saved Presets
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {filterPresets.map((preset) => (
                          <Button
                            key={preset.id}
                            variant="outline"
                            size="sm"
                            onClick={() => loadFilterPreset(preset)}
                            className="text-xs"
                          >
                            {preset.name}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const name = prompt("Enter preset name:");
                            if (name) saveFilterPreset(name);
                          }}
                          className="text-xs border-dashed border-2"
                        >
                          + Save Current
                        </Button>
                      </div>
                    </div>

                    {/* Performance Options */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Performance</label>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowPerformanceStats(!showPerformanceStats)
                          }
                          className="text-xs"
                        >
                          {showPerformanceStats ? "Hide" : "Show"} Stats
                        </Button>
                        <div className="flex items-center gap-2 text-xs">
                          <span>Initial load:</span>
                          <select
                            value={initialLoadSize}
                            onChange={(e) => {
                              setInitialLoadSize(Number(e.target.value));
                            }}
                            className="border rounded px-2 py-1"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span>Load more:</span>
                          <select
                            value={loadMoreSize}
                            onChange={(e) => {
                              setLoadMoreSize(Number(e.target.value));
                            }}
                            className="border rounded px-2 py-1"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={infiniteScrollEnabled}
                            onChange={(e) =>
                              setInfiniteScrollEnabled(e.target.checked)
                            }
                            className="w-3 h-3"
                          />
                          Infinite scroll
                        </label>
                      </div>

                      {/* Performance Stats */}
                      {showPerformanceStats && (
                        <div className="bg-muted/10 p-3 rounded text-xs space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            <span>Loaded: {totalLoaded}</span>
                            <span>Has More: {hasMore ? "Yes" : "No"}</span>
                            <span>Loading: {isLoadingMore ? "Yes" : "No"}</span>
                            <span>
                              Scroll: {infiniteScrollEnabled ? "On" : "Off"}
                            </span>
                            <span>Initial: {initialLoadSize}</span>
                            <span>Load More: {loadMoreSize}</span>
                          </div>
                          {infiniteScrollError && (
                            <div className="text-red-500 text-xs">
                              Error: {infiniteScrollError.message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                      <Badge
                        variant="outline"
                        className="ml-2 text-xs shrink-0"
                      >
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
              resultCount={analysisResults.length}
            />
          )}

          {/* Analysis Visualization */}
          {!loading &&
            !isLoadingResults &&
            showVisualization &&
            analysisResults.length > 0 && (
              <AnalysisVisualization results={analysisResults} />
            )}

          {/* Additional Charts */}
          {!loading &&
            !isLoadingResults &&
            showVisualization &&
            analysisResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <SentimentChart results={analysisResults} />
                <RankingChart results={analysisResults} />
              </div>
            )}

          {/* Results */}
          <div className="space-y-4">
            {isLoadingResults ? (
              <AnalysisListSkeleton />
            ) : groupBySession ? (
              // Grouped view
              <div className="space-y-6">
                {Object.entries(groupedResults.groups || {}).map(
                  ([sessionKey, sessionResults]) => {
                    const [sessionId, sessionName] = sessionKey.split(":");
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
                                    <Badge variant="outline">
                                      {result.topic}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      <Calendar className="h-3 w-3 mr-1" />
                                      {new Date(
                                        result.created_at
                                      ).toLocaleDateString()}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      Confidence:{" "}
                                      {parseFloat(
                                        result.confidence.toFixed(2)
                                      ) * 100}
                                      %
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
                  }
                )}
                {/* Ungrouped results */}
                {groupedResults.ungrouped &&
                  groupedResults.ungrouped.length > 0 && (
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
                                  <Badge variant="outline">
                                    {result.topic}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    {new Date(
                                      result.created_at
                                    ).toLocaleDateString()}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    Confidence:{" "}
                                    {parseFloat(result.confidence.toFixed(2)) *
                                      100}
                                    %
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
              // Infinite scroll ungrouped view
              <InfiniteScrollContainer
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
                enabled={infiniteScrollEnabled}
                className="space-y-4"
              >
                {analysisResults.map((result) => (
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
                ))}
              </InfiniteScrollContainer>
            )}
          </div>

          {/* Empty State */}
          {!isLoadingResults && analysisResults.length === 0 && (
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
            analysisResults.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate">
                  Loaded {totalLoaded} results
                  {hasMore && " (more available)"}
                  {searchQuery && (
                    <span className="hidden sm:inline">
                      {` for "${searchQuery}"`}
                    </span>
                  )}
                </span>
                <div className="flex items-center space-x-4 shrink-0">
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="whitespace-nowrap">
                      {
                        analysisResults.filter((r) =>
                          r.llm_results.some((llm) => llm.is_mentioned)
                        ).length
                      }{" "}
                      mentions
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <span className="whitespace-nowrap">
                      {
                        analysisResults.filter(
                          (r) => !r.llm_results.some((llm) => llm.is_mentioned)
                        ).length
                      }{" "}
                      no mentions
                    </span>
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
          }}
        />
      </>
    </AnalysisErrorBoundary>
  );
}
