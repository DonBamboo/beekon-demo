import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Website } from "@/types/database";

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

interface EventSequenceTracker {
  websiteId: string;
  lastEventTimestamp: number;
  eventCount: number;
  missedEventCount: number;
  lastStatus: string;
  eventHistory: Array<{
    eventType: string;
    status: string;
    timestamp: number;
    sequenceNumber: number;
  }>;
}

interface StatusSubscription {
  workspaceId: string;
  websiteIds: Set<string>;
  callback: WebsiteStatusCallback;
  pollingIntervals: Map<string, NodeJS.Timeout>;
  realtimeChannel?: RealtimeChannel;
  isActive: boolean;
  eventTrackers: Map<string, EventSequenceTracker>; // websiteId -> tracker
}

/**
 * Website Status Service
 *
 * Provides real-time website crawling status updates using a hybrid approach:
 * - Primary: Supabase real-time subscriptions for instant updates
 * - Fallback: Smart polling with context-aware intervals
 *
 * Features:
 * - Automatic cleanup when websites reach terminal states
 * - Smart polling intervals based on status
 * - Connection management and graceful fallback
 * - Memory leak prevention
 */
class WebsiteStatusService {
  private subscriptions: Map<string, StatusSubscription> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private connectionHealth: Map<
    string,
    { lastSeen: number; isHealthy: boolean }
  > = new Map();
  private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
  private healthCheckInterval?: NodeJS.Timeout;
  private syncCheckInterval?: NodeJS.Timeout;

  /**
   * Subscribe to website status updates for a workspace
   */
  async subscribeToWorkspace(
    workspaceId: string,
    websiteIds: string[],
    callback: WebsiteStatusCallback
  ): Promise<void> {
    // Clean up any existing subscription
    await this.unsubscribeFromWorkspace(workspaceId);

    const subscription: StatusSubscription = {
      workspaceId,
      websiteIds: new Set(websiteIds),
      callback,
      pollingIntervals: new Map(),
      isActive: true,
      eventTrackers: new Map(), // Initialize event tracking
    };

    this.subscriptions.set(workspaceId, subscription);

    // Initialize connection health tracking
    this.connectionHealth.set(workspaceId, {
      lastSeen: Date.now(),
      isHealthy: false,
    });

    // Try real-time first, fallback to polling if needed
    const realtimeSuccess = await this.setupRealtimeSubscription(subscription);
    if (!realtimeSuccess) {
      this.startPollingForWorkspace(subscription);
    }

    // Start connection health monitoring
    this.startHealthMonitoring();

    // Start periodic sync verification
    this.startSyncMonitoring();
  }

  /**
   * Setup Supabase real-time subscription
   */
  private async setupRealtimeSubscription(
    subscription: StatusSubscription
  ): Promise<boolean> {
    try {
      const channelName = `website-status-${subscription.workspaceId}`;
      const subscriptionConfig = {
        event: "*", // Listen to ALL events (INSERT, UPDATE, DELETE)
        schema: "beekon_data",
        table: "websites",
        filter: `workspace_id=eq.${subscription.workspaceId}`,
      };

      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as any,
          subscriptionConfig as any,
          (payload: SupabaseRealtimePayload) => {
            if (!subscription.isActive) return;

          // Handle different event types
          const eventType = payload.eventType;
          let website: Website | null = null;
          let websiteId: string | null = null;

          if (eventType === "INSERT" || eventType === "UPDATE") {
            website = payload.new as Website;
            websiteId = website?.id;
          } else if (eventType === "DELETE") {
            website = payload.old as Website;
            websiteId = website?.id;
          }

          if (!website || !websiteId) {
            return;
          }

          // Skip processing DELETE events for status updates
          if (eventType === "DELETE") {
            return;
          }

          // Track event sequence for missing event detection
          this.trackEventSequence(
            subscription,
            websiteId,
            eventType,
            website.crawl_status || "unknown"
          );

          // Compare with direct database query to detect data lag for INSERT/UPDATE events
          this.verifyDatabaseSync(websiteId, website.crawl_status || "unknown");

          // Process website updates
          this.handleStatusUpdate(subscription, {
            websiteId: websiteId,
            status: website.crawl_status as WebsiteStatus,
            lastCrawledAt: website.last_crawled_at,
            updatedAt: website.updated_at || new Date().toISOString(),
          });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Mark connection as healthy
            const health = this.connectionHealth.get(subscription.workspaceId);
            if (health) {
              health.isHealthy = true;
              health.lastSeen = Date.now();
            }
          } else if (status === "CHANNEL_ERROR") {
            // Mark connection as unhealthy
            const health = this.connectionHealth.get(subscription.workspaceId);
            if (health) {
              health.isHealthy = false;
            }
            this.handleRealtimeError(subscription);
          } else if (status === "TIMED_OUT") {
            // Mark connection as unhealthy
            const health = this.connectionHealth.get(subscription.workspaceId);
            if (health) {
              health.isHealthy = false;
            }
            this.handleRealtimeError(subscription);
          }
        }
      );

      subscription.realtimeChannel = channel;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle real-time connection errors with enhanced reconnection logic
   */
  private async handleRealtimeError(
    subscription: StatusSubscription
  ): Promise<void> {
    const attempts = this.reconnectAttempts.get(subscription.workspaceId) || 0;

    if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(subscription.workspaceId, attempts + 1);

      // Enhanced exponential backoff: 1s, 2s, 4s, 8s, 16s with jitter
      const baseDelay = Math.pow(2, attempts) * 1000;
      const jitter = Math.random() * 1000; // Add randomness to prevent thundering herd
      const delay = baseDelay + jitter;

      setTimeout(async () => {
        if (subscription.isActive) {
          // Clean up old channel before reconnecting
          if (subscription.realtimeChannel) {
            await supabase.removeChannel(subscription.realtimeChannel);
            subscription.realtimeChannel = undefined;
          }

          const success = await this.setupRealtimeSubscription(subscription);
          if (!success) {
            this.startPollingForWorkspace(subscription);
          } else {
            // Reset attempt counter on successful reconnection
            this.reconnectAttempts.set(subscription.workspaceId, 0);
          }
        }
      }, delay);
    } else {
      this.startPollingForWorkspace(subscription);
    }
  }

  /**
   * Start smart polling for websites that need monitoring
   */
  private startPollingForWorkspace(subscription: StatusSubscription): void {
    // Only poll websites that are in active crawling states
    this.pollActiveWebsites(subscription);
  }

  /**
   * Poll websites with smart intervals based on status
   */
  private async pollActiveWebsites(
    subscription: StatusSubscription
  ): Promise<void> {
    try {
      const { data: websites, error } = await supabase
        .schema("beekon_data")
        .from("websites")
        .select("id, crawl_status, last_crawled_at, updated_at")
        .in("id", Array.from(subscription.websiteIds))
        .in("crawl_status", ["pending", "crawling"]); // Only poll active states

      if (error) {
        return;
      }

      if (!websites || !subscription.isActive) return;

      // Clear existing intervals
      subscription.pollingIntervals.forEach((interval) =>
        clearInterval(interval)
      );
      subscription.pollingIntervals.clear();

      // Setup polling for each active website
      websites.forEach((website) => {
        if (!subscription.isActive) return;

        const interval = this.getPollingInterval(
          website.crawl_status as WebsiteStatus
        );

        if (interval > 0) {
          const pollInterval = setInterval(async () => {
            if (!subscription.isActive) return;

            await this.checkWebsiteStatus(subscription, website.id);
          }, interval);

          subscription.pollingIntervals.set(website.id, pollInterval);
        }
      });
    } catch (error) {
      console.error("An error occurred: " + error);
    }
  }

  /**
   * Get polling interval based on website status
   */
  private getPollingInterval(status: WebsiteStatus): number {
    switch (status) {
      case "crawling":
        return 2000; // 2 seconds - active monitoring
      case "pending":
        return 30000; // 30 seconds - slower check
      case "completed":
      case "failed":
        return 0; // No polling for terminal states
      default:
        return 30000; // Default fallback
    }
  }

  /**
   * Check individual website status
   */
  private async checkWebsiteStatus(
    subscription: StatusSubscription,
    websiteId: string
  ): Promise<void> {
    try {
      const { data: website, error } = await supabase
        .schema("beekon_data")
        .from("websites")
        .select("id, crawl_status, last_crawled_at, updated_at")
        .eq("id", websiteId)
        .single();

      if (error || !website || !subscription.isActive) return;

      const newStatus = website.crawl_status as WebsiteStatus;

      // Notify about the status update
      this.handleStatusUpdate(subscription, {
        websiteId: website.id,
        status: newStatus,
        lastCrawledAt: website.last_crawled_at,
        updatedAt: website.updated_at || new Date().toISOString(),
      });
    } catch (error) {
      console.error("An error occurred: " + error);
    }
  }

  /**
   * Handle status updates from either real-time or polling
   */
  private handleStatusUpdate(
    subscription: StatusSubscription,
    update: WebsiteStatusUpdate
  ): void {
    try {
      // Update connection health (we received activity)
      const health = this.connectionHealth.get(subscription.workspaceId);
      if (health) {
        health.lastSeen = Date.now();
        health.isHealthy = true;
      }

      // Call the callback with the update
      subscription.callback(update);

      // Clean up polling for websites that reached terminal states
      if (update.status === "completed" || update.status === "failed") {
        const interval = subscription.pollingIntervals.get(update.websiteId);
        if (interval) {
          clearInterval(interval);
          subscription.pollingIntervals.delete(update.websiteId);
        }
      }
    } catch (error) {
      console.error("An error occurred: " + error);
    }
  }

  /**
   * Add website to monitoring
   */
  async addWebsiteToMonitoring(
    workspaceId: string,
    websiteId: string
  ): Promise<void> {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return;

    subscription.websiteIds.add(websiteId);

    // Start monitoring the new website
    const { data: website } = await supabase
      .schema("beekon_data")
      .from("websites")
      .select("id, crawl_status, last_crawled_at, updated_at")
      .eq("id", websiteId)
      .single();

    if (website && subscription.isActive) {
      const status = website.crawl_status as WebsiteStatus;

      // If it's in an active state, start polling if we don't have real-time
      if (
        (status === "pending" || status === "crawling") &&
        !subscription.realtimeChannel
      ) {
        const interval = this.getPollingInterval(status);
        if (interval > 0) {
          const pollInterval = setInterval(async () => {
            if (!subscription.isActive) return;
            await this.checkWebsiteStatus(subscription, websiteId);
          }, interval);

          subscription.pollingIntervals.set(websiteId, pollInterval);
        }
      }
    }
  }

  /**
   * Remove website from monitoring
   */
  removeWebsiteFromMonitoring(workspaceId: string, websiteId: string): void {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return;

    subscription.websiteIds.delete(websiteId);

    // Clean up polling interval
    const interval = subscription.pollingIntervals.get(websiteId);
    if (interval) {
      clearInterval(interval);
      subscription.pollingIntervals.delete(websiteId);
    }
  }

  /**
   * Unsubscribe from workspace updates
   */
  async unsubscribeFromWorkspace(workspaceId: string): Promise<void> {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return;

    // Mark as inactive
    subscription.isActive = false;

    // Clean up real-time subscription
    if (subscription.realtimeChannel) {
      await supabase.removeChannel(subscription.realtimeChannel);
    }

    // Clean up polling intervals
    subscription.pollingIntervals.forEach((interval) =>
      clearInterval(interval)
    );
    subscription.pollingIntervals.clear();

    // Remove from maps
    this.subscriptions.delete(workspaceId);
    this.reconnectAttempts.delete(workspaceId);
    this.connectionHealth.delete(workspaceId);
  }

  /**
   * Start connection health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();

      this.connectionHealth.forEach((health, workspaceId) => {
        const timeSinceLastSeen = now - health.lastSeen;
        const wasHealthy = health.isHealthy;

        // Mark unhealthy if no activity for CONNECTION_TIMEOUT
        if (timeSinceLastSeen > this.CONNECTION_TIMEOUT) {
          health.isHealthy = false;

          if (wasHealthy) {
            // Attempt to reconnect stale connections
            const subscription = this.subscriptions.get(workspaceId);
            if (subscription) {
              this.handleRealtimeError(subscription);
            }
          }
        }
      });
    }, this.CONNECTION_TIMEOUT / 2); // Check every 15 seconds
  }

  /**
   * Stop connection health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Start intelligent sync monitoring with fallback polling
   */
  private startSyncMonitoring(): void {
    if (this.syncCheckInterval) {
      return; // Already running
    }

    this.syncCheckInterval = setInterval(async () => {
      // Check sync for all monitored websites
      for (const [workspaceId, subscription] of this.subscriptions) {
        if (!subscription.isActive) continue;

        try {
          // Query all websites for this workspace
          const { data: websites, error } = await supabase
            .schema("beekon_data")
            .from("websites")
            .select(
              "id, crawl_status, last_crawled_at, updated_at, domain, workspace_id"
            )
            .eq("workspace_id", workspaceId);

          if (error) {
            continue;
          }

          if (!websites) continue;

          // Check for stale real-time connections and perform intelligent fallback
          const connectionHealth = this.connectionHealth.get(workspaceId);
          const isConnectionStale =
            !connectionHealth?.isHealthy ||
            Date.now() - (connectionHealth?.lastSeen || 0) > 120000; // 2 minutes

          websites.forEach((website) => {
            // INTELLIGENT POLLING FALLBACK: If connection is stale and website is in active status, force update
            if (
              isConnectionStale &&
              (website.crawl_status === "crawling" ||
                website.crawl_status === "pending")
            ) {
              // Force status update since real-time may be missing events
              this.handleStatusUpdate(subscription, {
                websiteId: website.id,
                status: website.crawl_status as WebsiteStatus,
                lastCrawledAt: website.last_crawled_at,
                updatedAt: website.updated_at || new Date().toISOString(),
              });
            }

            // Also check if website completed but we missed the event
            const tracker = subscription.eventTrackers.get(website.id);
            if (
              tracker &&
              tracker.lastStatus === "crawling" &&
              website.crawl_status === "completed"
            ) {
              // CRITICAL: Trigger immediate UI refresh for missed events
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("websiteStatusUpdate", {
                    detail: {
                      websiteId: website.id,
                      status: "completed",
                      source: "missed-event-recovery",
                    },
                  })
                );
              }

              this.handleStatusUpdate(subscription, {
                websiteId: website.id,
                status: "completed",
                lastCrawledAt: website.last_crawled_at,
                updatedAt: website.updated_at || new Date().toISOString(),
              });
            }
          });
        } catch (error) {
          console.error("An error occurred: " + error);
        }
      }
    }, 30000); // Check every 30 seconds for more responsive fallback
  }

  /**
   * Stop periodic sync monitoring
   */
  private stopSyncMonitoring(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = undefined;
    }
  }

  /**
   * Clean up all subscriptions (call on app unmount)
   */
  async cleanup(): Promise<void> {
    this.stopHealthMonitoring();
    this.stopSyncMonitoring();
    this.connectionHealth.clear();
    const workspaceIds = Array.from(this.subscriptions.keys());
    await Promise.all(
      workspaceIds.map((id) => this.unsubscribeFromWorkspace(id))
    );
  }

  /**
   * Track event sequence to detect missing events
   */
  private trackEventSequence(
    subscription: StatusSubscription,
    websiteId: string,
    eventType: string,
    currentStatus: string
  ): void {
    const now = Date.now();
    let tracker = subscription.eventTrackers.get(websiteId);

    if (!tracker) {
      // Initialize new tracker
      tracker = {
        websiteId,
        lastEventTimestamp: now,
        eventCount: 0,
        missedEventCount: 0,
        lastStatus: currentStatus,
        eventHistory: [],
      };
      subscription.eventTrackers.set(websiteId, tracker);
    }

    // Increment event count
    tracker.eventCount++;
    const sequenceNumber = tracker.eventCount;

    // Check for potential missed events based on status progression
    let potentialMissedEvents = 0;
    if (tracker.lastStatus && tracker.lastStatus !== currentStatus) {
      // Detect logical status progression gaps
      const statusProgression = ["pending", "crawling", "completed", "failed"];
      const lastIndex = statusProgression.indexOf(tracker.lastStatus);
      const currentIndex = statusProgression.indexOf(currentStatus);

      if (lastIndex !== -1 && currentIndex !== -1) {
        if (currentIndex > lastIndex + 1) {
          potentialMissedEvents = currentIndex - lastIndex - 1;
          tracker.missedEventCount += potentialMissedEvents;
        }
      }
    }

    // Add to event history (keep last 10 events)
    tracker.eventHistory.push({
      eventType,
      status: currentStatus,
      timestamp: now,
      sequenceNumber,
    });
    if (tracker.eventHistory.length > 10) {
      tracker.eventHistory.shift();
    }

    // Update tracker
    tracker.lastEventTimestamp = now;
    tracker.lastStatus = currentStatus;
  }

  /**
   * Verify database sync by comparing real-time data with direct database query
   */
  private async verifyDatabaseSync(
    websiteId: string,
    realtimeStatus: string | null
  ): Promise<void> {
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
        return;
      }

      if (!website) {
        return;
      }

      const dbStatus = website.crawl_status;
      const isInSync = realtimeStatus === dbStatus;

      if (!isInSync) {
        console.error(`[DB-SYNC] 🚨 DATA DESYNC DETECTED!`, {
          websiteId,
          realtimeStatus,
          actualDatabaseStatus: dbStatus,
          message: "Real-time data does not match database state!",
        });

        // AUTOMATIC SYNC RECOVERY: Force a fresh status update with correct database data

        // Find the subscription for this website's workspace
        const websiteWorkspaceId = website.workspace_id;
        const subscription = this.subscriptions.get(websiteWorkspaceId);

        if (subscription && subscription.isActive) {
          // Force update with correct database status

          // CRITICAL: Trigger immediate UI refresh by dispatching custom event
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("websiteStatusUpdate", {
                detail: {
                  websiteId: websiteId,
                  status: dbStatus,
                  source: "sync-recovery",
                },
              })
            );
          }

          this.handleStatusUpdate(subscription, {
            websiteId: websiteId,
            status: dbStatus as WebsiteStatus,
            lastCrawledAt: website.last_crawled_at,
            updatedAt: website.updated_at || new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error(
        `[DB-SYNC] ❌ Failed to verify database sync for website ${websiteId}:`,
        error
      );
    }
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
   * Get current subscription status
   */
  getSubscriptionStatus(workspaceId: string): {
    isActive: boolean;
    hasRealtime: boolean;
    monitoredWebsites: number;
    pollingWebsites: number;
    connectionHealth?: {
      isHealthy: boolean;
      lastSeenAgo: number;
      reconnectAttempts: number;
    };
  } | null {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return null;

    const health = this.connectionHealth.get(workspaceId);
    const reconnectAttempts = this.reconnectAttempts.get(workspaceId) || 0;

    return {
      isActive: subscription.isActive,
      hasRealtime: !!subscription.realtimeChannel,
      monitoredWebsites: subscription.websiteIds.size,
      pollingWebsites: subscription.pollingIntervals.size,
      connectionHealth: health
        ? {
            isHealthy: health.isHealthy,
            lastSeenAgo: Date.now() - health.lastSeen,
            reconnectAttempts,
          }
        : undefined,
    };
  }
}

// Export singleton instance
export const websiteStatusService = new WebsiteStatusService();
