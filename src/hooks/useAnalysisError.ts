import { useCallback, useState } from "react";

export function useAnalysisErrorHandler(): {
  error: Error | null;
  isRetrying: boolean;
  handleError: (error: Error | string | unknown) => void;
  retryOperation: (operation: () => Promise<void>) => Promise<void>;
  clearError: () => void;
} {
  const [error, setError] = useState<Error | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleError = useCallback((error: Error | string | unknown) => {
    const errorObj = error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
    setError(errorObj);
  }, []);

  const retryOperation = useCallback(async (operation: () => Promise<void>) => {
    setIsRetrying(true);
    try {
      await operation();
      setError(null);
    } catch (err) {
      handleError(err);
    } finally {
      setIsRetrying(false);
    }
  }, [handleError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    isRetrying,
    handleError,
    retryOperation,
    clearError,
  };
}