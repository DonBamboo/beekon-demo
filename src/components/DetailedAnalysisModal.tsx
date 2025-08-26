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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingButton } from "@/components/ui/loading-button";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { analysisService } from "@/services/analysisService";
import { InsightService } from "@/services/insightService";
import { UIAnalysisResult } from "@/types/database";
import {
  BarChart3,
  ChevronDown,
  Code,
  Copy,
  Download,
  FileText,
  Lightbulb,
  Minus,
  Share,
  Table,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

interface DetailedAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: UIAnalysisResult | null;
}

export function DetailedAnalysisModal({
  isOpen,
  onClose,
  analysisResult,
}: DetailedAnalysisModalProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Generate insights dynamically
  const insights = useMemo(() => {
    if (!analysisResult) {
      return {
        strengths: [],
        opportunities: [],
        recommendations: [],
        summary: "No analysis data available",
        generatedAt: new Date().toISOString(),
        sources: {
          summary: "calculated" as const,
          strengths: "calculated" as const,
          opportunities: "calculated" as const,
          recommendations: "calculated" as const,
        },
      };
    }

    try {
      // Validate that llm_results exists and is an array
      if (
        !analysisResult.llm_results ||
        !Array.isArray(analysisResult.llm_results)
      ) {
        return {
          strengths: [],
          opportunities: [],
          recommendations: [
            "Unable to generate insights - invalid analysis data",
          ],
          summary: "Analysis data is incomplete or corrupted",
          generatedAt: new Date().toISOString(),
          sources: {
            summary: "calculated" as const,
            strengths: "calculated" as const,
            opportunities: "calculated" as const,
            recommendations: "calculated" as const,
          },
        };
      }

      // Pass UIAnalysisResult directly to InsightService (now supports prompt-specific data)
      return InsightService.generateInsights([analysisResult]);
    } catch (error) {
      // Error generating insights
      return {
        strengths: [],
        opportunities: [],
        recommendations: ["Unable to generate insights due to an error"],
        summary: "Error occurred while analyzing the data",
        generatedAt: new Date().toISOString(),
        sources: {
          summary: "calculated" as const,
          strengths: "calculated" as const,
          opportunities: "calculated" as const,
          recommendations: "calculated" as const,
        },
      };
    }
  }, [analysisResult]);

  if (!analysisResult) return null;

  const handleExport = async (format: "pdf" | "csv" | "json") => {
    if (!analysisResult?.id) return;

    setIsExporting(true);
    try {
      const blob = await analysisService.exportAnalysisResults(
        [analysisResult.id],
        format
      );

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analysis-${analysisResult.id}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `Analysis data exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      // Export failed
      toast({
        title: "Export failed",
        description: "Failed to export analysis data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveFeedback = async (
    llm: string,
    _feedback: "positive" | "negative"
  ) => {
    setIsSaving(true);
    try {
      // Simulate saving feedback
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast({
        title: "Feedback saved",
        description: `Your feedback for ${llm} has been recorded.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Text has been copied to your clipboard.",
    });
  };

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case "positive":
        return <ThumbsUp className="h-4 w-4 text-success" />;
      case "negative":
        return <ThumbsDown className="h-4 w-4 text-destructive" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSentimentColor = (sentiment: string | null) => {
    switch (sentiment) {
      case "positive":
        return "text-success";
      case "negative":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  // Helper function to get sentiment string from score
  const getSentimentFromScore = (score: number | null): string => {
    if (score === null) return "neutral";
    if (score > 0.1) return "positive";
    if (score < -0.1) return "negative";
    return "neutral";
  };

  // Helper function to find LLM result with flexible provider matching
  const findLLMResult = (providers: string[]) => {
    return analysisResult.llm_results?.find((r) =>
      providers.some(
        (provider) =>
          r.llm_provider?.toLowerCase().includes(provider.toLowerCase()) ||
          provider.toLowerCase().includes(r.llm_provider?.toLowerCase() || "")
      )
    );
  };

  // Convert modern format to UI format for easier display
  const llmResults = [
    {
      name: "ChatGPT",
      data: (() => {
        // Try multiple possible provider names for ChatGPT
        const chatgptResult = findLLMResult([
          "chatgpt",
          "gpt-4",
          "gpt",
          "openai",
        ]);

        return {
          mentioned: chatgptResult?.is_mentioned || false,
          rank: chatgptResult?.rank_position || null,
          sentiment: getSentimentFromScore(
            chatgptResult?.sentiment_score || null
          ),
          response: chatgptResult?.response_text || null,
        };
      })(),
      color: "bg-green-500",
    },
    {
      name: "Claude",
      data: (() => {
        // Try multiple possible provider names for Claude
        const claudeResult = findLLMResult(["claude", "claude-3", "anthropic"]);

        return {
          mentioned: claudeResult?.is_mentioned || false,
          rank: claudeResult?.rank_position || null,
          sentiment: getSentimentFromScore(
            claudeResult?.sentiment_score || null
          ),
          response: claudeResult?.response_text || null,
        };
      })(),
      color: "bg-orange-500",
    },
    {
      name: "Gemini",
      data: (() => {
        // Try multiple possible provider names for Gemini
        const geminiResult = findLLMResult(["gemini", "google", "bard"]);

        return {
          mentioned: geminiResult?.is_mentioned || false,
          rank: geminiResult?.rank_position || null,
          sentiment: getSentimentFromScore(
            geminiResult?.sentiment_score || null
          ),
          response: geminiResult?.response_text || null,
        };
      })(),
      color: "bg-blue-500",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <BarChart3 className="h-5 w-5" />
              <span>Detailed Analysis Results</span>
            </div>
            {/* <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(analysisResult.prompt)}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button variant="outline" size="sm">
                <Share className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div> */}
          </DialogTitle>
          <DialogDescription className="text-base">
            Analysis for:{" "}
            <span className="font-medium">
              "{analysisResult.prompt || "Unknown Prompt"}"
            </span>
          </DialogDescription>
          <div className="flex items-center space-x-3">
            <Badge variant="outline">
              {analysisResult.topic || "Unknown Topic"}
            </Badge>
            <Badge variant="outline">
              Confidence: {analysisResult.confidence * 100 || 0}%
            </Badge>
            <span className="text-sm text-muted-foreground">
              {analysisResult.created_at
                ? new Date(analysisResult.created_at).toLocaleString()
                : "Date unknown"}
            </span>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="responses">Full Responses</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4">
                {llmResults.map((llm) => (
                  <Card key={llm.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-3 h-3 rounded-full ${llm.color}`}
                          />
                          <CardTitle className="text-lg">{llm.name}</CardTitle>
                        </div>
                        <div className="flex items-center space-x-2">
                          {llm.data.mentioned ? (
                            <>
                              <Badge className="bg-success">Mentioned</Badge>
                              <Badge variant="outline">
                                Rank #{llm.data.rank}
                              </Badge>
                            </>
                          ) : (
                            <Badge variant="outline">Not Mentioned</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {llm.data.mentioned ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium">
                                Sentiment:
                              </span>
                              <div className="flex items-center space-x-1">
                                {getSentimentIcon(llm.data.sentiment)}
                                <span
                                  className={`text-sm capitalize ${getSentimentColor(
                                    llm.data.sentiment
                                  )}`}
                                >
                                  {llm.data.sentiment || "Neutral"}
                                </span>
                              </div>
                            </div>
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleSaveFeedback(llm.name, "positive")
                                }
                                disabled={isSaving}
                              >
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleSaveFeedback(llm.name, "negative")
                                }
                                disabled={isSaving}
                              >
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Position: #{llm.data.rank} in recommendation list
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Your brand was not mentioned in the response to this
                          prompt.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="responses" className="space-y-4">
              {llmResults.map((llm) => (
                <Card key={llm.name}>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${llm.color}`} />
                      <span>{llm.name} Response</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-4 bg-muted/50 rounded-lg">
                        {llm.data.response &&
                        llm.data.response.trim().length > 0 ? (
                          <MarkdownRenderer
                            content={llm.data.response}
                            className="text-sm"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No response available for this analysis.
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          {llm.data.mentioned && (
                            <>
                              <span>
                                Mentioned at position #{llm.data.rank}
                              </span>
                              <span>•</span>
                              <span
                                className={getSentimentColor(
                                  llm.data.sentiment
                                )}
                              >
                                {llm.data.sentiment || "Neutral"} sentiment
                              </span>
                            </>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              llm.data.response ||
                                "No response available for this analysis."
                            )
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="insights" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Lightbulb className="h-5 w-5" />
                    <span>AI-Generated Insights</span>
                  </CardTitle>
                  <CardDescription>{insights.summary}</CardDescription>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Generated on{" "}
                      {new Date(insights.generatedAt).toLocaleString()}
                    </div>
                    <Badge
                      variant={
                        insights.sources.summary === "prompt"
                          ? "default"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {insights.sources.summary === "prompt"
                        ? "Prompt-Based"
                        : "Calculated"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="h-4 w-4 text-success" />
                          <span>Strengths</span>
                        </div>
                        <Badge
                          variant={
                            insights.sources.strengths === "prompt"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {insights.sources.strengths === "prompt"
                            ? "Prompt-Based"
                            : "Calculated"}
                        </Badge>
                      </h4>
                      {insights.strengths.length > 0 ? (
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {insights.strengths.map((strength, index) => (
                            <li key={index}>• {strength}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No specific strengths identified from current
                          analysis.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Target className="h-4 w-4 text-warning" />
                          <span>Opportunities</span>
                        </div>
                        <Badge
                          variant={
                            insights.sources.opportunities === "prompt"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {insights.sources.opportunities === "prompt"
                            ? "Prompt-Based"
                            : "Calculated"}
                        </Badge>
                      </h4>
                      {insights.opportunities.length > 0 ? (
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {insights.opportunities.map((opportunity, index) => (
                            <li key={index}>• {opportunity}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No specific opportunities identified from current
                          analysis.
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <TrendingDown className="h-4 w-4 text-blue-500" />
                        <span>Recommendations</span>
                      </div>
                      <Badge
                        variant={
                          insights.sources.recommendations === "prompt"
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {insights.sources.recommendations === "prompt"
                          ? "Prompt-Based"
                          : "Calculated"}
                      </Badge>
                    </h4>
                    {insights.recommendations.length > 0 ? (
                      <div className="text-sm text-muted-foreground space-y-2">
                        {insights.recommendations.map(
                          (recommendation, index) => (
                            <div
                              key={index}
                              className="flex items-start space-x-2"
                            >
                              <span className="text-blue-500 font-medium">
                                •
                              </span>
                              <MarkdownRenderer
                                content={recommendation}
                                className="text-sm flex-1"
                              />
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Continue monitoring performance and gather more data for
                        specific recommendations.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <LoadingButton
                  variant="outline"
                  size="sm"
                  loading={isExporting}
                  loadingText="Exporting..."
                  icon={<Download className="h-4 w-4" />}
                >
                  Export
                  <ChevronDown className="h-4 w-4 ml-1" />
                </LoadingButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <Table className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  <Code className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                copyToClipboard(analysisResult.prompt || "No prompt available")
              }
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Prompt
            </Button>

            <Button variant="outline" size="sm">
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
