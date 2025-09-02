import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { Website } from "@/types/database";
import {
  websiteStatusService,
  WebsiteStatusUpdate,
  WebsiteStatus,
} from "@/services/websiteStatusService";
import { useAppState } from "@/hooks/appStateHooks";
import { debugError, debugInfo, addDebugEvent } from "@/lib/debug-utils";
import {
  EVENT_DISPATCH_DEBOUNCE,
} from "@/lib/website-status-utils";

interface WebsiteStatusContextType {
  // Real-time status for specific website
  getWebsiteStatus: (websiteId: string) => WebsiteStatus | null;

  // All websites with real-time status updates
  websites: Website[];

  // Subscription management
  subscribeToWorkspace: (
    workspaceId: string,
    websiteIds: string[]
  ) => Promise<void>;
  unsubscribeFromWorkspace: (workspaceId: string) => Promise<void>;

  // NEW: Refresh-aware monitoring restoration
  restoreMonitoringAfterRefresh: (
    workspaceId: string,
    websiteIds: string[]
  ) => Promise<void>;

  // Connection status
  isConnected: boolean;
  connectionStatus: Record<string, boolean>; // workspaceId -> connected
}

const WebsiteStatusContext = createContext<
  WebsiteStatusContextType | undefined
>(undefined);

interface WebsiteStatusProviderProps {
  children: React.ReactNode;
}

export function WebsiteStatusProvider({
  children,
}: WebsiteStatusProviderProps) {
  const { state: appState, updateWebsiteStatus } = useAppState();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    Record<string, boolean>
  >({});
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());

  // FIXED: Add debouncing for custom events to prevent cascading re-renders
  const eventDispatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // SIMPLIFIED: Remove complex reconciliation refs - service handles this internally
  const dispatchStatusEventRef =
    useRef<(websiteId: string, status: string, source: string) => void>();

  // Debounced custom event dispatch to prevent rapid-fire updates
  const dispatchStatusEvent = useCallback(
    (websiteId: string, status: string, source: string) => {
      // Clear any pending dispatch
      if (eventDispatchTimeoutRef.current) {
        clearTimeout(eventDispatchTimeoutRef.current);
      }

      // Debounce event dispatch to batch rapid updates
      eventDispatchTimeoutRef.current = setTimeout(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("websiteStatusUpdate", {
              detail: {
                websiteId,
                status,
                source,
                timestamp: Date.now(),
              },
            })
          );
        }
      }, EVENT_DISPATCH_DEBOUNCE);
    },
    []
  );

  // Update the ref when the function changes
  useEffect(() => {
    dispatchStatusEventRef.current = dispatchStatusEvent;
  }, [dispatchStatusEvent]);

  // Handle real-time status updates - SINGLE SOURCE OF TRUTH
  const handleStatusUpdate = useCallback(
    (update: WebsiteStatusUpdate) => {
      try {
        // Log real-time update to debug monitor
        addDebugEvent({
          type: "real-time",
          category: "real-time",
          source: "WebsiteStatusContext",
          message: `Status update received`,
          details: {
            websiteId: update.websiteId,
            status: update.status,
            lastCrawledAt: update.lastCrawledAt,
            updatedAt: update.updatedAt,
          },
          websiteId: update.websiteId,
          severity: "low",
        });

        // CRITICAL: Update AppStateContext immediately - this is our single source of truth
        updateWebsiteStatus(
          update.websiteId,
          update.status,
          update.lastCrawledAt,
          update.updatedAt
        );

        // Enhanced event dispatch for completion transitions
        if (update.status === 'completed') {
          console.log(`[WEBSITE-STATUS-CONTEXT] Website completed: ${update.websiteId}`);
          
          // Dispatch completion-specific event
          dispatchStatusEvent(
            update.websiteId,
            update.status,
            "website-status-context-completion"
          );
        } else {
          // Regular status update event
          dispatchStatusEvent(
            update.websiteId,
            update.status,
            "website-status-context"
          );
        }
      } catch (error) {
        console.error(
          "[WebsiteStatusContext] Error handling status update:",
          error
        );
        debugError(
          `Failed to handle status update: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "WebsiteStatusContext",
          {
            websiteId: update.websiteId,
            status: update.status,
            error: error instanceof Error ? error.stack : String(error),
          },
          error instanceof Error ? error : undefined,
          "real-time"
        );
      }
    },
    [updateWebsiteStatus, dispatchStatusEvent]
  );

  // Subscribe to workspace real-time updates (SIMPLIFIED - uses monitorCrawlingWebsites)
  const subscribeToWorkspace = useCallback(
    async (workspaceId: string, websiteIds: string[]) => {
      if (activeSubscriptionsRef.current.has(workspaceId)) {
        debugInfo(
          `Subscription already exists for workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          { workspaceId, websiteIds },
          "real-time"
        );
        return;
      }

      try {
        debugInfo(
          `Starting simplified monitoring for workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          { workspaceId, websiteIds, websiteCount: websiteIds.length },
          "real-time"
        );

        // Use simplified per-website monitoring that only monitors "crawling" websites
        await websiteStatusService.monitorCrawlingWebsites(
          workspaceId,
          websiteIds,
          handleStatusUpdate
        );

        activeSubscriptionsRef.current.add(workspaceId);
        setConnectionStatus((prev) => ({ ...prev, [workspaceId]: true }));
        setIsConnected(true);

        // Log monitoring status
        const monitoringStatus = websiteStatusService.getMonitoringStatus();
        debugInfo(
          `Successfully started simplified monitoring for workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          {
            workspaceId,
            websitesCurrentlyMonitored: monitoringStatus.totalWebsitesMonitored,
          },
          "real-time"
        );
      } catch (error) {
        setConnectionStatus((prev) => ({ ...prev, [workspaceId]: false }));
        debugError(
          `Failed to subscribe to workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          {
            workspaceId,
            websiteIds,
            error: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error : undefined,
          "real-time"
        );
      }
    },
    [handleStatusUpdate]
  );

  // Unsubscribe from workspace (SIMPLIFIED - uses service's unsubscribeFromWorkspace)
  const unsubscribeFromWorkspace = useCallback(async (workspaceId: string) => {
    if (!activeSubscriptionsRef.current.has(workspaceId)) {
      debugInfo(
        `No subscription exists for workspace: ${workspaceId}`,
        "WebsiteStatusContext",
        { workspaceId },
        "real-time"
      );
      return;
    }

    try {
      debugInfo(
        `Stopping simplified monitoring for workspace: ${workspaceId}`,
        "WebsiteStatusContext",
        { workspaceId },
        "real-time"
      );

      // Use simplified service method that stops all websites in workspace
      await websiteStatusService.unsubscribeFromWorkspace(workspaceId);

      activeSubscriptionsRef.current.delete(workspaceId);
      setConnectionStatus((prev) => {
        const updated = { ...prev };
        delete updated[workspaceId];
        return updated;
      });

      // Update overall connection status
      setIsConnected(activeSubscriptionsRef.current.size > 0);

      debugInfo(
        `Successfully unsubscribed from workspace: ${workspaceId}`,
        "WebsiteStatusContext",
        {
          workspaceId,
          activeSubscriptions: activeSubscriptionsRef.current.size,
        },
        "real-time"
      );
    } catch (error) {
      debugError(
        `Failed to unsubscribe from workspace: ${workspaceId}`,
        "WebsiteStatusContext",
        {
          workspaceId,
          error: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
        "real-time"
      );
    }
  }, []);

  // Restore monitoring after page refresh (SIMPLIFIED - same as subscribeToWorkspace)
  const restoreMonitoringAfterRefresh = useCallback(
    async (workspaceId: string, websiteIds: string[]) => {
      try {
        debugInfo(
          `Restoring simplified monitoring after page refresh for workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          { workspaceId, websiteIds, websiteCount: websiteIds.length },
          "real-time"
        );

        // Use simplified per-website monitoring that only monitors "crawling" websites
        await websiteStatusService.monitorCrawlingWebsites(
          workspaceId,
          websiteIds,
          handleStatusUpdate
        );

        // Mark workspace as having active subscription
        activeSubscriptionsRef.current.add(workspaceId);
        setConnectionStatus((prev) => ({ ...prev, [workspaceId]: true }));
        setIsConnected(true);

        // Log monitoring status
        const monitoringStatus = websiteStatusService.getMonitoringStatus();
        debugInfo(
          `Successfully restored simplified monitoring for workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          {
            workspaceId,
            totalWebsitesInWorkspace: websiteIds.length,
            websitesCurrentlyMonitored: monitoringStatus.totalWebsitesMonitored,
          },
          "real-time"
        );

      } catch (error) {
        setConnectionStatus((prev) => ({ ...prev, [workspaceId]: false }));
        debugError(
          `Failed to restore monitoring for workspace: ${workspaceId}`,
          "WebsiteStatusContext",
          {
            workspaceId,
            websiteIds,
            error: error instanceof Error ? error.message : String(error),
          },
          error instanceof Error ? error : undefined,
          "real-time"
        );
      }
    },
    [handleStatusUpdate]
  );

  // Get real-time status for specific website
  const getWebsiteStatus = useCallback(
    (websiteId: string): WebsiteStatus | null => {
      const website = appState.workspace.websites.find(
        (w: { id: string }) => w.id === websiteId
      );
      return (website?.crawl_status as WebsiteStatus) || null;
    },
    [appState.workspace.websites]
  );

  // SIMPLIFIED: No complex reconciliation - the service handles periodic checks internally

  // Cleanup on unmount (SIMPLIFIED)
  useEffect(() => {
    return () => {
      // Cleanup all subscriptions
      const workspaceIds = Array.from(activeSubscriptionsRef.current);
      workspaceIds.forEach((workspaceId) => {
        websiteStatusService
          .unsubscribeFromWorkspace(workspaceId)
          .catch(console.error);
      });

      // Cleanup debounce timeout
      if (eventDispatchTimeoutRef.current) {
        clearTimeout(eventDispatchTimeoutRef.current);
      }
    };
  }, []);

  const contextValue: WebsiteStatusContextType = {
    getWebsiteStatus,
    websites: appState.workspace.websites, // SINGLE SOURCE OF TRUTH
    subscribeToWorkspace,
    unsubscribeFromWorkspace,
    restoreMonitoringAfterRefresh,
    isConnected,
    connectionStatus,
  };

  return (
    <WebsiteStatusContext.Provider value={contextValue}>
      {children}
    </WebsiteStatusContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWebsiteStatusContext(): WebsiteStatusContextType {
  const context = useContext(WebsiteStatusContext);
  if (context === undefined) {
    throw new Error(
      "useWebsiteStatusContext must be used within a WebsiteStatusProvider"
    );
  }
  return context;
}

// Convenience hook for getting specific website status
// eslint-disable-next-line react-refresh/only-export-components
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
