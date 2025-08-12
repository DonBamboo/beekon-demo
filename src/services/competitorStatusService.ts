import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Competitor } from "@/types/database";

// Competitor analysis status types based on database schema
export type CompetitorStatus = "pending" | "analyzing" | "completed" | "failed";

export interface CompetitorStatusUpdate {
  competitorId: string;
  websiteId: string;
  status: CompetitorStatus;
  progress?: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export type CompetitorStatusCallback = (update: CompetitorStatusUpdate) => void;

interface CompetitorStatusSubscription {
  workspaceId: string;
  websiteIds: Set<string>;
  competitorIds: Set<string>;
  callback: CompetitorStatusCallback;
  pollingIntervals: Map<string, NodeJS.Timeout>;
  realtimeChannel?: RealtimeChannel;
  isActive: boolean;
}

/**
 * Competitor Status Service
 * 
 * Provides real-time competitor analysis status updates using a hybrid approach:
 * - Primary: Supabase real-time subscriptions for instant updates
 * - Fallback: Smart polling with status-aware intervals
 * 
 * Features:
 * - Automatic cleanup when competitors reach terminal states
 * - Smart polling intervals based on analysis status
 * - Connection management and graceful fallback
 * - Memory leak prevention and error handling
 * - Progress tracking for ongoing analysis
 */
class CompetitorStatusService {
  private subscriptions: Map<string, CompetitorStatusSubscription> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  /**
   * Subscribe to competitor status updates for a workspace
   */
  async subscribeToWorkspace(
    workspaceId: string,
    websiteIds: string[],
    callback: CompetitorStatusCallback
  ): Promise<void> {
    // Clean up any existing subscription
    await this.unsubscribeFromWorkspace(workspaceId);

    // Get all competitors for the websites to monitor
    const competitorIds = await this.getCompetitorIds(websiteIds);

    const subscription: CompetitorStatusSubscription = {
      workspaceId,
      websiteIds: new Set(websiteIds),
      competitorIds: new Set(competitorIds),
      callback,
      pollingIntervals: new Map(),
      isActive: true,
    };

    this.subscriptions.set(workspaceId, subscription);

    // Try real-time first, fallback to polling if needed
    const realtimeSuccess = await this.setupRealtimeSubscription(subscription);
    if (!realtimeSuccess) {
      console.warn(`Competitor real-time subscription failed for workspace ${workspaceId}, falling back to polling`);
      this.startPollingForWorkspace(subscription);
    }
  }

  /**
   * Setup Supabase real-time subscription for competitors table
   */
  private async setupRealtimeSubscription(subscription: CompetitorStatusSubscription): Promise<boolean> {
    try {
      const channel = supabase
        .channel(`competitor-status-${subscription.workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'beekon_data',
            table: 'competitors',
          },
          (payload) => {
            if (!subscription.isActive) return;

            const competitor = payload.new as Competitor & {
              analysis_status: CompetitorStatus;
              analysis_progress: number;
              analysis_started_at: string;
              analysis_completed_at: string;
              last_error_message: string;
            };

            // Only process if this competitor is being monitored
            if (subscription.competitorIds.has(competitor.id)) {
              this.handleStatusUpdate(subscription, {
                competitorId: competitor.id,
                websiteId: competitor.website_id,
                status: competitor.analysis_status,
                progress: competitor.analysis_progress,
                errorMessage: competitor.last_error_message,
                startedAt: competitor.analysis_started_at,
                completedAt: competitor.analysis_completed_at,
                updatedAt: competitor.updated_at || new Date().toISOString(),
              });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Competitor real-time subscription active for workspace ${subscription.workspaceId}`);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`Competitor real-time subscription error for workspace ${subscription.workspaceId}`);
            this.handleRealtimeError(subscription);
          } else if (status === 'TIMED_OUT') {
            console.warn(`Competitor real-time subscription timeout for workspace ${subscription.workspaceId}`);
            this.handleRealtimeError(subscription);
          }
        });

      subscription.realtimeChannel = channel;
      return true;
    } catch (error) {
      console.error('Failed to setup competitor real-time subscription:', error);
      return false;
    }
  }

  /**
   * Handle real-time connection errors with reconnection logic
   */
  private async handleRealtimeError(subscription: CompetitorStatusSubscription): Promise<void> {
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
      console.warn(`Max reconnection attempts reached for competitor workspace ${subscription.workspaceId}, switching to polling`);
      this.startPollingForWorkspace(subscription);
    }
  }

  /**
   * Start smart polling for competitors that need monitoring
   */
  private startPollingForWorkspace(subscription: CompetitorStatusSubscription): void {
    // Only poll competitors that are in active analysis states
    this.pollActiveCompetitors(subscription);
  }

  /**
   * Poll competitors with smart intervals based on status
   */
  private async pollActiveCompetitors(subscription: CompetitorStatusSubscription): Promise<void> {
    try {
      const { data: competitors, error } = await supabase
        .schema('beekon_data')
        .from('competitors')
        .select('id, website_id, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_error_message, updated_at')
        .in('id', Array.from(subscription.competitorIds))
        .in('analysis_status', ['pending', 'analyzing']); // Only poll active states

      if (error) {
        console.error('Error polling competitor status:', error);
        return;
      }

      if (!competitors || !subscription.isActive) return;

      // Clear existing intervals
      subscription.pollingIntervals.forEach(interval => clearInterval(interval));
      subscription.pollingIntervals.clear();

      // Setup polling for each active competitor
      competitors.forEach(competitor => {
        if (!subscription.isActive) return;
        
        const interval = this.getPollingInterval(competitor.analysis_status as CompetitorStatus);
        
        if (interval > 0) {
          const pollInterval = setInterval(async () => {
            if (!subscription.isActive) return;
            
            await this.checkCompetitorStatus(subscription, competitor.id);
          }, interval);

          subscription.pollingIntervals.set(competitor.id, pollInterval);
        }
      });

    } catch (error) {
      console.error('Error in pollActiveCompetitors:', error);
    }
  }

  /**
   * Get polling interval based on competitor analysis status
   */
  private getPollingInterval(status: CompetitorStatus): number {
    switch (status) {
      case 'analyzing': return 5000;    // 5 seconds - active monitoring with progress updates
      case 'pending': return 30000;     // 30 seconds - waiting to start
      case 'completed':
      case 'failed':
        return 0; // No polling for terminal states
      default:
        return 30000; // Default fallback
    }
  }

  /**
   * Check individual competitor status
   */
  private async checkCompetitorStatus(subscription: CompetitorStatusSubscription, competitorId: string): Promise<void> {
    try {
      const { data: competitor, error } = await supabase
        .schema('beekon_data')
        .from('competitors')
        .select('id, website_id, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_error_message, updated_at')
        .eq('id', competitorId)
        .single();

      if (error || !competitor || !subscription.isActive) return;

      const newStatus = competitor.analysis_status as CompetitorStatus;
      
      // Notify about the status update
      this.handleStatusUpdate(subscription, {
        competitorId: competitor.id,
        websiteId: competitor.website_id,
        status: newStatus,
        progress: competitor.analysis_progress,
        errorMessage: competitor.last_error_message,
        startedAt: competitor.analysis_started_at,
        completedAt: competitor.analysis_completed_at,
        updatedAt: competitor.updated_at || new Date().toISOString(),
      });

    } catch (error) {
      console.error(`Error checking competitor status for ${competitorId}:`, error);
    }
  }

  /**
   * Handle status updates from either real-time or polling
   */
  private handleStatusUpdate(subscription: CompetitorStatusSubscription, update: CompetitorStatusUpdate): void {
    try {
      // Call the callback with the update
      subscription.callback(update);

      // Clean up polling for competitors that reached terminal states
      if (update.status === 'completed' || update.status === 'failed') {
        const interval = subscription.pollingIntervals.get(update.competitorId);
        if (interval) {
          clearInterval(interval);
          subscription.pollingIntervals.delete(update.competitorId);
        }
        
        console.log(`Competitor ${update.competitorId} reached terminal state: ${update.status}`);
      }
    } catch (error) {
      console.error('Error handling competitor status update:', error);
    }
  }

  /**
   * Add competitor to monitoring (e.g., when a new competitor is added)
   */
  async addCompetitorToMonitoring(workspaceId: string, competitorId: string): Promise<void> {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return;

    subscription.competitorIds.add(competitorId);
    
    // Start monitoring the new competitor
    const { data: competitor } = await supabase
      .schema('beekon_data')
      .from('competitors')
      .select('id, website_id, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_error_message, updated_at')
      .eq('id', competitorId)
      .single();

    if (competitor && subscription.isActive) {
      const status = competitor.analysis_status as CompetitorStatus;
      
      // If it's in an active state, start polling if we don't have real-time
      if ((status === 'pending' || status === 'analyzing') && !subscription.realtimeChannel) {
        const interval = this.getPollingInterval(status);
        if (interval > 0) {
          const pollInterval = setInterval(async () => {
            if (!subscription.isActive) return;
            await this.checkCompetitorStatus(subscription, competitorId);
          }, interval);

          subscription.pollingIntervals.set(competitorId, pollInterval);
        }
      }
    }
  }

  /**
   * Remove competitor from monitoring (e.g., when a competitor is deleted)
   */
  removeCompetitorFromMonitoring(workspaceId: string, competitorId: string): void {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return;

    subscription.competitorIds.delete(competitorId);
    
    // Clean up polling interval
    const interval = subscription.pollingIntervals.get(competitorId);
    if (interval) {
      clearInterval(interval);
      subscription.pollingIntervals.delete(competitorId);
    }
  }

  /**
   * Unsubscribe from workspace competitor updates
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
   * Get current subscription status for debugging
   */
  getSubscriptionStatus(workspaceId: string): {
    isActive: boolean;
    hasRealtime: boolean;
    monitoredCompetitors: number;
    pollingCompetitors: number;
  } | null {
    const subscription = this.subscriptions.get(workspaceId);
    if (!subscription) return null;

    return {
      isActive: subscription.isActive,
      hasRealtime: !!subscription.realtimeChannel,
      monitoredCompetitors: subscription.competitorIds.size,
      pollingCompetitors: subscription.pollingIntervals.size,
    };
  }

  /**
   * Update competitor analysis status (for external services to call)
   */
  async updateCompetitorStatus(
    competitorId: string,
    status: CompetitorStatus,
    progress?: number,
    errorMessage?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('update_competitor_analysis_status', {
        p_competitor_id: competitorId,
        p_status: status,
        p_progress: progress,
        p_error_message: errorMessage,
      });

      if (error) {
        console.error('Error updating competitor status:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('Error calling update_competitor_analysis_status:', error);
      return false;
    }
  }

  /**
   * Get competitors by status for a workspace
   */
  async getCompetitorsByStatus(
    websiteId: string,
    status?: CompetitorStatus
  ): Promise<CompetitorStatusUpdate[]> {
    try {
      const { data, error } = await supabase.rpc('get_competitors_by_status', {
        p_website_id: websiteId,
        p_status: status,
      });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        competitorId: row.id,
        websiteId: websiteId,
        status: row.analysis_status,
        progress: row.analysis_progress,
        errorMessage: row.last_error_message,
        startedAt: row.analysis_started_at,
        completedAt: row.analysis_completed_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      console.error('Error getting competitors by status:', error);
      return [];
    }
  }

  /**
   * Get competitor IDs for a set of websites
   */
  private async getCompetitorIds(websiteIds: string[]): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .schema('beekon_data')
        .from('competitors')
        .select('id')
        .in('website_id', websiteIds)
        .eq('is_active', true);

      if (error) throw error;
      
      return (data || []).map(c => c.id);
    } catch (error) {
      console.error('Error getting competitor IDs:', error);
      return [];
    }
  }

  /**
   * Start competitor analysis (trigger analysis and set status)
   */
  async startCompetitorAnalysis(competitorId: string): Promise<boolean> {
    return this.updateCompetitorStatus(competitorId, 'analyzing', 0);
  }

  /**
   * Complete competitor analysis
   */
  async completeCompetitorAnalysis(competitorId: string): Promise<boolean> {
    return this.updateCompetitorStatus(competitorId, 'completed', 100);
  }

  /**
   * Fail competitor analysis with error message
   */
  async failCompetitorAnalysis(competitorId: string, errorMessage: string): Promise<boolean> {
    return this.updateCompetitorStatus(competitorId, 'failed', undefined, errorMessage);
  }
}

// Export singleton instance
export const competitorStatusService = new CompetitorStatusService();