import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface CompetitorsErrorStateProps {
  error: { message: string };
  isRefreshing: boolean;
  refreshData: () => void;
  clearError: () => void;
}

export default function CompetitorsErrorState({
  error,
  isRefreshing,
  refreshData,
  clearError,
}: CompetitorsErrorStateProps) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="flex items-center justify-between">
          <span>{error.message}</span>
          <div className="flex gap-2">
            <Button
              onClick={refreshData}
              variant="outline"
              size="sm"
              disabled={isRefreshing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
            <Button onClick={clearError} variant="outline" size="sm">
              Dismiss
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
