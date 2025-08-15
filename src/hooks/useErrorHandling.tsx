import React from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";

interface ErrorFallbackProps {
  error: Error;
  errorInfo: React.ErrorInfo;
  resetError: () => void;
  errorId: string;
}

// HOC for wrapping components with error boundary
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorBoundary<T extends React.ComponentType<any>>(
  Component: T,
  errorFallback?: React.ComponentType<ErrorFallbackProps>
) {
  const WrappedComponent = React.forwardRef<
    React.ElementRef<T>,
    React.ComponentProps<T>
  >((props, ref) => (
    <ErrorBoundary fallback={errorFallback}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Component {...(props as any)} ref={ref} />
    </ErrorBoundary>
  ));

  WrappedComponent.displayName = `withErrorBoundary(${
    Component.displayName || Component.name
  })`;

  return WrappedComponent;
}

// Hook for handling errors in functional components
export function useErrorHandler(): {
  handleError: (error: Error | string) => void;
  resetError: () => void;
} {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error | string) => {
    const errorObj = typeof error === "string" ? new Error(error) : error;
    setError(errorObj);
  }, []);

  // Throw error to be caught by error boundary
  if (error) {
    throw error;
  }

  return { handleError, resetError };
}

// Async error boundary for handling async operations
export function useAsyncError(): (error: Error) => void {
  const [, setError] = React.useState();

  return React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}
