import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// HOC for wrapping components with error boundary
export function withErrorBoundary<T extends React.ComponentType<Record<string, unknown>>>(
  Component: T,
  errorFallback?: React.ComponentType<{ error: Error; resetError?: () => void }>
) {
  const WrappedComponent = React.forwardRef<
    React.ElementRef<T>,
    React.ComponentProps<T>
  >((props, ref) => (
    <ErrorBoundary fallback={errorFallback}>
      <Component {...props} ref={ref} />
    </ErrorBoundary>
  ));

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

// Hook for handling errors in functional components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error | string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    setError(errorObj);
  }, []);

  // Throw error to be caught by error boundary
  if (error) {
    throw error;
  }

  return { handleError, resetError };
}

// Async error boundary for handling async operations
export function useAsyncError() {
  const [, setError] = React.useState();
  
  return React.useCallback(
    (error: Error) => {
      setError(() => {
        throw error;
      });
    },
    []
  );
}