import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Website } from "@/types/database";
import { debugError, debugInfo, addDebugEvent } from "@/lib/debug-utils";

// Website status types based on database schema
export type WebsiteStatus = "pending" | "crawling" | "completed" | "failed";

export interface WebsiteStatusUpdate {
  websiteId: string;
  status: WebsiteStatus;
  lastCrawledAt?: string | null;
  updatedAt: string;
}

export type WebsiteStatusCallback = (update: WebsiteStatusUpdate) => void;

// Supabase realtime payload types
interface SupabaseRealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Website | null;
  old: Website | null;
  errors: string[] | null;
}

// Supabase postgres changes configuration
interface PostgresChangesConfig {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  filter?: string;
}

// Simplified website subscription interface - single monitoring approach
interface WebsiteSubscription {
  websiteId: string;
  workspaceId: string;
  callback: WebsiteStatusCallback;
  realtimeChannel?: RealtimeChannel;
  pollingInterval?: NodeJS.Timeout;
  isActive: boolean;
  currentStatus: WebsiteStatus;
  createdAt: number;
  lastEventTimestamp: number;
}

/**
 * Website Status Service - Simplified Per-Website Monitoring
 *
 * Provides real-time website crawling status updates using a streamlined approach:
 * - Primary: Supabase real-time subscriptions for crawling websites only
 * - Fallback: Smart polling with 3-second intervals
 * - Automatic cleanup when websites complete or fail
 * - Simple, reliable monitoring without complex recovery systems
 */
class WebsiteStatusService {
  private websiteSubscriptions: Map<string, WebsiteSubscription> = new Map();
  private readonly POLLING_INTERVAL = 3000; // 3 seconds for crawling websites
  private readonly RECONCILIATION_INTERVAL = 30000; // 30 seconds for periodic sync
  private reconciliationInterval?: NodeJS.Timeout;

  /**
   * Start monitoring a specific website (only if status is "crawling")
   */
  async startMonitoringWebsite(
    websiteId: string,
    workspaceId: string,
    callback: WebsiteStatusCallback
  ): Promise<void> {
    // Check if already monitoring this website
    if (this.websiteSubscriptions.has(websiteId)) {
      console.log(`[WEBSITE-MONITOR] Already monitoring website: ${websiteId}`);
      return;
    }

    // Get current website status from database
    const { data: website, error } = await supabase
      .schema("beekon_data")
      .from("websites")
      .select("id, crawl_status, last_crawled_at, updated_at, workspace_id")
      .eq("id", websiteId)
      .single();

    if (error || !website) {
      console.error(`[WEBSITE-MONITOR] ❌ Failed to get website ${websiteId}:`, error);
      return;
    }

    const currentStatus = website.crawl_status as WebsiteStatus;
    
    // Only monitor websites that are actively crawling
    if (currentStatus !== "crawling") {
      console.log(`[WEBSITE-MONITOR] Skipping monitoring for website ${websiteId} - status: ${currentStatus}`);
      return;
    }

    console.log(`[WEBSITE-MONITOR] 🎯 Starting targeted monitoring for website: ${websiteId} (status: ${currentStatus})`);

    // Create simplified website subscription
    const websiteSubscription: WebsiteSubscription = {
      websiteId,
      workspaceId,
      callback,
      isActive: true,
      currentStatus,
      createdAt: Date.now(),
      lastEventTimestamp: Date.now(),
    };

    this.websiteSubscriptions.set(websiteId, websiteSubscription);

    // Add debug event for subscription start
    addDebugEvent({
      type: 'real-time',
      category: 'real-time',
      source: 'WebsiteStatusService',
      message: `Started monitoring crawling website`,
      details: {
        websiteId,
        workspaceId,
        currentStatus,
        totalSubscriptions: this.websiteSubscriptions.size,
        monitoringMethod: 'per-website-realtime',
      },
      websiteId,
      severity: 'medium',
    });

    // Start reconciliation interval if this is the first subscription
    if (this.websiteSubscriptions.size === 1) {
      this.startReconciliation();
    }

    // Setup real-time subscription for this specific website
    const realtimeSuccess = await this.setupWebsiteRealtimeSubscription(websiteSubscription);
    if (!realtimeSuccess) {
      // Fallback to polling if real-time fails
      this.startWebsitePolling(websiteSubscription);
    }
  }

  /**
   * Stop monitoring a specific website
   */
  async stopMonitoringWebsite(websiteId: string): Promise<void> {
    const subscription = this.websiteSubscriptions.get(websiteId);
    if (!subscription) {
      return;
    }

    console.log(`[WEBSITE-MONITOR] 🛑 Stopping monitoring for website: ${websiteId} (reason: status completed/failed)`);

    // Add debug event for subscription stop
    addDebugEvent({
      type: 'real-time',
      category: 'real-time',
      source: 'WebsiteStatusService',
      message: `Stopped monitoring website (completed/failed)`,
      details: {
        websiteId,
        workspaceId: subscription.workspaceId,
        previousStatus: subscription.currentStatus,
        monitoringDuration: Date.now() - subscription.createdAt,
        totalSubscriptionsRemaining: this.websiteSubscriptions.size - 1,
      },
      websiteId,
      severity: 'low',
    });

    // Mark as inactive
    subscription.isActive = false;

    // Clean up real-time channel
    if (subscription.realtimeChannel) {
      await supabase.removeChannel(subscription.realtimeChannel);
    }

    // Clean up polling interval
    if (subscription.pollingInterval) {
      clearInterval(subscription.pollingInterval);
    }

    // Remove from tracking
    this.websiteSubscriptions.delete(websiteId);

    // Stop reconciliation if no more subscriptions
    if (this.websiteSubscriptions.size === 0) {
      this.stopReconciliation();
    }
  }

  /**
   * Subscribe to workspace updates (DEPRECATED - use startMonitoringWebsite instead)
   * Kept for backward compatibility during transition
   */
  async subscribeToWorkspace(
    workspaceId: string,
    websiteIds: string[],
    callback: WebsiteStatusCallback
  ): Promise<void> {
    console.warn('[DEPRECATED] subscribeToWorkspace is deprecated. Use monitorCrawlingWebsites instead.');
    await this.monitorCrawlingWebsites(workspaceId, websiteIds, callback);
  }

  /**
   * Setup Supabase real-time subscription for a specific website
   */
  private async setupWebsiteRealtimeSubscription(
    subscription: WebsiteSubscription
  ): Promise<boolean> {
    try {
      const channelName = `website-status-${subscription.websiteId}`;
      const subscriptionConfig: PostgresChangesConfig = {
        event: "UPDATE", // Only listen to UPDATE events for efficiency
        schema: "beekon_data",
        table: "websites",
        filter: `id=eq.${subscription.websiteId}`, // Target specific website
      };

      console.log(`[WEBSITE-REALTIME] Setting up targeted channel: ${channelName}`, {
        websiteId: subscription.websiteId,
        currentStatus: subscription.currentStatus,
        schema: subscriptionConfig.schema,
        table: subscriptionConfig.table,
        filter: subscriptionConfig.filter,
      });

      const channel = (supabase.channel(channelName) as RealtimeChannel)
        .on('postgres_changes' as never, subscriptionConfig as never, (payload: SupabaseRealtimePayload) => {
          if (!subscription.isActive) return;

          console.log(`[WEBSITE-REALTIME] Received targeted event for website ${subscription.websiteId}:`, {
            eventType: payload.eventType,
            newData: payload.new ? { id: payload.new.id, crawl_status: payload.new.crawl_status } : null,
            oldData: payload.old ? { id: payload.old.id, crawl_status: payload.old.crawl_status } : null,
            timestamp: new Date().toISOString(),
          });

          // Process the status update
          if (payload.eventType === "UPDATE" && payload.new) {
            const website = payload.new as Website;
            const newStatus = website.crawl_status as WebsiteStatus;
            const oldStatus = subscription.currentStatus;

            // Update current status
            subscription.currentStatus = newStatus;

            // Add debug event for realtime status change detection
            addDebugEvent({
              type: 'real-time',
              category: 'real-time',
              source: 'WebsiteStatusService',
              message: `Status change detected via realtime`,
              details: {
                websiteId: subscription.websiteId,
                oldStatus,
                newStatus,
                detectionMethod: 'supabase-realtime',
                lastCrawledAt: website.last_crawled_at,
              },
              websiteId: subscription.websiteId,
              severity: 'medium',
            });
            
            // Handle the status update
            this.handleWebsiteStatusUpdate(subscription, {
              websiteId: subscription.websiteId,
              status: newStatus,
              lastCrawledAt: website.last_crawled_at,
              updatedAt: website.updated_at || new Date().toISOString(),
            });

            // FIXED: Immediate cleanup for terminal states - no race conditions
            if (newStatus === "completed" || newStatus === "failed") {
              console.log(`[WEBSITE-REALTIME] ✅ Website ${subscription.websiteId} completed (${oldStatus} → ${newStatus}). Stopping monitoring.`);
              // Immediate synchronous cleanup to prevent race conditions
              this.stopMonitoringWebsite(subscription.websiteId);
            }
          }
        })
        .subscribe((status) => {
          console.log(`[WEBSITE-REALTIME] Channel ${channelName} status:`, {
            status,
            websiteId: subscription.websiteId,
            timestamp: new Date().toISOString(),
          });

          if (status === "SUBSCRIBED") {
            console.log(`[WEBSITE-REALTIME] ✅ Successfully subscribed to website: ${subscription.websiteId}`);
            
            // Add debug event for successful real-time subscription
            addDebugEvent({
              type: 'real-time',
              category: 'real-time',
              source: 'WebsiteStatusService',
              message: `Real-time subscription established`,
              details: {
                websiteId: subscription.websiteId,
                workspaceId: subscription.workspaceId,
                channelName,
                subscriptionType: 'supabase-realtime',
                currentStatus: subscription.currentStatus,
              },
              websiteId: subscription.websiteId,
              severity: 'medium',
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[WEBSITE-REALTIME] ❌ Connection issue for website ${subscription.websiteId}:`, status);
            
            // Add debug event for connection issues
            addDebugEvent({
              type: 'real-time',
              category: 'real-time',
              source: 'WebsiteStatusService',
              message: `Real-time connection issue detected`,
              details: {
                websiteId: subscription.websiteId,
                workspaceId: subscription.workspaceId,
                connectionStatus: status,
                fallbackMethod: 'polling',
              },
              websiteId: subscription.websiteId,
              severity: 'high',
            });
            
            // Fallback to polling for this specific website
            this.startWebsitePolling(subscription);
          }
        });

      subscription.realtimeChannel = channel;
      return true;
    } catch (error) {
      console.error(`[WEBSITE-REALTIME] ❌ Failed to setup real-time for website ${subscription.websiteId}:`, error);
      return false;
    }
  }

  /**
   * Start polling for a specific website
   */
  private startWebsitePolling(subscription: WebsiteSubscription): void {
    if (subscription.pollingInterval) {
      clearInterval(subscription.pollingInterval);
    }

    console.log(`[WEBSITE-POLLING] Starting polling for website: ${subscription.websiteId}`);

    // Add debug event for polling fallback
    addDebugEvent({
      type: 'real-time',
      category: 'real-time',
      source: 'WebsiteStatusService',
      message: `Started polling fallback for website`,
      details: {
        websiteId: subscription.websiteId,
        workspaceId: subscription.workspaceId,
        pollingInterval: this.POLLING_INTERVAL,
        reason: 'realtime-fallback',
        currentStatus: subscription.currentStatus,
      },
      websiteId: subscription.websiteId,
      severity: 'medium',
    });

    const pollInterval = setInterval(async () => {
      if (!subscription.isActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const { data: website, error } = await supabase
          .schema("beekon_data")
          .from("websites")
          .select("id, crawl_status, last_crawled_at, updated_at")
          .eq("id", subscription.websiteId)
          .single();

        if (error || !website) return;

        const newStatus = website.crawl_status as WebsiteStatus;
        const oldStatus = subscription.currentStatus;

        // Only process if status changed
        if (newStatus !== oldStatus) {
          console.log(`[WEBSITE-POLLING] Status change detected for ${subscription.websiteId}: ${oldStatus} → ${newStatus}`);
          
          // Add debug event for polling status change detection
          addDebugEvent({
            type: 'real-time',
            category: 'real-time',
            source: 'WebsiteStatusService',
            message: `Status change detected via polling`,
            details: {
              websiteId: subscription.websiteId,
              oldStatus,
              newStatus,
              detectionMethod: 'polling',
              lastCrawledAt: website.last_crawled_at,
            },
            websiteId: subscription.websiteId,
            severity: 'medium',
          });
          
          subscription.currentStatus = newStatus;

          this.handleWebsiteStatusUpdate(subscription, {
            websiteId: subscription.websiteId,
            status: newStatus,
            lastCrawledAt: website.last_crawled_at,
            updatedAt: website.updated_at || new Date().toISOString(),
          });

          // FIXED: Immediate cleanup for terminal states - no race conditions
          if (newStatus === "completed" || newStatus === "failed") {
            console.log(`[WEBSITE-POLLING] ✅ Website ${subscription.websiteId} completed via polling. Stopping monitoring.`);
            // Immediate synchronous cleanup to prevent race conditions
            this.stopMonitoringWebsite(subscription.websiteId);
          }
        }
      } catch (error) {
        console.error(`[WEBSITE-POLLING] Error polling website ${subscription.websiteId}:`, error);
      }
    }, this.POLLING_INTERVAL); // Poll every 3 seconds for crawling websites

    subscription.pollingInterval = pollInterval;
  }

  /**
   * Handle website status update
   */
  private handleWebsiteStatusUpdate(
    subscription: WebsiteSubscription,
    update: WebsiteStatusUpdate
  ): void {
    try {
      // Call the callback with the update
      subscription.callback(update);
    } catch (error) {
      console.error(`[WEBSITE-MONITOR] Error handling status update for ${subscription.websiteId}:`, error);
    }
  }








  /**
   * Monitor crawling websites from a list of website IDs
   */
  async monitorCrawlingWebsites(
    workspaceId: string,
    websiteIds: string[],
    callback: WebsiteStatusCallback
  ): Promise<void> {
    console.log(`[WEBSITE-MONITOR] 🔍 Checking ${websiteIds.length} websites for crawling status in workspace: ${workspaceId}`);

    // Query database to find which websites are currently crawling
    const { data: crawlingWebsites, error } = await supabase
      .schema("beekon_data")
      .from("websites")
      .select("id, crawl_status, workspace_id")
      .in("id", websiteIds)
      .eq("crawl_status", "crawling");

    if (error) {
      console.error(`[WEBSITE-MONITOR] ❌ Failed to query crawling websites:`, error);
      return;
    }

    if (!crawlingWebsites || crawlingWebsites.length === 0) {
      console.log(`[WEBSITE-MONITOR] No crawling websites found to monitor`);
      return;
    }

    console.log(`[WEBSITE-MONITOR] Found ${crawlingWebsites.length} crawling websites to monitor:`, 
      crawlingWebsites.map(w => `${w.id} (${w.crawl_status})`));

    // Add debug event for batch monitoring start
    addDebugEvent({
      type: 'real-time',
      category: 'real-time',
      source: 'WebsiteStatusService',
      message: `Started batch monitoring of crawling websites`,
      details: {
        workspaceId,
        totalWebsitesRequested: websiteIds.length,
        crawlingWebsitesFound: crawlingWebsites.length,
        skippedWebsites: websiteIds.length - crawlingWebsites.length,
        crawlingWebsites: crawlingWebsites.map(w => ({ id: w.id, status: w.crawl_status })),
      },
      severity: 'medium',
    });

    // Start monitoring each crawling website
    for (const website of crawlingWebsites) {
      await this.startMonitoringWebsite(website.id, workspaceId, callback);
    }
  }

  /**
   * Get monitoring status for debugging
   */
  getMonitoringStatus(): {
    totalWebsitesMonitored: number;
    websitesBeingMonitored: Array<{
      websiteId: string;
      workspaceId: string;
      currentStatus: WebsiteStatus;
      hasRealtime: boolean;
      hasPolling: boolean;
      monitoringDuration: number;
    }>;
  } {
    const websites = Array.from(this.websiteSubscriptions.values()).map(sub => ({
      websiteId: sub.websiteId,
      workspaceId: sub.workspaceId,
      currentStatus: sub.currentStatus,
      hasRealtime: !!sub.realtimeChannel,
      hasPolling: !!sub.pollingInterval,
      monitoringDuration: Date.now() - sub.createdAt,
    }));

    return {
      totalWebsitesMonitored: this.websiteSubscriptions.size,
      websitesBeingMonitored: websites,
    };
  }

  /**
   * Add website to monitoring (UPDATED to use new per-website monitoring)
   */
  async addWebsiteToMonitoring(
    workspaceId: string,
    websiteId: string
  ): Promise<void> {
    // Use the new per-website monitoring system
    await this.startMonitoringWebsite(websiteId, workspaceId, (update) => {
      // Default callback that triggers context updates
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("websiteStatusUpdate", {
            detail: {
              websiteId: update.websiteId,
              status: update.status,
              source: "per-website-monitoring",
              timestamp: Date.now(),
            },
          })
        );
      }
    });
  }



  /**
   * Unsubscribe from workspace updates (DEPRECATED - kept for backward compatibility)
   */
  async unsubscribeFromWorkspace(workspaceId: string): Promise<void> {
    console.log(`[DEPRECATED] unsubscribeFromWorkspace called for ${workspaceId}. Stopping all website monitoring in workspace.`);
    
    // Stop monitoring all websites in this workspace
    const websitesToStop = Array.from(this.websiteSubscriptions.values())
      .filter(sub => sub.workspaceId === workspaceId);
    
    for (const subscription of websitesToStop) {
      await this.stopMonitoringWebsite(subscription.websiteId);
    }
  }



  /**
   * Start simplified reconciliation - periodically check database for missed updates
   */
  private startReconciliation(): void {
    if (this.reconciliationInterval) {
      return; // Already running
    }

    console.log('[RECONCILIATION] Starting periodic reconciliation');
    
    this.reconciliationInterval = setInterval(async () => {
      // Check all monitored websites for status changes
      for (const subscription of this.websiteSubscriptions.values()) {
        if (!subscription.isActive) continue;

        try {
          const { data: website, error } = await supabase
            .schema('beekon_data')
            .from('websites')
            .select('id, crawl_status, last_crawled_at, updated_at')
            .eq('id', subscription.websiteId)
            .single();

          if (error || !website) continue;

          const newStatus = website.crawl_status as WebsiteStatus;
          
          // Only process if status changed or if it's been too long since last update
          const timeSinceLastUpdate = Date.now() - subscription.lastEventTimestamp;
          
          if (newStatus !== subscription.currentStatus || timeSinceLastUpdate > 60000) {
            console.log(`[RECONCILIATION] Status sync for ${subscription.websiteId}: ${subscription.currentStatus} → ${newStatus}`);
            
            subscription.currentStatus = newStatus;
            subscription.lastEventTimestamp = Date.now();
            
            // Handle the status update
            this.handleWebsiteStatusUpdate(subscription, {
              websiteId: subscription.websiteId,
              status: newStatus,
              lastCrawledAt: website.last_crawled_at,
              updatedAt: website.updated_at || new Date().toISOString(),
            });

            // Stop monitoring if completed
            if (newStatus === 'completed' || newStatus === 'failed') {
              console.log(`[RECONCILIATION] Website ${subscription.websiteId} completed via reconciliation. Stopping monitoring.`);
              this.stopMonitoringWebsite(subscription.websiteId);
            }
          }
        } catch (error) {
          console.error(`[RECONCILIATION] Error checking website ${subscription.websiteId}:`, error);
        }
      }
    }, this.RECONCILIATION_INTERVAL);
  }

  /**
   * Stop reconciliation
   */
  private stopReconciliation(): void {
    if (this.reconciliationInterval) {
      console.log('[RECONCILIATION] Stopping periodic reconciliation');
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = undefined;
    }
  }

  /**
   * Clean up all subscriptions (call on app unmount)
   */
  async cleanup(): Promise<void> {
    console.log('[CLEANUP] Cleaning up all website monitoring');
    
    this.stopReconciliation();
    
    // Stop all website monitoring
    const websiteIds = Array.from(this.websiteSubscriptions.keys());
    await Promise.all(
      websiteIds.map((id) => this.stopMonitoringWebsite(id))
    );
  }



  /**
   * Direct database query to get current website status (for debugging)
   */
  async getWebsiteStatusFromDB(websiteId: string): Promise<{
    id: string;
    crawl_status: string | null;
    last_crawled_at: string | null;
    updated_at: string | null;
    domain: string;
  } | null> {
    try {
      const { data: website, error } = await supabase
        .schema("beekon_data")
        .from("websites")
        .select(
          "id, crawl_status, last_crawled_at, updated_at, domain, workspace_id"
        )
        .eq("id", websiteId)
        .single();

      if (error) {
        console.error(
          `[DB-DIRECT] ❌ Error querying website ${websiteId}:`,
          error
        );
        return null;
      }

      return website;
    } catch (error) {
      console.error(
        `[DB-DIRECT] ❌ Failed to query website ${websiteId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get current subscription status for a workspace (DEPRECATED)
   */
  getSubscriptionStatus(workspaceId: string): {
    isActive: boolean;
    hasRealtime: boolean;
    monitoredWebsites: number;
    pollingWebsites: number;
  } | null {
    const websitesInWorkspace = Array.from(this.websiteSubscriptions.values())
      .filter(sub => sub.workspaceId === workspaceId);
    
    if (websitesInWorkspace.length === 0) return null;

    return {
      isActive: websitesInWorkspace.some(sub => sub.isActive),
      hasRealtime: websitesInWorkspace.some(sub => !!sub.realtimeChannel),
      monitoredWebsites: websitesInWorkspace.length,
      pollingWebsites: websitesInWorkspace.filter(sub => !!sub.pollingInterval).length,
    };
  }
}

// Export singleton instance
export const websiteStatusService = new WebsiteStatusService();
