import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { useGlobalCache } from "@/hooks/appStateHooks";
import {
  analysisService,
  type AnalysisStatus,
  type AnalysisConfig,
  type AnalysisProgress,
} from "@/services/analysisService";
import { UIAnalysisResult } from "@/types/database";

export interface AnalysisFilters {
  topic?: string;
  llmProvider?: string;
  status?: AnalysisStatus;
  dateRange?: { start: string; end: string };
  searchQuery?: string;
}

// Query keys for consistent caching
export const analysisKeys = {
  all: ['analysis'] as const,
  results: (websiteId: string, filters?: AnalysisFilters) => 
    [...analysisKeys.all, 'results', websiteId, filters] as const,
  topics: (websiteId: string) => 
    [...analysisKeys.all, 'topics', websiteId] as const,
  llmProviders: (websiteId: string) => 
    [...analysisKeys.all, 'llmProviders', websiteId] as const,
  progress: (analysisId: string) => 
    [...analysisKeys.all, 'progress', analysisId] as const,
};

export function useAnalysisResults(
  websiteId: string,
  filters?: AnalysisFilters
) {
  return useQuery({
    queryKey: analysisKeys.results(websiteId, filters),
    queryFn: () => analysisService.getAnalysisResults(websiteId, filters),
    enabled: !!websiteId,
    staleTime: 2 * 60 * 1000, // 2 minutes - analysis results change frequently
    select: (data) => {
      // Client-side filtering and sorting for better performance
      let filteredData = data;

      // Apply additional client-side filters if needed
      if (filters?.llmProvider && filters.llmProvider !== "all") {
        filteredData = filteredData.filter(result => 
          result.llm_results.some(llm => llm.llm_provider === filters.llmProvider)
        );
      }

      return filteredData;
    },
  });
}

export function useAnalysisTopics(websiteId: string) {
  return useQuery({
    queryKey: analysisKeys.topics(websiteId),
    queryFn: () => analysisService.getTopicsForWebsite(websiteId),
    enabled: !!websiteId,
    staleTime: 10 * 60 * 1000, // 10 minutes - topics change infrequently
  });
}

export function useAnalysisLLMProviders(websiteId: string) {
  return useQuery({
    queryKey: analysisKeys.llmProviders(websiteId),
    queryFn: () => analysisService.getAvailableLLMProviders(websiteId),
    enabled: !!websiteId,
    staleTime: 10 * 60 * 1000, // 10 minutes - LLM providers change infrequently
  });
}

export function useAnalysisProgress(analysisId: string) {
  return useQuery({
    queryKey: analysisKeys.progress(analysisId),
    queryFn: () => analysisService.getCurrentProgress(analysisId),
    enabled: !!analysisId,
    refetchInterval: 2000, // Poll every 2 seconds for progress updates
    staleTime: 0, // Always considered stale for real-time updates
  });
}

// Combined analysis data hook with parallel queries
export function useAnalysisData(websiteId: string, filters?: AnalysisFilters) {
  const resultsQuery = useAnalysisResults(websiteId, filters);
  const topicsQuery = useAnalysisTopics(websiteId);
  const llmProvidersQuery = useAnalysisLLMProviders(websiteId);

  return {
    results: resultsQuery.data || [],
    topics: topicsQuery.data || [],
    llmProviders: llmProvidersQuery.data || [],
    isLoading: resultsQuery.isLoading || topicsQuery.isLoading || llmProvidersQuery.isLoading,
    isRefreshing: resultsQuery.isFetching || topicsQuery.isFetching || llmProvidersQuery.isFetching,
    error: resultsQuery.error || topicsQuery.error || llmProvidersQuery.error,
    refetch: () => {
      resultsQuery.refetch();
      topicsQuery.refetch();
      llmProvidersQuery.refetch();
    },
    hasData: resultsQuery.data && resultsQuery.data.length > 0,
  };
}

// Mutations for analysis operations
export function useCreateAnalysis() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { clearCache } = useGlobalCache();

  return useMutation({
    mutationFn: (config: AnalysisConfig) => analysisService.createAnalysis(config),
    onSuccess: (analysisId, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: analysisKeys.results(variables.websiteId) });
      queryClient.invalidateQueries({ queryKey: analysisKeys.topics(variables.websiteId) });
      
      // Clear global app state cache for this website
      clearCache(`analysis_results_${variables.websiteId}`);
      clearCache(`analysis_metadata_${variables.websiteId}`);
      
      toast({
        title: "Analysis started",
        description: `Analysis "${variables.analysisName}" has been started successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error starting analysis",
        description: error instanceof Error ? error.message : "Failed to start analysis",
        variant: "destructive",
      });
    },
  });
}

export function useSaveAnalysisResult() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (result: {
      promptId: string;
      llmProvider: string;
      websiteId: string;
      isMentioned: boolean;
      rankPosition?: number;
      sentimentScore?: number;
      responseText?: string;
      confidenceScore?: number;
    }) => analysisService.saveAnalysisResult(result),
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: analysisKeys.results(variables.websiteId) });
      
      toast({
        title: "Analysis result saved",
        description: "Analysis result has been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error saving analysis result",
        description: error instanceof Error ? error.message : "Failed to save analysis result",
        variant: "destructive",
      });
    },
  });
}

export function useExportAnalysis() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ analysisIds, format }: { analysisIds: string[]; format: "pdf" | "csv" | "json" }) =>
      analysisService.exportAnalysisResults(analysisIds, format),
    onSuccess: (blob, variables) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analysis-${Date.now()}.${variables.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `Analysis data exported as ${variables.format.toUpperCase()}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export analysis data",
        variant: "destructive",
      });
    },
  });
}

// Hook for real-time analysis progress tracking
export function useAnalysisProgressTracking(analysisId: string) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: analysisKeys.progress(analysisId),
    queryFn: () => analysisService.getCurrentProgress(analysisId),
    enabled: !!analysisId,
    refetchInterval: (data) => {
      // Stop polling if analysis is completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
    staleTime: 0,
    onSettled: (data) => {
      // If analysis is completed, invalidate analysis results
      if (data?.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: analysisKeys.all });
      }
    },
  });
}