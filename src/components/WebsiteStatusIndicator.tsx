import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/LoadingStates";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type WebsiteStatusType = "pending" | "crawling" | "completed" | "failed";

interface WebsiteStatusIndicatorProps {
  status: WebsiteStatusType;
  lastCrawledAt?: string | null;
  className?: string;
  showLabel?: boolean;
  showTimestamp?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "badge" | "inline" | "card";
}

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    description: "Waiting to start crawling",
    badgeVariant: "secondary" as const,
  },
  crawling: {
    label: "Crawling",
    icon: Spinner,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
    iconColor: "text-blue-600 dark:text-blue-400",
    description: "Currently analyzing content",
    badgeVariant: "secondary" as const,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
    iconColor: "text-green-600 dark:text-green-400",
    description: "Analysis complete",
    badgeVariant: "secondary" as const,
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
    iconColor: "text-red-600 dark:text-red-400",
    description: "Analysis failed",
    badgeVariant: "destructive" as const,
  },
};

const sizeConfig = {
  sm: {
    iconSize: "h-3 w-3",
    textSize: "text-xs",
    padding: "px-2 py-1",
    gap: "gap-1",
  },
  md: {
    iconSize: "h-4 w-4",
    textSize: "text-sm",
    padding: "px-3 py-1",
    gap: "gap-2",
  },
  lg: {
    iconSize: "h-5 w-5",
    textSize: "text-base",
    padding: "px-4 py-2",
    gap: "gap-2",
  },
};

function formatLastCrawled(lastCrawledAt: string | null): string {
  if (!lastCrawledAt) return "";

  const date = new Date(lastCrawledAt);
  const now = new Date();
  const diffInHours = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60)
  );

  if (diffInHours < 1) {
    const diffInMinutes = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60)
    );
    return diffInMinutes < 1 ? "Just now" : `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else {
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  }
}

/**
 * Website Status Indicator Component
 *
 * Displays website crawling status with animations and styling
 * Supports multiple variants and sizes
 */
export function WebsiteStatusIndicator({
  status,
  lastCrawledAt,
  className,
  showLabel = true,
  showTimestamp = false,
  size = "md",
  variant = "badge",
}: WebsiteStatusIndicatorProps) {
  const config = statusConfig[status];
  const sizeStyles = sizeConfig[size];

  if (!config) {
    console.warn(`Unknown website status: ${status}`);
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <AlertCircle className="h-3 w-3" />
        Unknown
      </Badge>
    );
  }

  const Icon = config.icon;
  const isAnimated = status === "crawling";

  // Badge variant
  if (variant === "badge") {
    return (
      <Badge
        variant={status === "failed" ? "destructive" : "secondary"}
        className={cn(
          config.color,
          sizeStyles.gap,
          sizeStyles.padding,
          "transition-all duration-300 ease-in-out",
          className
        )}
      >
        <Icon
          className={cn(
            sizeStyles.iconSize,
            config.iconColor,
            isAnimated && status === "crawling" && "animate-spin"
          )}
        />
        {showLabel && (
          <span className={sizeStyles.textSize}>{config.label}</span>
        )}
        {showTimestamp && lastCrawledAt && (
          <span className={cn(sizeStyles.textSize, "opacity-75 ml-1")}>
            • {formatLastCrawled(lastCrawledAt)}
          </span>
        )}
      </Badge>
    );
  }

  // Inline variant
  if (variant === "inline") {
    return (
      <div className={cn("flex items-center", sizeStyles.gap, className)}>
        <Icon
          className={cn(
            sizeStyles.iconSize,
            config.iconColor,
            isAnimated && status === "crawling" && "animate-spin"
          )}
        />
        {showLabel && (
          <span className={cn(sizeStyles.textSize, "text-muted-foreground")}>
            {config.label}
          </span>
        )}
        {showTimestamp && lastCrawledAt && (
          <span className={cn(sizeStyles.textSize, "opacity-60")}>
            • {formatLastCrawled(lastCrawledAt)}
          </span>
        )}
      </div>
    );
  }

  // Card variant
  if (variant === "card") {
    return (
      <div
        className={cn(
          "flex items-center justify-between p-3 rounded-lg border transition-all duration-300",
          config.color,
          className
        )}
      >
        <div className={cn("flex items-center", sizeStyles.gap)}>
          <Icon
            className={cn(
              sizeStyles.iconSize,
              config.iconColor,
              isAnimated && status === "crawling" && "animate-spin"
            )}
          />
          {showLabel && (
            <div>
              <div className={cn("font-medium", sizeStyles.textSize)}>
                {config.label}
              </div>
              <div className={cn("text-xs opacity-75")}>
                {config.description}
              </div>
            </div>
          )}
        </div>
        {showTimestamp && lastCrawledAt && (
          <div className={cn(sizeStyles.textSize, "opacity-75 text-right")}>
            <div>Last crawled</div>
            <div className="text-xs">{formatLastCrawled(lastCrawledAt)}</div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Animated status transition component
 * Shows a smooth transition between status changes
 */
interface StatusTransitionProps {
  previousStatus?: WebsiteStatusType;
  currentStatus: WebsiteStatusType;
  onTransitionComplete?: () => void;
}

export function StatusTransition({
  previousStatus,
  currentStatus,
  onTransitionComplete,
}: StatusTransitionProps) {
  const showTransition = previousStatus && previousStatus !== currentStatus;

  if (!showTransition) {
    return <WebsiteStatusIndicator status={currentStatus} />;
  }

  return (
    <div className="relative">
      {/* Previous status (fading out) */}
      <div className="absolute inset-0 animate-fade-out opacity-0">
        <WebsiteStatusIndicator status={previousStatus} />
      </div>

      {/* Current status (fading in) */}
      <div className="animate-fade-in" onAnimationEnd={onTransitionComplete}>
        <WebsiteStatusIndicator status={currentStatus} />
      </div>
    </div>
  );
}

/**
 * Status history indicator showing recent status changes
 */
interface StatusHistoryProps {
  statusHistory: Array<{
    status: WebsiteStatusType;
    timestamp: string;
  }>;
  maxItems?: number;
  className?: string;
}

export function StatusHistory({
  statusHistory,
  maxItems = 3,
  className,
}: StatusHistoryProps) {
  const recentHistory = statusHistory.slice(-maxItems).reverse();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {recentHistory.map((entry, index) => (
        <div
          key={`${entry.status}-${entry.timestamp}`}
          className={cn(
            "flex items-center gap-2 text-sm",
            index > 0 && "opacity-60"
          )}
        >
          <WebsiteStatusIndicator
            status={entry.status}
            size="sm"
            showLabel={false}
          />
          <span className="text-muted-foreground">
            {formatLastCrawled(entry.timestamp)}
          </span>
          {index === 0 && (
            <Badge variant="outline" className="text-xs">
              Current
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// Configuration is now available via import from @/lib/website-status-config
