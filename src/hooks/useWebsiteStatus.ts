import { useEffect, useCallback, useRef } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { websiteStatusService, WebsiteStatusUpdate, WebsiteStatus } from '@/services/websiteStatusService';
import { useToast } from '@/hooks/use-toast';

interface UseWebsiteStatusOptions {
  showToastNotifications?: boolean;
  enableRealTimeUpdates?: boolean;
}

interface WebsiteStatusHookReturn {
  subscribeToWorkspace: (workspaceId: string, websiteIds: string[]) => Promise<void>;
  unsubscribeFromWorkspace: (workspaceId: string) => Promise<void>;
  addWebsiteToMonitoring: (workspaceId: string, websiteId: string) => Promise<void>;
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
export function useWebsiteStatus(options: UseWebsiteStatusOptions = {}): WebsiteStatusHookReturn {
  const { 
    showToastNotifications = true, 
    enableRealTimeUpdates = true 
  } = options;
  
  const { updateWebsiteStatus, clearCache, invalidateDependentCaches } = useAppState();
  const { toast } = useToast();
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());

  /**
   * Handle status updates from the websiteStatusService
   */
  const handleStatusUpdate = useCallback((update: WebsiteStatusUpdate) => {
    try {
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

      // Invalidate related caches
      invalidateDependentCaches(`website_${update.websiteId}`);
      
      // Clear workspace-related caches to trigger UI refresh
      clearCache('workspace_');
      clearCache(`websites_`);

      console.log('Website status updated:', {
        websiteId: update.websiteId,
        status: update.status,
        timestamp: update.updatedAt,
      });

    } catch (error) {
      console.error('Error handling website status update:', error);
    }
  }, [updateWebsiteStatus, showToastNotifications, invalidateDependentCaches, clearCache, toast]);

  /**
   * Show toast notification for status changes
   */
  const showStatusNotification = useCallback((update: WebsiteStatusUpdate) => {
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

    const message = statusMessages[update.status as WebsiteStatus];
    if (message) {
      toast({
        title: message.title,
        description: message.description,
        variant: message.variant,
      });
    }
  }, [toast]);

  /**
   * Subscribe to website status updates for a workspace
   */
  const subscribeToWorkspace = useCallback(async (workspaceId: string, websiteIds: string[]) => {
    if (!enableRealTimeUpdates) return;
    
    try {
      await websiteStatusService.subscribeToWorkspace(
        workspaceId,
        websiteIds,
        handleStatusUpdate
      );
      
      activeSubscriptionsRef.current.add(workspaceId);
      
      console.log(`Subscribed to website status updates for workspace: ${workspaceId}`, {
        websiteCount: websiteIds.length,
        websiteIds: websiteIds.slice(0, 3), // Log first 3 for debugging
      });
    } catch (error) {
      console.error(`Failed to subscribe to workspace ${workspaceId}:`, error);
    }
  }, [handleStatusUpdate, enableRealTimeUpdates]);

  /**
   * Unsubscribe from workspace status updates
   */
  const unsubscribeFromWorkspace = useCallback(async (workspaceId: string) => {
    try {
      await websiteStatusService.unsubscribeFromWorkspace(workspaceId);
      activeSubscriptionsRef.current.delete(workspaceId);
      
      console.log(`Unsubscribed from website status updates for workspace: ${workspaceId}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from workspace ${workspaceId}:`, error);
    }
  }, []);

  /**
   * Add a website to monitoring (e.g., when a new website is added)
   */
  const addWebsiteToMonitoring = useCallback(async (workspaceId: string, websiteId: string) => {
    if (!enableRealTimeUpdates) return;
    
    try {
      await websiteStatusService.addWebsiteToMonitoring(workspaceId, websiteId);
      
      console.log(`Added website to monitoring: ${websiteId} in workspace: ${workspaceId}`);
    } catch (error) {
      console.error(`Failed to add website ${websiteId} to monitoring:`, error);
    }
  }, [enableRealTimeUpdates]);

  /**
   * Remove a website from monitoring (e.g., when a website is deleted)
   */
  const removeWebsiteFromMonitoring = useCallback((workspaceId: string, websiteId: string) => {
    try {
      websiteStatusService.removeWebsiteFromMonitoring(workspaceId, websiteId);
      
      console.log(`Removed website from monitoring: ${websiteId} from workspace: ${workspaceId}`);
    } catch (error) {
      console.error(`Failed to remove website ${websiteId} from monitoring:`, error);
    }
  }, []);

  /**
   * Get current subscription status for debugging
   */
  const getSubscriptionStatus = useCallback((workspaceId: string) => {
    return websiteStatusService.getSubscriptionStatus(workspaceId);
  }, []);

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      const activeWorkspaces = Array.from(activeSubscriptionsRef.current);
      activeWorkspaces.forEach(workspaceId => {
        websiteStatusService.unsubscribeFromWorkspace(workspaceId).catch(error => {
          console.error(`Failed to cleanup subscription for workspace ${workspaceId}:`, error);
        });
      });
      activeSubscriptionsRef.current.clear();
    };
  }, []);

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
    if (currentWorkspaceId && websiteIds.length > 0) {
      const websiteIdsChanged = 
        JSON.stringify(previousWebsiteIds.sort()) !== JSON.stringify([...websiteIds].sort());

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