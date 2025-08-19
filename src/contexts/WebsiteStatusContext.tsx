import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Website } from '@/types/database';
import { websiteStatusService, WebsiteStatusUpdate, WebsiteStatus } from '@/services/websiteStatusService';
import { useAppState } from '@/hooks/appStateHooks';

interface WebsiteStatusContextType {
  // Real-time status for specific website
  getWebsiteStatus: (websiteId: string) => WebsiteStatus | null;
  
  // All websites with real-time status updates
  websites: Website[];
  
  // Subscription management
  subscribeToWorkspace: (workspaceId: string, websiteIds: string[]) => Promise<void>;
  unsubscribeFromWorkspace: (workspaceId: string) => Promise<void>;
  
  // Connection status
  isConnected: boolean;
  connectionStatus: Record<string, boolean>; // workspaceId -> connected
}

const WebsiteStatusContext = createContext<WebsiteStatusContextType | undefined>(undefined);

interface WebsiteStatusProviderProps {
  children: React.ReactNode;
}

export function WebsiteStatusProvider({ children }: WebsiteStatusProviderProps) {
  const { state: appState, updateWebsiteStatus } = useAppState();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean>>({});
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());
  const reconciliationIntervalRef = useRef<NodeJS.Timeout | null>(null);


  // Handle real-time status updates - SINGLE SOURCE OF TRUTH
  const handleStatusUpdate = useCallback((update: WebsiteStatusUpdate) => {
    try {

      // CRITICAL: Update AppStateContext immediately - this is our single source of truth
      updateWebsiteStatus(
        update.websiteId,
        update.status,
        update.lastCrawledAt,
        update.updatedAt
      );

      // Force immediate UI refresh with custom event
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('websiteStatusUpdate', { 
            detail: { 
              websiteId: update.websiteId, 
              status: update.status,
              source: 'website-status-context',
              timestamp: Date.now()
            } 
          }));
        }
      }, 0);

    } catch (error) {
      console.error('[WebsiteStatusContext] Error handling status update:', error);
    }
  }, [updateWebsiteStatus]);

  // Subscribe to workspace real-time updates
  const subscribeToWorkspace = useCallback(async (workspaceId: string, websiteIds: string[]) => {
    if (activeSubscriptionsRef.current.has(workspaceId)) {
      return;
    }

    try {
      
      await websiteStatusService.subscribeToWorkspace(
        workspaceId,
        websiteIds,
        handleStatusUpdate
      );

      activeSubscriptionsRef.current.add(workspaceId);
      setConnectionStatus(prev => ({ ...prev, [workspaceId]: true }));
      setIsConnected(true);

    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, [workspaceId]: false }));
    }
  }, [handleStatusUpdate]);

  // Unsubscribe from workspace
  const unsubscribeFromWorkspace = useCallback(async (workspaceId: string) => {
    if (!activeSubscriptionsRef.current.has(workspaceId)) {
      return;
    }

    try {
      
      await websiteStatusService.unsubscribeFromWorkspace(workspaceId);
      
      activeSubscriptionsRef.current.delete(workspaceId);
      setConnectionStatus(prev => {
        const updated = { ...prev };
        delete updated[workspaceId];
        return updated;
      });

      // Update overall connection status
      setIsConnected(activeSubscriptionsRef.current.size > 0);

    } catch (error) {
    }
  }, []);

  // Get real-time status for specific website
  const getWebsiteStatus = useCallback((websiteId: string): WebsiteStatus | null => {
    const website = appState.workspace.websites.find((w: { id: string }) => w.id === websiteId);
    return website?.crawl_status as WebsiteStatus || null;
  }, [appState.workspace.websites]);

  // Periodic state reconciliation to ensure UI stays in sync
  const startStateReconciliation = useCallback(() => {
    if (reconciliationIntervalRef.current) {
      clearInterval(reconciliationIntervalRef.current);
    }
    
    reconciliationIntervalRef.current = setInterval(async () => {
      
      try {
        // Force UI refresh for all monitored websites
        const workspaceIds = Array.from(activeSubscriptionsRef.current);
        for (const workspaceId of workspaceIds) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('websiteStatusUpdate', { 
              detail: { 
                workspaceId,
                source: 'periodic-reconciliation',
                timestamp: Date.now()
              } 
            }));
          }
        }
      } catch (error) {
        console.error('[WebsiteStatusContext] Error during state reconciliation:', error);
      }
    }, 30000); // Every 30 seconds
  }, []);

  const stopStateReconciliation = useCallback(() => {
    if (reconciliationIntervalRef.current) {
      clearInterval(reconciliationIntervalRef.current);
      reconciliationIntervalRef.current = null;
    }
  }, []);

  // Start reconciliation when we have active subscriptions
  useEffect(() => {
    if (activeSubscriptionsRef.current.size > 0) {
      startStateReconciliation();
    } else {
      stopStateReconciliation();
    }
  }, [startStateReconciliation, stopStateReconciliation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const workspaceIds = Array.from(activeSubscriptionsRef.current);
      workspaceIds.forEach(workspaceId => {
        websiteStatusService.unsubscribeFromWorkspace(workspaceId).catch(console.error);
      });
      stopStateReconciliation();
    };
  }, [stopStateReconciliation]);

  const contextValue: WebsiteStatusContextType = {
    getWebsiteStatus,
    websites: appState.workspace.websites, // SINGLE SOURCE OF TRUTH
    subscribeToWorkspace,
    unsubscribeFromWorkspace,
    isConnected,
    connectionStatus,
  };

  return (
    <WebsiteStatusContext.Provider value={contextValue}>
      {children}
    </WebsiteStatusContext.Provider>
  );
}

export function useWebsiteStatusContext(): WebsiteStatusContextType {
  const context = useContext(WebsiteStatusContext);
  if (context === undefined) {
    throw new Error('useWebsiteStatusContext must be used within a WebsiteStatusProvider');
  }
  return context;
}

// Convenience hook for getting specific website status
export function useWebsiteStatus(websiteId: string): {
  status: WebsiteStatus | null;
  lastCrawledAt: string | null;
  updatedAt: string | null;
  isConnected: boolean;
} {
  const { getWebsiteStatus, websites, isConnected } = useWebsiteStatusContext();
  
  const website = websites.find((w: Website) => w.id === websiteId);
  
  return {
    status: getWebsiteStatus(websiteId),
    lastCrawledAt: website?.last_crawled_at || null,
    updatedAt: website?.updated_at || null,
    isConnected,
  };
}