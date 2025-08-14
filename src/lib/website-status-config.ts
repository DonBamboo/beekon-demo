// Website status indicator configurations

import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/LoadingStates";

export const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
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
    color: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
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
} as const;

export const sizeConfig = {
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
    gap: "gap-3",
  },
} as const;

export type WebsiteStatus = keyof typeof statusConfig;
export type StatusSize = keyof typeof sizeConfig;