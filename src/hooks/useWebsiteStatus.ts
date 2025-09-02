import { useEffect, useCallback, useRef } from "react";
import { useAppState } from "@/hooks/appStateHooks";
import {
  websiteStatusService,
  WebsiteStatusUpdate,
  WebsiteStatus,
} from "@/services/websiteStatusService";
import { useToast } from "@/hooks/use-toast";

interface UseWebsiteStatusOptions {
  showToastNotifications?: boolean;
  enableRealTimeUpdates?: boolean;
}

interface WebsiteStatusHookReturn {
  subscribeToWorkspace: (
    workspaceId: string,
    websiteIds: string[]
  ) => Promise<void>;
  unsubscribeFromWorkspace: (workspaceId: string) => Promise<void>;
  addWebsiteToMonitoring: (
    workspaceId: string,
    websiteId: string
  ) => Promise<void>;
  removeWebsiteFromMonitoring: (workspaceId: string, websiteId: string) => void;
  getSubscriptionStatus: (workspaceId: string) => {
    isActive: boolean;
    hasRealtime: boolean;
    monitoredWebsites: number;
    pollingWebsites: number;
  } | null;
}

/**
 * Hook for managing real-time website status updates
 *
 * Features:
 * - Automatic subscription management for workspace websites
 * - Real-time status updates through WebSocket + polling fallback
 * - Toast notifications for status changes (optional)
 * - Integration with app state management
 * - Intelligent cache invalidation
 *
 * @param options Configuration options for the hook
 */
export function useWebsiteStatus(
  options: UseWebsiteStatusOptions = {}
): WebsiteStatusHookReturn {
  const { showToastNotifications = true, enableRealTimeUpdates = true } =
    options;

  const { updateWebsiteStatus, clearCache, invalidateDependentCaches } =
    useAppState();
  const { toast } = useToast();
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());
  const previousStatusRef = useRef<Map<string, WebsiteStatus>>(new Map());

  /**
   * Show toast notification for status changes (only when status actually changes)
   */
  const showStatusNotification = useCallback(
    (update: WebsiteStatusUpdate) => {
      // Check if status actually changed from previous state
      const previousStatus = previousStatusRef.current.get(update.websiteId);
      const currentStatus = update.status;

      // Only show toast if status changed (not for duplicate status updates)
      if (previousStatus === currentStatus) {
        return; // Skip duplicate status notifications
      }

      // Update previous status tracking
      previousStatusRef.current.set(update.websiteId, currentStatus);

      const statusMessages = {
        pending: {
          title: "Website Added",
          description: "Crawling will begin shortly",
          variant: "default" as const,
        },
        crawling: {
          title: "Crawling Started",
          description: "Analyzing website content...",
          variant: "default" as const,
        },
        completed: {
          title: "Crawling Complete",
          description: "Website analysis is ready for review",
          variant: "default" as const,
        },
        failed: {
          title: "Crawling Failed",
          description: "There was an issue analyzing the website",
          variant: "destructive" as const,
        },
      };

      const message = statusMessages[currentStatus as WebsiteStatus];
      if (message) {
        toast({
          title: message.title,
          description: message.description,
          variant: message.variant,
        });
      }
    },
    [toast]
  );

  /**
   * Handle status updates from the websiteStatusService
   */
  const handleStatusUpdate = useCallback(
    (update: WebsiteStatusUpdate) => {
      try {

        // CRITICAL: Force immediate cache invalidation for real-time updates
        clearCache("workspace_");
        clearCache(`websites_`);
        invalidateDependentCaches(`website_${update.websiteId}`);
        
        // Also invalidate the specific website cache in useWorkspace
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('websiteStatusUpdate', { 
            detail: { websiteId: update.websiteId, status: update.status } 
          }));
        }

        // Update website status in app state
        updateWebsiteStatus(
          update.websiteId,
          update.status,
          update.lastCrawledAt,
          update.updatedAt
        );

        // Show toast notification if enabled
        if (showToastNotifications) {
          showStatusNotification(update);
        }

      } catch (error) {
        // Error handling status update - handled silently
      }
    },
    [
      updateWebsiteStatus,
      showToastNotifications,
      invalidateDependentCaches,
      clearCache,
      showStatusNotification,
    ]
  );

  /**
   * Subscribe to website status updates for a workspace
   */
  const subscribeToWorkspace = useCallback(
    async (workspaceId: string, websiteIds: string[]) => {
      if (!enableRealTimeUpdates) return;

      try {
        await websiteStatusService.subscribeToWorkspace(
          workspaceId,
          websiteIds,
          handleStatusUpdate
        );

        activeSubscriptionsRef.current.add(workspaceId);

        // Subscribed to website status updates
      } catch (error) {
        // Failed to subscribe to workspace - handled silently
      }
    },
    [handleStatusUpdate, enableRealTimeUpdates]
  );

  /**
   * Unsubscribe from workspace status updates
   */
  const unsubscribeFromWorkspace = useCallback(async (workspaceId: string) => {
    try {
      await websiteStatusService.unsubscribeFromWorkspace(workspaceId);
      activeSubscriptionsRef.current.delete(workspaceId);

      // Clear previous status tracking for this workspace's websites
      // (Note: We don't have direct workspace-to-website mapping here, 
      // but the map will be naturally cleaned up over time)

      // Unsubscribed from website status updates
    } catch (error) {
      // Failed to unsubscribe from workspace - handled silently
    }
  }, []);

  /**
   * Add a website to monitoring (e.g., when a new website is added)
   */
  const addWebsiteToMonitoring = useCallback(
    async (workspaceId: string, websiteId: string) => {
      if (!enableRealTimeUpdates) return;

      try {
        await websiteStatusService.addWebsiteToMonitoring(
          workspaceId,
          websiteId
        );

        // Added website to monitoring
      } catch (error) {
        // Failed to add website to monitoring - handled silently
      }
    },
    [enableRealTimeUpdates]
  );

  /**
   * Remove a website from monitoring (e.g., when a website is deleted)
   */
  const removeWebsiteFromMonitoring = useCallback(
    (_workspaceId: string, websiteId: string) => {
      try {
        websiteStatusService.stopMonitoringWebsite(websiteId);

        // Clean up previous status tracking for this website
        previousStatusRef.current.delete(websiteId);

        // Removed website from monitoring
      } catch (error) {
        // Failed to remove website from monitoring - handled silently
      }
    },
    []
  );

  /**
   * Get current subscription status for debugging
   */
  const getSubscriptionStatus = useCallback((workspaceId: string) => {
    return websiteStatusService.getSubscriptionStatus(workspaceId);
  }, []);

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    const activeSubscriptions = activeSubscriptionsRef.current;
    const previousStatusMap = previousStatusRef.current;
    
    return () => {
      const activeWorkspaces = Array.from(activeSubscriptions);
      activeWorkspaces.forEach((workspaceId) => {
        websiteStatusService
          .unsubscribeFromWorkspace(workspaceId)
          .catch(() => {
            // Failed to cleanup subscription - handled silently
          });
      });
      activeSubscriptions.clear();
      
      // Clean up all previous status tracking
      previousStatusMap.clear();
    };
  }, []); // Empty dependency array is correct for cleanup

  return {
    subscribeToWorkspace,
    unsubscribeFromWorkspace,
    addWebsiteToMonitoring,
    removeWebsiteFromMonitoring,
    getSubscriptionStatus,
  };
}

/**
 * Specialized hook for workspace-aware website status monitoring
 * Automatically manages subscriptions based on current workspace
 */
export function useWorkspaceWebsiteStatus(
  currentWorkspaceId: string | null,
  websiteIds: string[],
  options: UseWebsiteStatusOptions = {}
) {
  const websiteStatus = useWebsiteStatus(options);
  const previousWorkspaceIdRef = useRef<string | null>(null);
  const previousWebsiteIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    const previousWebsiteIds = previousWebsiteIdsRef.current;

    // Unsubscribe from previous workspace if it changed
    if (previousWorkspaceId && previousWorkspaceId !== currentWorkspaceId) {
      websiteStatus.unsubscribeFromWorkspace(previousWorkspaceId);
    }

    // Subscribe to new workspace if we have one
    // Remove websiteIds.length > 0 requirement to allow immediate subscription
    if (currentWorkspaceId) {
      const websiteIdsChanged =
        JSON.stringify(previousWebsiteIds.sort()) !==
        JSON.stringify([...websiteIds].sort());

      // Subscribe if workspace changed or website list changed
      if (previousWorkspaceId !== currentWorkspaceId || websiteIdsChanged) {
        websiteStatus.subscribeToWorkspace(currentWorkspaceId, websiteIds);
      }
    }

    // Update refs
    previousWorkspaceIdRef.current = currentWorkspaceId;
    previousWebsiteIdsRef.current = [...websiteIds];
  }, [currentWorkspaceId, websiteIds, websiteStatus]);

  return websiteStatus;
}
