import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/loading-button";
import { Search, Plus, Filter, X } from "lucide-react";

interface ContextualEmptyStateProps {
  hasData: boolean;
  hasFilters: boolean;
  activeFilters: {
    topic?: string;
    llm?: string;
    search?: string;
  };
  onClearFilters: () => void;
  onCreateAnalysis: () => void;
  isCreatingAnalysis?: boolean;
}

export function ContextualEmptyState({
  hasData,
  hasFilters,
  activeFilters,
  onClearFilters,
  onCreateAnalysis,
  isCreatingAnalysis = false,
}: ContextualEmptyStateProps) {
  const getEmptyStateContent = () => {
    if (!hasData) {
      return {
        icon: <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />,
        title: "No analysis results found",
        description: "Get started by running your first analysis to see how your brand is mentioned across AI platforms.",
        primaryAction: (
          <LoadingButton
            onClick={onCreateAnalysis}
            loading={isCreatingAnalysis}
            icon={<Plus className="h-4 w-4" />}
            size="lg"
          >
            Run Your First Analysis
          </LoadingButton>
        ),
        secondaryAction: null,
      };
    }

    if (hasFilters) {
      const filterDescriptions = [];
      
      if (activeFilters.topic && activeFilters.topic !== "all") {
        filterDescriptions.push(`topic "${activeFilters.topic}"`);
      }
      if (activeFilters.llm && activeFilters.llm !== "all") {
        filterDescriptions.push(`LLM "${activeFilters.llm}"`);
      }
      if (activeFilters.search) {
        filterDescriptions.push(`search "${activeFilters.search}"`);
      }

      return {
        icon: <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />,
        title: "No results match your filters",
        description: `No analysis results found for ${filterDescriptions.join(", ")}. Try adjusting your filters or clearing them to see more results.`,
        primaryAction: (
          <Button
            onClick={onClearFilters}
            variant="outline"
            size="lg"
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Clear All Filters
          </Button>
        ),
        secondaryAction: (
          <LoadingButton
            onClick={onCreateAnalysis}
            loading={isCreatingAnalysis}
            icon={<Plus className="h-4 w-4" />}
            variant="outline"
            size="lg"
          >
            Run New Analysis
          </LoadingButton>
        ),
      };
    }

    return {
      icon: <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />,
      title: "No analysis results",
      description: "You have data but no results are currently displayed. This might be due to a technical issue.",
      primaryAction: (
        <LoadingButton
          onClick={onCreateAnalysis}
          loading={isCreatingAnalysis}
          icon={<Plus className="h-4 w-4" />}
          size="lg"
        >
          Run New Analysis
        </LoadingButton>
      ),
      secondaryAction: null,
    };
  };

  const content = getEmptyStateContent();

  return (
    <Card className="text-center py-12">
      <CardContent>
        {content.icon}
        <CardTitle className="mb-2">{content.title}</CardTitle>
        <CardDescription className="mb-6 max-w-md mx-auto">
          {content.description}
        </CardDescription>
        
        {hasFilters && (
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {activeFilters.topic && activeFilters.topic !== "all" && (
              <Badge variant="outline">
                Topic: {activeFilters.topic}
              </Badge>
            )}
            {activeFilters.llm && activeFilters.llm !== "all" && (
              <Badge variant="outline">
                LLM: {activeFilters.llm}
              </Badge>
            )}
            {activeFilters.search && (
              <Badge variant="outline">
                Search: {activeFilters.search}
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          {content.primaryAction}
          {content.secondaryAction}
        </div>
      </CardContent>
    </Card>
  );
}