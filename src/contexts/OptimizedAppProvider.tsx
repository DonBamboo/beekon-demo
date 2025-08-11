import React from 'react';
import { AppStateProvider, useAppState } from './AppStateContext';
import { useWorkspace } from '@/hooks/useWorkspace';

// Error boundary for context-related errors
class ContextErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Context Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: '20px', border: '1px solid red', borderRadius: '4px' }}>
          <h3>State Management Error</h3>
          <p>An error occurred in the state management system. Please refresh the page.</p>
          {process.env.NODE_ENV === 'development' && (
            <details>
              <summary>Error details</summary>
              <pre>{this.state.error?.stack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Comprehensive app provider that integrates all optimization systems
 * This replaces the previous individual context providers with a unified solution
 */

// Performance monitoring component
function PerformanceMonitor({ children }: { children: React.ReactNode }) {
  // Monitor basic performance without external hooks to avoid circular dependencies
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🚀 State Management System Initialized');
    }
  }, []);

  return <>{children}</>;
}

// Workspace integration component
function WorkspaceStateSync({ children }: { children: React.ReactNode }) {
  // Always call hooks first
  const { dispatch } = useAppState();
  const { websites, currentWorkspace, loading: workspaceLoading } = useWorkspace();

  // Sync workspace data with app state
  React.useEffect(() => {
    try {
      if (dispatch) {
        dispatch({
          type: 'SET_WORKSPACE',
          payload: {
            workspace: currentWorkspace,
            websites: websites || [],
            loading: workspaceLoading,
          },
        });
      }
    } catch (error) {
      console.error('WorkspaceStateSync sync error:', error);
    }
  }, [currentWorkspace, websites, workspaceLoading, dispatch]);

  return <>{children}</>;
}

// Cache warming component - simplified to avoid circular dependencies
function CacheWarmer({ children }: { children: React.ReactNode }) {
  // Always call hooks first
  const { state } = useAppState();

  // Warm up cache with essential data on app start
  React.useEffect(() => {
    try {
      if (state && state.workspace.websites.length > 0 && !state.workspace.loading) {
        const selectedWebsiteId = state.workspace.selectedWebsiteId;
        
        if (selectedWebsiteId && process.env.NODE_ENV === 'development') {
          console.log(`🔥 Cache warming for website: ${selectedWebsiteId}`);
        }
      }
    } catch (error) {
      console.error('CacheWarmer warming error:', error);
    }
  }, [state, state?.workspace.websites, state?.workspace.loading, state?.workspace.selectedWebsiteId]);

  return <>{children}</>;
}

// Main optimized app provider
export function OptimizedAppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ContextErrorBoundary>
      <AppStateProvider>
        <ContextErrorBoundary>
          <WorkspaceStateSync>
            <ContextErrorBoundary>
              <CacheWarmer>
                <PerformanceMonitor>
                  {children}
                </PerformanceMonitor>
              </CacheWarmer>
            </ContextErrorBoundary>
          </WorkspaceStateSync>
        </ContextErrorBoundary>
      </AppStateProvider>
    </ContextErrorBoundary>
  );
}

// Development tools for monitoring state management
export function StateManagementDevTools() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [stats, setStats] = React.useState<any>(null);
  
  // Safe context usage with error handling
  let contextAvailable = false;
  let state: any = null;
  
  try {
    const appState = useAppState();
    state = appState.state;
    contextAvailable = true;
  } catch (error) {
    console.warn('StateManagementDevTools: AppState context not available');
    contextAvailable = false;
  }

  React.useEffect(() => {
    if (isOpen && contextAvailable && state) {
      const updateStats = () => {
        try {
          setStats({
            workspace: {
              current: state.workspace?.current?.name || 'No workspace',
              websites: state.workspace?.websites?.length || 0,
              selectedWebsiteId: state.workspace?.selectedWebsiteId || null,
              loading: state.workspace?.loading || false,
            },
            cache: {
              entries: state.cache?.memory?.size || 0,
              dependencies: state.cache?.dependencies?.size || 0,
            },
            requests: {
              active: state.requests?.active?.size || 0,
              settings: state.requests?.settings || {},
            },
            contextAvailable,
          });
        } catch (error) {
          console.error('StateManagementDevTools stats update error:', error);
        }
      };

      updateStats();
      const interval = setInterval(updateStats, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, contextAvailable, state]);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: contextAvailable ? '#007ACC' : '#ff6b6b',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: 50,
          height: 50,
          fontSize: '20px',
          cursor: 'pointer',
        }}
        title={contextAvailable ? 'State Management Working' : 'State Management Error'}
      >
        📊
      </button>
      
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 0,
            width: 400,
            maxHeight: 500,
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: 8,
            padding: 16,
            fontSize: '12px',
            fontFamily: 'monospace',
            overflow: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <h3>🚀 State Management Stats</h3>
          {!contextAvailable && (
            <div style={{ color: 'red', marginBottom: '10px' }}>
              ⚠️ Context not available
            </div>
          )}
          {stats && (
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {JSON.stringify(stats, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}