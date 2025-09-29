import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { AppStateProvider } from "@/contexts/AppStateContext";
import { WebsiteStatusProvider } from "@/contexts/WebsiteStatusContext";
import { OptimizedAppProvider, StateManagementDevTools } from "@/contexts/OptimizedAppProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { registerSW } from "./lib/serviceWorker";
import { PageLoading } from "@/components/LoadingStates";
import AppDashboard from "@/components/AppDashboard";
import { RealTimeDebugger } from "@/components/debug/RealTimeDebugger";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initializeGlobalErrorHandler } from "@/utils/errorHandler";

// Lazy load only non-core pages for code splitting
const Auth = lazy(() => import("./pages/Auth"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Core dashboard pages are now directly imported in AppDashboard for instant navigation

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && typeof error === 'object' && 'status' in error) {
          const status = typeof error.status === 'number' ? error.status : 0;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      // Prevent duplicate requests for the same query
      refetchOnMount: (query) => {
        return Date.now() - query.state.dataUpdatedAt > 2 * 60 * 1000; // Only refetch if data is older than 2 minutes
      },
      // Enable background refetching with longer intervals
      refetchInterval: false, // Disable automatic background refetching by default
      // Optimize network usage
      networkMode: 'online',
    },
    mutations: {
      retry: 1,
      // Add better error handling for mutations
      onError: () => {
        // Mutation errors handled silently in production
      },
    },
  },
});

const App = () => {
  useEffect(() => {
    // Initialize global error handler for DOM insertion errors
    initializeGlobalErrorHandler();

    // Initialize service worker
    try {
      registerSW();
    } catch (error) {
      // Service worker registration failed - silently continue
    }

    // Initialize performance monitoring with error handling
    const initPerformanceMonitoring = async () => {
      try {
        const { performanceMonitor } = await import('./lib/performance');
        performanceMonitor.startTiming('app-initialization');
        
        // Return cleanup function
        return () => {
          try {
            performanceMonitor.endTiming('app-initialization');
          } catch (error) {
            // Performance monitoring cleanup failed - continue
          }
        };
      } catch (error) {
        // Main performance monitoring failed, using fallback
        try {
          // Use fallback performance monitor
          const { fallbackPerformanceMonitor } = await import('./lib/performance-fallback');
          fallbackPerformanceMonitor.startTiming('app-initialization');
          
          return () => {
            try {
              fallbackPerformanceMonitor.endTiming('app-initialization');
            } catch (fallbackError) {
              // Fallback performance monitoring cleanup failed
            }
          };
        } catch (fallbackError) {
          // Fallback performance monitoring also failed
          return () => {}; // Return empty cleanup function
        }
      }
    };
    
    let cleanup: (() => void) | undefined;
    
    // Initialize performance monitoring
    initPerformanceMonitoring().then(cleanupFn => {
      cleanup = cleanupFn;
    });
    
    // Preload critical resources
    const criticalUrls = [
      '/api/workspaces',
      '/api/websites',
      '/api/dashboard/metrics',
    ];
    
    // Preload URLs after a short delay to not block initial render
    setTimeout(() => {
      criticalUrls.forEach(url => {
        fetch(url, { method: 'GET' }).catch(() => {
          // Ignore errors, this is just preloading
        });
      });
    }, 1000);
    
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <AppStateProvider>
              <WebsiteStatusProvider>
                <WorkspaceProvider>
                  <OptimizedAppProvider>
                  <BrowserRouter>
                  <Suspense fallback={<PageLoading message="Loading application..." />}>
                    <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/auth" element={<Auth />} />
                    
                    {/* Unified route for all dashboard pages - true SPA */}
                    <Route
                      path="/dashboard/*"
                      element={
                        <ProtectedRoute>
                          <AppLayout>
                            <AppDashboard />
                          </AppLayout>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/websites/*"
                      element={
                        <ProtectedRoute>
                          <AppLayout>
                            <AppDashboard />
                          </AppLayout>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/analysis/*"
                      element={
                        <ProtectedRoute>
                          <AppLayout>
                            <AppDashboard />
                          </AppLayout>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/competitors/*"
                      element={
                        <ProtectedRoute>
                          <AppLayout>
                            <AppDashboard />
                          </AppLayout>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/settings/*"
                      element={
                        <ProtectedRoute>
                          <AppLayout>
                            <AppDashboard />
                          </AppLayout>
                        </ProtectedRoute>
                      }
                    />
                    
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                    <StateManagementDevTools />
                    <RealTimeDebugger />
                  </BrowserRouter>
                  </OptimizedAppProvider>
                </WorkspaceProvider>
              </WebsiteStatusProvider>
            </AppStateProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
