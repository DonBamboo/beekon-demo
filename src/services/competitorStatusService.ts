import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Competitor } from "@/types/database";
import { debugError, debugInfo } from "@/lib/debug-utils";

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
   * Determine competitor status using proper field priority
   * Uses analysis_status field as primary source with intelligent fallbacks
   */
  private determineCompetitorStatus(competitor: Record<string, unknown>): {
    status: CompetitorStatus;
    progress: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  } {
    // Helper to safely cast unknown values
    const asString = (value: unknown): string | null => 
      typeof value === 'string' ? value : null;
    const asNumber = (value: unknown): number => 
      typeof value === 'number' ? value : 0;

    // Primary: Use analysis_status if available
    if (competitor.analysis_status) {
      const status = competitor.analysis_status as CompetitorStatus;
      return {
        status,
        progress: asNumber(competitor.analysis_progress) || (status === 'completed' ? 100 : status === 'analyzing' ? 50 : 0),
        errorMessage: asString(competitor.last_error_message),
        startedAt: asString(competitor.analysis_started_at),
        completedAt: asString(competitor.analysis_completed_at),
      };
    }

    // Fallback: Derive from other fields if analysis_status is null
    if (competitor.last_error_message) {
      return {
        status: 'failed' as CompetitorStatus,
        progress: 0,
        errorMessage: asString(competitor.last_error_message),
        startedAt: asString(competitor.analysis_started_at) || asString(competitor.created_at),
        completedAt: null,
      };
    }

    if (competitor.analysis_started_at && !competitor.analysis_completed_at && !competitor.last_analyzed_at) {
      return {
        status: 'analyzing' as CompetitorStatus,
        progress: asNumber(competitor.analysis_progress) || 50,
        errorMessage: null,
        startedAt: asString(competitor.analysis_started_at),
        completedAt: null,
      };
    }

    if (competitor.analysis_completed_at || competitor.last_analyzed_at) {
      return {
        status: 'completed' as CompetitorStatus,
        progress: 100,
        errorMessage: null,
        startedAt: asString(competitor.analysis_started_at) || asString(competitor.created_at),
        completedAt: asString(competitor.analysis_completed_at) || asString(competitor.last_analyzed_at),
      };
    }

    // Default: pending status
    return {
      status: 'pending' as CompetitorStatus,
      progress: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    };
  }

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

            const competitor = payload.new as Competitor;

            // Only process if this competitor is being monitored
            if (subscription.competitorIds.has(competitor.id)) {
              // Use proper status determination logic
              const statusInfo = this.determineCompetitorStatus(competitor);
              
              this.handleStatusUpdate(subscription, {
                competitorId: competitor.id,
                websiteId: competitor.website_id,
                status: statusInfo.status,
                progress: statusInfo.progress,
                errorMessage: statusInfo.errorMessage,
                startedAt: statusInfo.startedAt,
                completedAt: statusInfo.completedAt,
                updatedAt: competitor.updated_at || new Date().toISOString(),
              });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            debugInfo(
              'Successfully subscribed to competitor real-time updates',
              'CompetitorStatusService',
              {
                workspaceId: subscription.workspaceId,
                competitorCount: subscription.competitorIds.size,
                channelStatus: status
              },
              'real-time'
            );
          } else if (status === 'CHANNEL_ERROR') {
            debugError(
              'Competitor real-time subscription channel error',
              'CompetitorStatusService',
              {
                workspaceId: subscription.workspaceId,
                channelStatus: status,
                competitorCount: subscription.competitorIds.size
              },
              undefined,
              'real-time'
            );
            this.handleRealtimeError(subscription);
          } else if (status === 'TIMED_OUT') {
            debugError(
              'Competitor real-time subscription timed out',
              'CompetitorStatusService',
              {
                workspaceId: subscription.workspaceId,
                channelStatus: status
              },
              undefined,
              'real-time'
            );
            this.handleRealtimeError(subscription);
          }
        });

      subscription.realtimeChannel = channel;
      return true;
    } catch (error) {
      debugError(
        'Failed to setup competitor real-time subscription',
        'CompetitorStatusService',
        {
          workspaceId: subscription.workspaceId,
          competitorCount: subscription.competitorIds.size,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'real-time'
      );
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
        .select('id, website_id, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_analyzed_at, last_error_message, created_at, updated_at')
        .in('id', Array.from(subscription.competitorIds))
        .or('analysis_status.eq.pending,analysis_status.eq.analyzing,analysis_status.is.null'); // Poll active analysis states

      if (error) {
        debugError(
          'Error polling competitor status',
          'CompetitorStatusService',
          {
            workspaceId: subscription.workspaceId,
            competitorCount: subscription.competitorIds.size,
            errorCode: error.code,
            errorMessage: error.message,
            errorDetails: error.details
          },
          undefined,
          'real-time'
        );
        return;
      }

      if (!competitors || !subscription.isActive) return;

      // Clear existing intervals
      subscription.pollingIntervals.forEach(interval => clearInterval(interval));
      subscription.pollingIntervals.clear();

      // Setup polling for each active competitor
      competitors.forEach(competitor => {
        if (!subscription.isActive) return;
        
        const statusInfo = this.determineCompetitorStatus(competitor);
        const interval = this.getPollingInterval(statusInfo.status);
        
        if (interval > 0) {
          const pollInterval = setInterval(async () => {
            if (!subscription.isActive) return;
            
            await this.checkCompetitorStatus(subscription, competitor.id);
          }, interval);

          subscription.pollingIntervals.set(competitor.id, pollInterval);
        }
      });

    } catch (error) {
      debugError(
        'Error in pollActiveCompetitors',
        'CompetitorStatusService',
        {
          workspaceId: subscription.workspaceId,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'real-time'
      );
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
        .select('id, website_id, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_analyzed_at, last_error_message, created_at, updated_at')
        .eq('id', competitorId)
        .single();

      if (error || !competitor || !subscription.isActive) return;

      const statusInfo = this.determineCompetitorStatus(competitor);
      
      // Notify about the status update
      this.handleStatusUpdate(subscription, {
        competitorId: competitor.id,
        websiteId: competitor.website_id,
        status: statusInfo.status,
        progress: statusInfo.progress,
        errorMessage: statusInfo.errorMessage,
        startedAt: statusInfo.startedAt,
        completedAt: statusInfo.completedAt,
        updatedAt: competitor.updated_at || new Date().toISOString(),
      });

    } catch (error) {
      debugError(
        'Error checking individual competitor status',
        'CompetitorStatusService',
        {
          competitorId,
          workspaceId: subscription.workspaceId,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'real-time'
      );
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
        
      }
    } catch (error) {
      debugError(
        'Error handling competitor status update',
        'CompetitorStatusService',
        {
          competitorId: update.competitorId,
          websiteId: update.websiteId,
          status: update.status,
          progress: update.progress,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'real-time'
      );
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
      .select('id, website_id, last_analyzed_at, created_at, updated_at')
      .eq('id', competitorId)
      .single();

    if (competitor && subscription.isActive) {
      const statusInfo = this.determineCompetitorStatus(competitor);
      
      // If it's in an active state, start polling if we don't have real-time
      if ((statusInfo.status === 'pending' || statusInfo.status === 'analyzing') && !subscription.realtimeChannel) {
        const interval = this.getPollingInterval(statusInfo.status);
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
   * Uses proper database status tracking fields
   */
  async updateCompetitorStatus(
    competitorId: string,
    status: CompetitorStatus,
    progress?: number,
    errorMessage?: string
  ): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {
        analysis_status: status,
        updated_at: new Date().toISOString(),
      };

      // Set progress if provided
      if (progress !== undefined) {
        updateData.analysis_progress = progress;
      }

      // Handle status-specific fields
      switch (status) {
        case 'analyzing':
          updateData.analysis_started_at = new Date().toISOString();
          updateData.analysis_completed_at = null;
          updateData.last_error_message = null;
          if (progress === undefined) {
            updateData.analysis_progress = 0;
          }
          break;
        
        case 'completed':
          updateData.analysis_completed_at = new Date().toISOString();
          updateData.last_analyzed_at = new Date().toISOString(); // Keep for backward compatibility
          updateData.analysis_progress = 100;
          updateData.last_error_message = null;
          break;
        
        case 'failed':
          updateData.analysis_completed_at = null;
          updateData.analysis_progress = 0;
          updateData.last_error_message = errorMessage || 'Analysis failed';
          break;
        
        case 'pending':
          updateData.analysis_started_at = null;
          updateData.analysis_completed_at = null;
          updateData.analysis_progress = 0;
          updateData.last_error_message = null;
          break;
      }

      const { error } = await supabase
        .schema('beekon_data')
        .from('competitors')
        .update(updateData)
        .eq('id', competitorId);

      if (error) {
        debugError(
          'Error updating competitor status in database',
          'CompetitorStatusService',
          {
            competitorId,
            status,
            progress,
            errorMessage,
            errorCode: error.code,
            errorDetails: error.message
          },
          undefined,
          'database'
        );
        return false;
      }

      debugInfo(
        'Competitor status updated successfully in database',
        'CompetitorStatusService',
        {
          competitorId,
          status,
          progress,
          operation: 'updateCompetitorStatus'
        },
        'database'
      );
      return true;
    } catch (error) {
      debugError(
        'Exception while updating competitor status',
        'CompetitorStatusService',
        {
          competitorId,
          status,
          progress,
          errorMessage,
          exceptionMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'database'
      );
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
      let query = supabase
        .schema('beekon_data')
        .from('competitors')
        .select('id, website_id, analysis_status, analysis_progress, analysis_started_at, analysis_completed_at, last_analyzed_at, last_error_message, created_at, updated_at')
        .eq('website_id', websiteId);

      // Filter by status if provided
      if (status === 'completed') {
        query = query.not('last_analyzed_at', 'is', null);
      } else if (status === 'pending') {
        query = query.is('last_analyzed_at', null);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((row) => {
        const statusInfo = this.determineCompetitorStatus(row);
        return {
          competitorId: row.id,
          websiteId: websiteId,
          status: statusInfo.status,
          progress: statusInfo.progress,
          errorMessage: statusInfo.errorMessage,
          startedAt: statusInfo.startedAt,
          completedAt: statusInfo.completedAt,
          updatedAt: row.updated_at || new Date().toISOString(),
        };
      });
    } catch (error) {
      debugError(
        'Error getting competitors by status',
        'CompetitorStatusService',
        {
          websiteId,
          status,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'database'
      );
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
      debugError(
        'Error getting competitor IDs',
        'CompetitorStatusService',
        {
          websiteIds,
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        error instanceof Error ? error : undefined,
        'database'
      );
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