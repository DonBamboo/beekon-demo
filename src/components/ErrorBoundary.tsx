import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { debugError } from '@/lib/debug-utils';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo: React.ErrorInfo;
  resetError: () => void;
  errorId: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      errorInfo,
    });

    // Log error to external service
    this.logErrorToService(error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    if (hasError && resetOnPropsChange) {
      if (resetKeys) {
        const hasResetKeyChanged = resetKeys.some(
          (key, index) => key !== prevProps.resetKeys?.[index]
        );
        if (hasResetKeyChanged) {
          this.resetError();
        }
      }
    }
  }

  private logErrorToService = (error: Error, errorInfo: React.ErrorInfo) => {
    // Skip console logging for security

    // Log to debug monitor
    debugError(
      `Component Error: ${error.message}`,
      'ErrorBoundary',
      {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        props: this.props,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      },
      error,
      'component'
    );

    // In production, you would send this to your error tracking service
    // Example: Sentry, LogRocket, etc.
    try {
      // Send to error tracking service
      // errorTrackingService.captureException(errorData);
    } catch (loggingError) {
      debugError(
        `Failed to log error to external service: ${loggingError}`,
        'ErrorBoundary',
        { originalError: error.message, loggingError: String(loggingError) },
        loggingError instanceof Error ? loggingError : undefined,
        'component'
      );
    }
  };

  private resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  override render() {
    const { hasError, error, errorInfo, errorId } = this.state;
    const { children, fallback: Fallback } = this.props;

    if (hasError && error) {
      if (Fallback) {
        return (
          <Fallback
            error={error}
            errorInfo={errorInfo!}
            resetError={this.resetError}
            errorId={errorId}
          />
        );
      }

      return (
        <DefaultErrorFallback
          error={error}
          errorInfo={errorInfo!}
          resetError={this.resetError}
          errorId={errorId}
        />
      );
    }

    return children;
  }
}

// Default error fallback component
const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  resetError,
  errorId,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <Card className="max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          Something went wrong
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button onClick={resetError} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button
            onClick={() => setShowDetails(!showDetails)}
            variant="ghost"
            size="sm"
          >
            {showDetails ? 'Hide' : 'Show'} details
          </Button>
        </div>

        {showDetails && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="space-y-2">
              <div>
                <strong>Error ID:</strong> {errorId}
              </div>
              <div>
                <strong>Error:</strong> {error.message}
              </div>
              {error.stack && (
                <div>
                  <strong>Stack Trace:</strong>
                  <pre className="text-xs mt-2 overflow-auto max-h-40 bg-background p-2 rounded">
                    {error.stack}
                  </pre>
                </div>
              )}
              {errorInfo.componentStack && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="text-xs mt-2 overflow-auto max-h-40 bg-background p-2 rounded">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Simplified error fallback for smaller components
export const SimpleErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
}) => (
  <div className="flex flex-col items-center justify-center p-4 text-center">
    <AlertCircle className="h-8 w-8 text-destructive mb-2" />
    <p className="text-sm text-muted-foreground mb-4">
      Something went wrong: {error.message}
    </p>
    <Button onClick={resetError} size="sm" variant="outline">
      <RefreshCw className="h-4 w-4 mr-2" />
      Try again
    </Button>
  </div>
);

// Chart-specific error fallback
export const ChartErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
}) => (
  <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
    <p className="text-lg font-medium text-muted-foreground mb-2">
      Failed to load chart
    </p>
    <p className="text-sm text-muted-foreground mb-4">
      {error.message}
    </p>
    <Button onClick={resetError} size="sm" variant="outline">
      <RefreshCw className="h-4 w-4 mr-2" />
      Retry
    </Button>
  </div>
);

