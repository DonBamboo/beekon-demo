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

  console.log('[WEBSITE-STATUS-PROVIDER] 🚀 Provider initialized');

  // Handle real-time status updates - SINGLE SOURCE OF TRUTH
  const handleStatusUpdate = useCallback((update: WebsiteStatusUpdate) => {
    try {
      console.log('[WEBSITE-STATUS-PROVIDER] 📨 Real-time status update received:', {
        websiteId: update.websiteId,
        status: update.status,
        timestamp: update.updatedAt
      });

      // CRITICAL: Update AppStateContext immediately - this is our single source of truth
      updateWebsiteStatus(
        update.websiteId,
        update.status,
        update.lastCrawledAt,
        update.updatedAt
      );

      console.log('[WEBSITE-STATUS-PROVIDER] ✅ AppStateContext updated - UI should reflect changes immediately');

    } catch (error) {
      console.error('[WEBSITE-STATUS-PROVIDER] ❌ Error handling status update:', error);
    }
  }, [updateWebsiteStatus]);

  // Subscribe to workspace real-time updates
  const subscribeToWorkspace = useCallback(async (workspaceId: string, websiteIds: string[]) => {
    if (activeSubscriptionsRef.current.has(workspaceId)) {
      console.log(`[WEBSITE-STATUS-PROVIDER] ⏸️ Already subscribed to workspace ${workspaceId}`);
      return;
    }

    try {
      console.log(`[WEBSITE-STATUS-PROVIDER] 📡 Subscribing to workspace ${workspaceId} with ${websiteIds.length} websites`);
      
      await websiteStatusService.subscribeToWorkspace(
        workspaceId,
        websiteIds,
        handleStatusUpdate
      );

      activeSubscriptionsRef.current.add(workspaceId);
      setConnectionStatus(prev => ({ ...prev, [workspaceId]: true }));
      setIsConnected(true);

      console.log(`[WEBSITE-STATUS-PROVIDER] ✅ Successfully subscribed to workspace ${workspaceId}`);
    } catch (error) {
      console.error(`[WEBSITE-STATUS-PROVIDER] ❌ Failed to subscribe to workspace ${workspaceId}:`, error);
      setConnectionStatus(prev => ({ ...prev, [workspaceId]: false }));
    }
  }, [handleStatusUpdate]);

  // Unsubscribe from workspace
  const unsubscribeFromWorkspace = useCallback(async (workspaceId: string) => {
    if (!activeSubscriptionsRef.current.has(workspaceId)) {
      return;
    }

    try {
      console.log(`[WEBSITE-STATUS-PROVIDER] 🔌 Unsubscribing from workspace ${workspaceId}`);
      
      await websiteStatusService.unsubscribeFromWorkspace(workspaceId);
      
      activeSubscriptionsRef.current.delete(workspaceId);
      setConnectionStatus(prev => {
        const updated = { ...prev };
        delete updated[workspaceId];
        return updated;
      });

      // Update overall connection status
      setIsConnected(activeSubscriptionsRef.current.size > 0);

      console.log(`[WEBSITE-STATUS-PROVIDER] ✅ Successfully unsubscribed from workspace ${workspaceId}`);
    } catch (error) {
      console.error(`[WEBSITE-STATUS-PROVIDER] ❌ Failed to unsubscribe from workspace ${workspaceId}:`, error);
    }
  }, []);

  // Get real-time status for specific website
  const getWebsiteStatus = useCallback((websiteId: string): WebsiteStatus | null => {
    const website = appState.workspace.websites.find((w: any) => w.id === websiteId);
    return website?.crawl_status as WebsiteStatus || null;
  }, [appState.workspace.websites]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[WEBSITE-STATUS-PROVIDER] 🧹 Cleaning up all subscriptions');
      const workspaceIds = Array.from(activeSubscriptionsRef.current);
      workspaceIds.forEach(workspaceId => {
        websiteStatusService.unsubscribeFromWorkspace(workspaceId).catch(console.error);
      });
    };
  }, []);

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