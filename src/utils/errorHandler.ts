/**
 * Global error handler utility for DOM errors and promise rejections
 * Moved from ErrorBoundary.tsx to maintain React Fast Refresh compatibility
 */

// Global error handler for uncaught DOM errors (like bootstrap-autofill-overlay.js)
export const initializeGlobalErrorHandler = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Unhandled promise rejection:', event.reason);
    }

    // Prevent default browser behavior for some errors
    if (
      event.reason &&
      typeof event.reason === 'object' &&
      'message' in event.reason &&
      typeof event.reason.message === 'string'
    ) {
      const message = event.reason.message.toLowerCase();

      // Handle DOM insertion errors (like bootstrap-autofill-overlay.js)
      if (
        message.includes('insertbefore') ||
        message.includes('not a child of this node') ||
        message.includes('bootstrap-autofill') ||
        message.includes('failed to execute \'insertbefore\' on \'node\'')
      ) {
        event.preventDefault(); // Prevent the error from appearing in console

        if (process.env.NODE_ENV !== 'production') {
          console.info('🛡️ Suppressed DOM insertion error (likely from browser extension):', message);
        }
      }
    }
  });

  // Handle uncaught JavaScript errors
  window.addEventListener('error', (event) => {
    // Check if this is a DOM-related error that we want to suppress
    if (event.filename && event.filename.includes('bootstrap-autofill-overlay.js')) {
      event.preventDefault();

      if (process.env.NODE_ENV !== 'production') {
        console.info('🛡️ Suppressed bootstrap-autofill-overlay.js error');
      }
      return;
    }

    // Check error message for DOM insertion issues
    if (event.message && typeof event.message === 'string') {
      const message = event.message.toLowerCase();
      if (
        message.includes('insertbefore') ||
        message.includes('not a child of this node') ||
        message.includes('bootstrap-autofill') ||
        message.includes('failed to execute \'insertbefore\' on \'node\'') ||
        message.includes('the node before which the new node is to be inserted is not a child of this node')
      ) {
        event.preventDefault();

        if (process.env.NODE_ENV !== 'production') {
          console.info('🛡️ Suppressed DOM insertion error:', event.message);
        }
        return;
      }
    }

    // Let other errors through for normal handling
    if (process.env.NODE_ENV !== 'production') {
      console.error('Global error caught:', event.error || event.message);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info('🛡️ Global error handler initialized to suppress DOM insertion errors');
  }
};