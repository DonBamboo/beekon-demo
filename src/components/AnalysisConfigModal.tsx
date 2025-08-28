import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/LoadingStates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdvancedExportDropdown } from "@/components/ui/export-components";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptionEnforcement } from "@/hooks/useSubscriptionEnforcement";
import { useGlobalCache } from "@/hooks/appStateHooks";
import { analysisService } from "@/services/analysisService";
import { useExportHandler } from "@/lib/export-utils";
import { exportService } from "@/services/exportService";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Plus, Search, X, Zap } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { ExportFormat } from "@/types/database";

const analysisConfigSchema = z.object({
  analysisName: z.string().min(1, "Analysis name is required"),
  topics: z
    .array(z.string())
    .length(1, "Exactly one topic is required per analysis"),
  customPrompts: z.array(z.string()),
  llmModels: z.array(z.string()).min(1, "At least one LLM model is required"),
  priority: z.enum(["high", "medium", "low"]),
  analysisType: z.enum(["comprehensive", "focused", "competitive"]),
  includeCompetitors: z.boolean(),
  generateReport: z.boolean(),
  scheduleAnalysis: z.boolean(),
});

type AnalysisConfigFormData = z.infer<typeof analysisConfigSchema>;

interface AnalysisConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  websiteId?: string;
}

// Fallback topics if no database topics exist - moved outside component for stable reference
const FALLBACK_TOPICS = [
  "AI Tools",
  "Software Solutions",
  "Machine Learning",
  "Data Analytics",
  "Cloud Services",
  "Automation",
  "Business Intelligence",
  "Customer Support",
];

export function AnalysisConfigModal({
  isOpen,
  onClose,
  websiteId,
}: AnalysisConfigModalProps) {
  const { toast } = useToast();
  const { consumeCredit, restoreCredit } = useSubscriptionEnforcement();
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  // Background analysis tracking - no UI state needed
  const activeAnalysisIds = useRef(new Set<string>());
  const [availableTopics, setAvailableTopics] = useState<
    Array<{ id: string; name: string; resultCount: number }>
  >([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const { handleExport } = useExportHandler();
  const { clearCache } = useGlobalCache();

  const availableLLMs = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      description: "OpenAI's conversational AI",
    },
    { id: "claude", name: "Claude", description: "Anthropic's AI assistant" },
    { id: "gemini", name: "Gemini", description: "Google's AI model" },
  ];

  // Load topics for the selected website
  const loadWebsiteTopics = useCallback(async () => {
    if (!websiteId) {
      setAvailableTopics([]);
      return;
    }

    setIsLoadingTopics(true);
    setTopicError(null);

    try {
      const websiteTopics = await analysisService.getTopicsForWebsite(
        websiteId
      );

      if (websiteTopics.length > 0) {
        setAvailableTopics(websiteTopics);
      } else {
        // If no topics exist for this website, show fallback topics as suggestions
        setAvailableTopics(
          FALLBACK_TOPICS.map((topic, index) => ({
            id: `fallback-${index}`,
            name: topic,
            resultCount: 0,
          }))
        );
      }
    } catch (error) {
      // Failed to load website topics
      setTopicError("Failed to load topics. Using default suggestions.");

      // Fallback to default topics on error
      setAvailableTopics(
        FALLBACK_TOPICS.map((topic, index) => ({
          id: `fallback-${index}`,
          name: topic,
          resultCount: 0,
        }))
      );

      toast({
        title: "Warning",
        description:
          "Could not load website-specific topics. Using default suggestions.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTopics(false);
    }
  }, [websiteId, toast]);

  // Load topics when websiteId changes or modal opens
  useEffect(() => {
    if (isOpen && websiteId) {
      loadWebsiteTopics();
    }
  }, [isOpen, websiteId, loadWebsiteTopics]);

  const form = useForm<AnalysisConfigFormData>({
    resolver: zodResolver(analysisConfigSchema),
    defaultValues: {
      analysisName: "",
      topics: [],
      customPrompts: [],
      llmModels: ["chatgpt", "claude", "gemini"],
      priority: "medium",
      analysisType: "comprehensive",
      includeCompetitors: true,
      generateReport: true,
      scheduleAnalysis: false,
    },
  });

  const onSubmit = async (data: AnalysisConfigFormData) => {
    if (!websiteId) {
      toast({
        title: "Error",
        description: "Please select a website to analyze.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    let creditConsumed = false;

    try {
      // Check if user can consume credits
      const canConsume = await consumeCredit();
      if (!canConsume) {
        setIsLoading(false);
        return;
      }
      creditConsumed = true;

      // Create analysis configuration
      const config = {
        analysisName: data.analysisName,
        websiteId,
        topics: data.topics,
        customPrompts: data.customPrompts,
        llmModels: data.llmModels,
        priority: data.priority,
        analysisType: data.analysisType,
        includeCompetitors: data.includeCompetitors,
        generateReport: data.generateReport,
        scheduleAnalysis: data.scheduleAnalysis,
      };

      // Start the analysis
      const sessionId = await analysisService.createAnalysis(config);

      // Clear analysis cache for this website since new analysis is being created
      clearCache(`analysis_results_${websiteId}`);
      clearCache(`analysis_metadata_${websiteId}`);

      // Track this analysis for cleanup
      activeAnalysisIds.current.add(sessionId);

      // Set up background progress monitoring with toast notifications
      analysisService.subscribeToProgress(sessionId, async (progress) => {
        if (progress.status === "completed") {
          toast({
            title: "Analysis completed!",
            description: `${data.analysisName} analysis has been completed successfully.`,
          });

          // Refresh topics list to include any new topics created
          if (websiteId) {
            loadWebsiteTopics();
          }
          
          // Clean up tracking
          activeAnalysisIds.current.delete(sessionId);
        } else if (progress.status === "failed") {
          toast({
            title: "Analysis failed",
            description:
              progress.error ||
              "The analysis failed to complete. Please try again.",
            variant: "destructive",
          });

          // Restore credit if analysis failed after starting
          await restoreCredit();
          
          // Clean up tracking
          activeAnalysisIds.current.delete(sessionId);
        } else {
          // Progress update - only show every few steps to avoid spam
          if (progress.completedSteps % 3 === 0 || progress.progress > 50) {
            toast({
              title: "Analysis in progress",
              description: `${progress.currentStep} (${progress.completedSteps}/${progress.totalSteps})`,
            });
          }
        }
      });

      // Show initial success toast
      toast({
        title: "Analysis started!",
        description: `${data.analysisName} analysis has been queued and will begin shortly.`,
      });

      // Close modal immediately after successful API call
      handleClose();
    } catch (error) {
      // Failed to start analysis

      // Clean up any partial state - nothing to clean up since modal closes immediately on success

      // If we consumed a credit but the operation failed, restore it
      if (creditConsumed) {
        // Restore credit due to failed analysis start
        await restoreCredit();
      }

      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to start analysis. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Clean up any active analysis subscriptions
    activeAnalysisIds.current.forEach(sessionId => {
      analysisService.unsubscribeFromProgress(sessionId);
    });
    activeAnalysisIds.current.clear();
    
    // Reset form state
    setIsLoading(false);
    setTopicError(null);
    setCustomTopic("");
    setCustomPrompt("");
    form.reset();
    onClose();
  };

  const addCustomTopic = () => {
    const trimmedTopic = customTopic.trim();
    if (!trimmedTopic) return;

    const currentTopics = form.watch("topics");

    // For single topic constraint, replace existing topic instead of adding
    if (currentTopics.length >= 1) {
      toast({
        title: "Single Topic Only",
        description:
          "Only one topic is allowed per analysis. This will replace your current topic.",
        variant: "default",
      });
    }

    const existsInAvailable = availableTopics.some(
      (topic) => topic.name.toLowerCase() === trimmedTopic.toLowerCase()
    );

    if (existsInAvailable) {
      // If it exists in available topics, use the exact name from database
      const existingTopic = availableTopics.find(
        (topic) => topic.name.toLowerCase() === trimmedTopic.toLowerCase()
      );
      if (existingTopic) {
        form.setValue("topics", [existingTopic.name]);
      }
    } else {
      // Set as the single topic
      form.setValue("topics", [trimmedTopic]);
    }

    setCustomTopic("");
  };

  const removeTopic = (topicToRemove: string) => {
    const currentTopics = form.watch("topics");
    form.setValue(
      "topics",
      currentTopics.filter((topic) => topic !== topicToRemove)
    );
  };

  const addCustomPrompt = () => {
    if (customPrompt.trim()) {
      const currentPrompts = form.watch("customPrompts");
      form.setValue("customPrompts", [...currentPrompts, customPrompt.trim()]);
      setCustomPrompt("");
    }
  };

  const removePrompt = (index: number) => {
    const currentPrompts = form.watch("customPrompts");
    form.setValue(
      "customPrompts",
      currentPrompts.filter((_, i) => i !== index)
    );
  };

  const toggleLLM = (llmId: string) => {
    const currentLLMs = form.watch("llmModels");
    if (currentLLMs.includes(llmId)) {
      form.setValue(
        "llmModels",
        currentLLMs.filter((id) => id !== llmId)
      );
    } else {
      form.setValue("llmModels", [...currentLLMs, llmId]);
    }
  };

  // Export current analysis configuration
  const handleExportConfiguration = async (format: ExportFormat) => {
    setIsExporting(true);

    try {
      const currentConfig = form.getValues();

      // Prepare configuration data for export
      const configData = {
        ...currentConfig,
        websiteId: websiteId || null,
        createdAt: new Date().toISOString(),
        availableTopics,
        availableLLMs,
        metadata: {
          exportType: "analysis_configuration",
          configVersion: "1.0",
          description:
            "Analysis configuration template that can be imported and reused",
        },
      };

      const blob = await exportService.exportConfigurationData(
        configData,
        "analysis",
        format
      );

      const configName = currentConfig.analysisName || "analysis-config";

      await handleExport(() => Promise.resolve(blob), {
        filename: `${configName.replace(/[^a-zA-Z0-9]/g, "-")}-template`,
        format,
        includeTimestamp: true,
        metadata: {
          configType: "analysis",
          configName,
          topics: currentConfig.topics.length,
          llmModels: currentConfig.llmModels.length,
          customPrompts: currentConfig.customPrompts.length,
        },
      });
    } catch (error) {
      // Export failed
      toast({
        title: "Export failed",
        description: "Failed to export configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center space-x-3">
                <Search className="h-5 w-5" />
                <span>Configure New Analysis</span>
              </DialogTitle>
              <DialogDescription>
                Set up a new analysis with one topic and multiple prompts to
                monitor your brand mentions across AI platforms
              </DialogDescription>
            </div>
            <AdvancedExportDropdown
              onExport={handleExportConfiguration}
              isLoading={isExporting}
              formats={["json", "csv", "pdf"]}
              data={form.getValues()}
              title="Analysis Configuration"
              exportType="analysis_configuration"
              className="ml-4"
              showEstimatedSize={true}
            />
          </div>
        </DialogHeader>



        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Analysis Name */}
          <div className="space-y-2">
            <Label htmlFor="analysisName">Analysis Name</Label>
            <Input
              id="analysisName"
              placeholder="e.g., Q1 Brand Visibility Analysis"
              {...form.register("analysisName")}
              className="focus-ring"
            />
            {form.formState.errors.analysisName && (
              <p className="text-sm text-destructive">
                {form.formState.errors.analysisName.message}
              </p>
            )}
          </div>

          {/* Topics Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Analysis Topic</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Select one topic for this analysis. All prompts will be
                  associated with this topic.
                </p>
              </div>
              {isLoadingTopics && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Spinner size="sm" className="mr-1" />
                  Loading topics...
                </div>
              )}
              {topicError && (
                <div className="flex items-center text-sm text-destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {topicError}
                </div>
              )}
            </div>

            {form.watch("topics").length > 0 && (
              <div className="mb-3 p-3 border rounded-lg bg-primary/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-xs">
                      Selected Topic
                    </Badge>
                    <span className="font-medium">
                      {form.watch("topics")[0]}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      const firstTopic = form.watch("topics")[0];
                      if (firstTopic) removeTopic(firstTopic);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  All prompts in this analysis will be associated with this
                  topic.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {!isLoadingTopics && form.watch("topics").length === 0 && (
                <>
                  <div className="text-sm text-muted-foreground mb-3 p-3 border rounded-lg bg-muted/30">
                    <p className="font-medium mb-1">
                      Choose from existing topics or create a new one:
                    </p>
                    <p className="text-xs">
                      You can select one topic from the suggestions below or add
                      a custom topic.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableTopics.map((topic) => (
                      <Badge
                        key={topic.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent flex items-center gap-1"
                        onClick={() => {
                          const currentTopics = form.watch("topics");
                          if (currentTopics.length >= 1) {
                            toast({
                              title: "Single Topic Only",
                              description:
                                "Only one topic is allowed per analysis. This will replace your current topic.",
                              variant: "default",
                            });
                          }
                          // Replace existing topic with selected one
                          form.setValue("topics", [topic.name]);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        <span>{topic.name}</span>
                        {topic.resultCount > 0 && (
                          <span className="text-xs bg-muted rounded px-1">
                            {topic.resultCount}
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </>
              )}

              {isLoadingTopics && (
                <div className="flex items-center justify-center py-4">
                  <Spinner size="sm" className="mr-2" />
                  <span className="text-sm text-muted-foreground">
                    Loading available topics...
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                <Input
                  placeholder={
                    form.watch("topics").length > 0
                      ? "Enter topic to replace current selection..."
                      : "Add custom topic..."
                  }
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  onKeyPress={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addCustomTopic())
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomTopic}
                >
                  {form.watch("topics").length > 0 ? "Replace" : "Add"}
                </Button>
              </div>
            </div>

            {form.formState.errors.topics && (
              <p className="text-sm text-destructive">
                {form.formState.errors.topics.message}
              </p>
            )}
          </div>

          {/* Custom Prompts */}
          <div className="space-y-3">
            <div>
              <Label>Custom Prompts (Optional)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Add multiple prompts that will all be tested under your selected
                topic.
              </p>
            </div>
            <div className="space-y-2">
              {form.watch("customPrompts").map((prompt, index) => (
                <div
                  key={index}
                  className="flex items-start space-x-2 p-3 border rounded-lg"
                >
                  <span className="text-sm flex-1">{prompt}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePrompt(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Textarea
                placeholder="Enter a custom prompt to test specific scenarios..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
              />
              <Button type="button" variant="outline" onClick={addCustomPrompt}>
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Prompt
              </Button>
            </div>
          </div>

          {/* LLM Models Selection */}
          <div className="space-y-3">
            <Label>AI Models to Analyze</Label>
            <div className="grid grid-cols-2 gap-3">
              {availableLLMs.map((llm) => (
                <div
                  key={llm.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg"
                >
                  <Checkbox
                    checked={form.watch("llmModels").includes(llm.id)}
                    onCheckedChange={() => toggleLLM(llm.id)}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{llm.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {llm.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {form.formState.errors.llmModels && (
              <p className="text-sm text-destructive">
                {form.formState.errors.llmModels.message}
              </p>
            )}
          </div>

          {/* Analysis Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="analysisType">Analysis Type</Label>
              <Select
                value={form.watch("analysisType")}
                onValueChange={(value) =>
                  form.setValue(
                    "analysisType",
                    value as "comprehensive" | "focused" | "competitive"
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comprehensive">Comprehensive</SelectItem>
                  <SelectItem value="focused">Focused</SelectItem>
                  <SelectItem value="competitive">Competitive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={form.watch("priority")}
                onValueChange={(value) =>
                  form.setValue("priority", value as "high" | "medium" | "low")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High Priority</SelectItem>
                  <SelectItem value="medium">Medium Priority</SelectItem>
                  <SelectItem value="low">Low Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={form.watch("includeCompetitors")}
                onCheckedChange={(checked) =>
                  form.setValue("includeCompetitors", !!checked)
                }
              />
              <Label className="text-sm">Include competitor analysis</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                checked={form.watch("generateReport")}
                onCheckedChange={(checked) =>
                  form.setValue("generateReport", !!checked)
                }
              />
              <Label className="text-sm">
                Generate detailed report after analysis
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                checked={form.watch("scheduleAnalysis")}
                onCheckedChange={(checked) =>
                  form.setValue("scheduleAnalysis", !!checked)
                }
              />
              <Label className="text-sm">Schedule for recurring analysis</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={isLoading}
              loadingText="Starting Analysis..."
              icon={<Zap className="h-4 w-4" />}
              disabled={!websiteId}
            >
              Start Analysis
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
