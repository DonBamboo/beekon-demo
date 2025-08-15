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

interface StatusSubscription {
  workspaceId: string;
  websiteIds: Set<string>;
  callback: WebsiteStatusCallback;
  pollingIntervals: Map<string, NodeJS.Timeout>;
  realtimeChannel?: RealtimeChannel;
  isActive: boolean;
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
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

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
    };

    this.subscriptions.set(workspaceId, subscription);

    console.log(`[REALTIME] Setting up subscription for workspace ${workspaceId} with ${websiteIds.length} websites:`, websiteIds);

    // Try real-time first, fallback to polling if needed
    const realtimeSuccess = await this.setupRealtimeSubscription(subscription);
    if (!realtimeSuccess) {
      console.warn(`[REALTIME] Real-time subscription failed for workspace ${workspaceId}, falling back to polling`);
      this.startPollingForWorkspace(subscription);
    } else {
      console.log(`[REALTIME] Real-time subscription established successfully for workspace ${workspaceId}`);
    }
  }

  /**
   * Setup Supabase real-time subscription
   */
  private async setupRealtimeSubscription(subscription: StatusSubscription): Promise<boolean> {
    try {
      const channel = supabase
        .channel(`website-status-${subscription.workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'beekon_data',
            table: 'websites',
            filter: `workspace_id=eq.${subscription.workspaceId}`,
          },
          (payload) => {
            if (!subscription.isActive) return;

            const website = payload.new as Website;
            console.log(`[REALTIME] Received update for website ${website.id}:`, {
              status: website.crawl_status,
              workspace: website.workspace_id,
              timestamp: new Date().toISOString()
            });

            // Process ALL workspace website updates - no filtering by websiteIds
            // This ensures newly added websites are immediately monitored
            this.handleStatusUpdate(subscription, {
              websiteId: website.id,
              status: website.crawl_status as WebsiteStatus,
              lastCrawledAt: website.last_crawled_at,
              updatedAt: website.updated_at || new Date().toISOString(),
            });
          }
        )
        .subscribe((status) => {
          console.log(`[REALTIME] Subscription status for workspace ${subscription.workspaceId}: ${status}`);
          if (status === 'SUBSCRIBED') {
            console.log(`[REALTIME] ✅ Subscription active for workspace ${subscription.workspaceId}`);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`[REALTIME] ❌ Subscription error for workspace ${subscription.workspaceId}`);
            this.handleRealtimeError(subscription);
          } else if (status === 'TIMED_OUT') {
            console.warn(`[REALTIME] ⏰ Subscription timeout for workspace ${subscription.workspaceId}`);
            this.handleRealtimeError(subscription);
          }
        });

      subscription.realtimeChannel = channel;
      return true;
    } catch (error) {
      console.error('Failed to setup real-time subscription:', error);
      return false;
    }
  }

  /**
   * Handle real-time connection errors with reconnection logic
   */
  private async handleRealtimeError(subscription: StatusSubscription): Promise<void> {
    const attempts = this.reconnectAttempts.get(subscription.workspaceId) || 0;
    
    if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts.set(subscription.workspaceId, attempts + 1);
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempts) * 1000;
      setTimeout(async () => {
        if (subscription.isActive) {
          const success = await this.setupRealtimeSubscription(subscription);
          if (!success) {
            this.startPollingForWorkspace(subscription);
          }
        }
      }, delay);
    } else {
      console.warn(`Max reconnection attempts reached for workspace ${subscription.workspaceId}, switching to polling`);
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
  private async pollActiveWebsites(subscription: StatusSubscription): Promise<void> {
    try {
      const { data: websites, error } = await supabase
        .schema('beekon_data')
        .from('websites')
        .select('id, crawl_status, last_crawled_at, updated_at')
        .in('id', Array.from(subscription.websiteIds))
        .in('crawl_status', ['pending', 'crawling']); // Only poll active states

      if (error) {
        console.error('Error polling website status:', error);
        return;
      }

      if (!websites || !subscription.isActive) return;

      // Clear existing intervals
      subscription.pollingIntervals.forEach(interval => clearInterval(interval));
      subscription.pollingIntervals.clear();

      // Setup polling for each active website
      websites.forEach(website => {
        if (!subscription.isActive) return;
        
        const interval = this.getPollingInterval(website.crawl_status as WebsiteStatus);
        
        if (interval > 0) {
          const pollInterval = setInterval(async () => {
            if (!subscription.isActive) return;
            
            await this.checkWebsiteStatus(subscription, website.id);
          }, interval);

          subscription.pollingIntervals.set(website.id, pollInterval);
        }
      });

    } catch (error) {
      console.error('Error in pollActiveWebsites:', error);
    }
  }

  /**
   * Get polling interval based on website status
   */
  private getPollingInterval(status: WebsiteStatus): number {
    switch (status) {
      case 'crawling': return 2000;   // 2 seconds - active monitoring
      case 'pending': return 30000;   // 30 seconds - slower check
      case 'completed':
      case 'failed':
        return 0; // No polling for terminal states
      default:
        return 30000; // Default fallback
    }
  }

  /**
   * Check individual website status
   */
  private async checkWebsiteStatus(subscription: StatusSubscription, websiteId: string): Promise<void> {
    try {
      const { data: website, error } = await supabase
        .schema('beekon_data')
        .from('websites')
        .select('id, crawl_status, last_crawled_at, updated_at')
        .eq('id', websiteId)
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
      console.error(`Error checking status for website ${websiteId}:`, error);
    }
  }

  /**
   * Handle status updates from either real-time or polling
   */
  private handleStatusUpdate(subscription: StatusSubscription, update: WebsiteStatusUpdate): void {
    try {
      // Call the callback with the update
      subscription.callback(update);

      // Clean up polling for websites that reached terminal states
      if (update.status === 'completed' || update.status === 'failed') {
        const interval = subscription.pollingIntervals.get(update.websiteId);
        if (interval) {
          clearInterval(interval);
          subscription.pollingIntervals.delete(update.websiteId);
        }
        
        console.log(`Website ${update.websiteId} reached terminal state: ${update.status}`);
      }
    } catch (error) {
      console.error('Error handling status update:', error);
    }
  }

  /**
   * Add website to monitoring
   */
  async addWebsiteToMonitoring(workspaceId: string, websiteId: string): Promise<void> {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return;

    subscription.websiteIds.add(websiteId);
    
    // Start monitoring the new website
    const { data: website } = await supabase
      .schema('beekon_data')
      .from('websites')
      .select('id, crawl_status, last_crawled_at, updated_at')
      .eq('id', websiteId)
      .single();

    if (website && subscription.isActive) {
      const status = website.crawl_status as WebsiteStatus;
      
      // If it's in an active state, start polling if we don't have real-time
      if ((status === 'pending' || status === 'crawling') && !subscription.realtimeChannel) {
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
    subscription.pollingIntervals.forEach(interval => clearInterval(interval));
    subscription.pollingIntervals.clear();

    // Remove from maps
    this.subscriptions.delete(workspaceId);
    this.reconnectAttempts.delete(workspaceId);
  }

  /**
   * Clean up all subscriptions (call on app unmount)
   */
  async cleanup(): Promise<void> {
    const workspaceIds = Array.from(this.subscriptions.keys());
    await Promise.all(workspaceIds.map(id => this.unsubscribeFromWorkspace(id)));
  }

  /**
   * Get current subscription status
   */
  getSubscriptionStatus(workspaceId: string): {
    isActive: boolean;
    hasRealtime: boolean;
    monitoredWebsites: number;
    pollingWebsites: number;
  } | null {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return null;

    return {
      isActive: subscription.isActive,
      hasRealtime: !!subscription.realtimeChannel,
      monitoredWebsites: subscription.websiteIds.size,
      pollingWebsites: subscription.pollingIntervals.size,
    };
  }
}

// Export singleton instance
export const websiteStatusService = new WebsiteStatusService();