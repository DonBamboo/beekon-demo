import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";

interface FilterBreadcrumbsProps {
  filters: {
    topic?: string;
    llm?: string;
    search?: string;
  };
  onRemoveFilter: (filterType: "topic" | "llm" | "search") => void;
  onClearAll: () => void;
  resultCount?: number;
}

export function FilterBreadcrumbs({
  filters,
  onRemoveFilter,
  onClearAll,
  resultCount,
}: FilterBreadcrumbsProps) {
  const hasFilters = Object.values(filters).some(Boolean);

  if (!hasFilters) {
    return null;
  }

  const filterItems = [];

  if (filters.topic) {
    filterItems.push({
      type: "topic" as const,
      label: `Topic: ${filters.topic}`,
      value: filters.topic,
    });
  }

  if (filters.llm) {
    filterItems.push({
      type: "llm" as const,
      label: `LLM: ${filters.llm}`,
      value: filters.llm,
    });
  }

  if (filters.search) {
    // Truncate long search terms for better responsive design
    const truncatedSearch = filters.search.length > 30 
      ? filters.search.substring(0, 30) + '...' 
      : filters.search;
    filterItems.push({
      type: "search" as const,
      label: `Search: "${truncatedSearch}"`,
      value: filters.search,
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center p-3 bg-muted/30 rounded-lg border">
      {/* Header Row */}
      <div className="flex items-center gap-2 shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Active filters:
        </span>
      </div>

      {/* Filter Badges */}
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        {filterItems.map((item) => (
          <Badge
            key={item.type}
            variant="secondary"
            className="flex items-center gap-1 pr-1 shrink-0"
          >
            <span className="text-xs truncate max-w-[200px]" title={item.label}>
              {item.label}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground shrink-0"
              onClick={() => onRemoveFilter(item.type)}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
      </div>

      {/* Results Count and Clear Button */}
      <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto shrink-0">
        {resultCount !== undefined && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            ({resultCount} result{resultCount !== 1 ? "s" : ""})
          </span>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={onClearAll}
          className="text-xs shrink-0"
        >
          Clear all
        </Button>
      </div>
    </div>
  );
}
