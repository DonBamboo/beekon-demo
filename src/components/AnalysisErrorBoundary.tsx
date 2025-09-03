import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { debugError } from '@/lib/debug-utils';

interface AnalysisErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface AnalysisErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{
    error: Error;
    resetError: () => void;
  }>;
}

export class AnalysisErrorBoundary extends React.Component<
  AnalysisErrorBoundaryProps,
  AnalysisErrorBoundaryState
> {
  constructor(props: AnalysisErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AnalysisErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });
    
    // Log error to monitoring service - console removed for security
    
    // Log to debug monitor
    debugError(
      `Analysis Component Error: ${error.message}`,
      'AnalysisErrorBoundary',
      {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        analysisContext: {
          pathname: window.location.pathname,
          search: window.location.search,
        },
      },
      error,
      'component'
    );
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error!}
            resetError={this.resetError}
          />
        );
      }

      return (
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Analysis Error</span>
            </CardTitle>
            <CardDescription>
              Something went wrong while processing your analysis. Please try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium">Error details:</p>
              <p className="mt-1 p-2 bg-muted rounded text-xs font-mono">
                {this.state.error?.message || "Unknown error occurred"}
              </p>
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={this.resetError}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Try Again</span>
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}


// Error fallback component for analysis-specific errors
export function AnalysisErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-lg font-semibold">Analysis Failed</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        We encountered an error while processing your analysis. This could be due to a temporary
        issue with our AI analysis service.
      </p>
      {process.env.NODE_ENV === 'development' && (
        <p className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">
          {error.message}
        </p>
      )}
      
      <div className="flex space-x-2">
        <Button onClick={resetError} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
        <Button
          onClick={() => window.location.href = "/support"}
          variant="outline"
        >
          Contact Support
        </Button>
      </div>
    </div>
  );
}