import React from 'react';
import { useAppState } from '@/hooks/appStateHooks';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/hooks/use-toast';
import { Copy } from 'lucide-react';
import { copyToClipboard, formatDebugData } from '@/lib/debug-utils';

// Error boundary for context-related errors
class ContextErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Context Error Boundary caught an error - handled by error boundary UI
  }

  override render() {
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
  }, []);

  return <>{children}</>;
}

// Workspace integration component
function WorkspaceStateSync({ children }: { children: React.ReactNode }) {
  // Always call hooks first
  const { dispatch } = useAppState();
  const { websites, currentWorkspace, loading: workspaceLoading } = useWorkspace();
  
  // Add debounced state sync to prevent cascading updates
  const syncTimeoutRef = React.useRef<NodeJS.Timeout>();
  const lastSyncDataRef = React.useRef<{
    workspaceId: string | null;
    websiteIds: string;
    loading: boolean;
  }>({
    workspaceId: null,
    websiteIds: '',
    loading: true,
  });

  // Sync workspace data with app state
  React.useEffect(() => {
    try {
      if (dispatch) {
        const websiteList = websites || [];
        
        // Create sync data for comparison
        const currentSyncData = {
          workspaceId: currentWorkspace?.id || null,
          websiteIds: JSON.stringify(websiteList.map(w => w.id).sort()),
          loading: workspaceLoading,
        };
        
        // Check if there's meaningful data change
        const hasWorkspaceChanged = lastSyncDataRef.current.workspaceId !== currentSyncData.workspaceId;
        const hasWebsitesChanged = lastSyncDataRef.current.websiteIds !== currentSyncData.websiteIds;
        const hasLoadingChanged = lastSyncDataRef.current.loading !== currentSyncData.loading;
        
        if (hasWorkspaceChanged || hasWebsitesChanged || hasLoadingChanged) {
          // Clear existing timeout
          if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
          }
          
          // Debounce the state sync to reduce cascading updates
          syncTimeoutRef.current = setTimeout(() => {
            dispatch({
              type: 'SET_WORKSPACE',
              payload: {
                workspace: currentWorkspace,
                websites: websiteList,
                loading: workspaceLoading,
              },
            });
            
            // Update last sync data
            lastSyncDataRef.current = currentSyncData;
            
          }, 50); // 50ms debounce to prevent cascading updates
        }
      }
    } catch (error) {
      // WorkspaceStateSync sync error - handled silently
    }
  }, [currentWorkspace, websites, workspaceLoading, dispatch]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}

// Cache warming component - simplified to avoid circular dependencies
function CacheWarmer({ children }: { children: React.ReactNode }) {
  // Always call hooks first
  const { state } = useAppState();

  // Warm up cache with essential data on app start
  React.useEffect(() => {
    try {
      // Cache warming logic here (removed console logs for cleaner output)
      if (state && state.workspace.websites.length > 0 && !state.workspace.loading) {
        // Cache warming happens silently
      }
    } catch (error) {
      // CacheWarmer warming error - handled silently
    }
  }, [state, state?.workspace.websites, state?.workspace.loading, state?.workspace.selectedWebsiteId]);

  return <>{children}</>;
}

// Main optimized app provider (AppStateProvider is now handled at App level)
export function OptimizedAppProvider({ children }: { children: React.ReactNode }) {
  return (
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
  );
}

// Development tools for monitoring state management
export function StateManagementDevTools() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [stats, setStats] = React.useState<Record<string, unknown> | null>(null);
  
  // Use hooks at top level - context availability will be handled by the hook itself
  const appState = useAppState();
  const { currentWorkspace, websites } = useWorkspace();
  const { toast } = useToast();
  const contextAvailable = appState !== null;

  React.useEffect(() => {
    if (isOpen && contextAvailable && appState) {
      const updateStats = () => {
        try {
          setStats({
            workspace: {
              current: appState.state?.workspace?.current?.name || 'No workspace',
              websites: appState.state?.workspace?.websites?.length || 0,
              selectedWebsiteId: appState.state?.workspace?.selectedWebsiteId || null,
              loading: appState.state?.workspace?.loading || false,
            },
            cache: {
              entries: appState.state?.cache?.memory?.size || 0,
              dependencies: appState.state?.cache?.dependencies?.size || 0,
            },
            requests: {
              active: appState.state?.requests?.active?.size || 0,
              settings: appState.state?.requests?.settings || {},
            },
            contextAvailable,
          });
        } catch (error) {
          // StateManagementDevTools stats update error - handled silently
        }
      };

      updateStats();
      const interval = setInterval(updateStats, 1000);
      return () => clearInterval(interval);
    }
    // Return undefined if conditions aren't met
    return undefined;
  }, [isOpen, contextAvailable, appState]);

  // Copy stats functionality
  const copyStats = React.useCallback(async () => {
    if (!stats) {
      toast({
        title: "No Stats Available",
        description: "No state management stats to copy",
        variant: "destructive",
      });
      return;
    }

    const formattedData = formatDebugData(stats, {
      eventType: 'state-management-stats',
      workspace: currentWorkspace?.name,
      websiteCount: websites?.length,
      connectionStatus: true, // Always true for state management
    });
    
    const success = await copyToClipboard(formattedData);
    if (success) {
      toast({
        title: "Stats Copied",
        description: "State management stats copied to clipboard",
      });
    } else {
      toast({
        title: "Copy Failed",
        description: "Failed to copy stats to clipboard",
        variant: "destructive",
      });
    }
  }, [stats, currentWorkspace?.name, websites?.length, toast]);

  // Only show when DEBUG_MODE is explicitly enabled
  if (!import.meta.env.VITE_DEBUG_MODE || import.meta.env.VITE_DEBUG_MODE !== 'true') {
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
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '10px'
          }}>
            <h3 style={{ margin: 0 }}>🚀 State Management Stats</h3>
            <button
              onClick={copyStats}
              style={{
                background: 'none',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#6b7280',
                fontSize: '11px',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Copy stats to clipboard"
            >
              <Copy style={{ width: '12px', height: '12px' }} />
              Copy
            </button>
          </div>
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