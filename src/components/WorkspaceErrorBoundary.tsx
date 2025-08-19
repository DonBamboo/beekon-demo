import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { debugError } from '@/lib/debug-utils';

interface WorkspaceErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface WorkspaceErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class WorkspaceErrorBoundary extends React.Component<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  constructor(props: WorkspaceErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("WorkspaceErrorBoundary caught an error:", error, errorInfo);
    
    // Log to debug monitor
    debugError(
      `Workspace Component Error: ${error.message}`,
      'WorkspaceErrorBoundary',
      {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        workspaceContext: {
          pathname: window.location.pathname,
          search: window.location.search,
        },
      },
      error,
      'component'
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <CardTitle>Workspace Error</CardTitle>
              <CardDescription>
                There was an error loading your workspace. This might be due to a
                connectivity issue or a temporary problem.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium">Error details:</p>
                <code className="block mt-2 p-2 bg-muted rounded text-xs">
                  {this.state.error?.message || "Unknown error"}
                </code>
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={this.handleRetry} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="w-full"
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary for functional components
export function useWorkspaceErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = () => setError(null);

  const handleError = (error: Error) => {
    console.error("Workspace error:", error);
    setError(error);
    
    // Log to debug monitor
    debugError(
      `Workspace Hook Error: ${error.message}`,
      'useWorkspaceErrorHandler',
      {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      },
      error,
      'component'
    );
  };

  return { error, resetError, handleError };
}