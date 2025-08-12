import { useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@/contexts/AppStateContext';
import { competitorStatusService, CompetitorStatusUpdate } from '@/services/competitorStatusService';
import { useSelectedWebsite } from '@/contexts/AppStateContext';

/**
 * Hook for real-time competitor status monitoring
 * 
 * Provides:
 * - Automatic subscription to real-time competitor status updates
 * - Status management through AppStateContext
 * - Connection status monitoring
 * - Clean workspace switching and cleanup
 */
export function useCompetitorStatus() {
  const { 
    updateCompetitorStatus,
    getCompetitorStatus,
    isCompetitorMonitored,
    getMonitoredCompetitors,
    clearCompetitorStatus,
    state 
  } = useAppState();
  
  const { selectedWebsite } = useSelectedWebsite();
  const currentWorkspaceId = selectedWebsite?.workspace_id;
  const selectedWebsiteId = selectedWebsite?.id;
  
  // Track current subscription state
  const subscriptionRef = useRef<{
    workspaceId: string | null;
    websiteIds: string[];
  }>({ workspaceId: null, websiteIds: [] });

  // Handle status updates from the service
  const handleStatusUpdate = useCallback((update: CompetitorStatusUpdate) => {
    updateCompetitorStatus(
      update.competitorId,
      update.websiteId,
      update.status,
      update.progress,
      update.errorMessage,
      update.startedAt,
      update.completedAt,
      update.updatedAt
    );
  }, [updateCompetitorStatus]);

  // Subscribe to workspace competitor status updates
  const subscribeToWorkspace = useCallback(async (
    workspaceId: string,
    websiteIds: string[]
  ) => {
    try {
      await competitorStatusService.subscribeToWorkspace(
        workspaceId,
        websiteIds,
        handleStatusUpdate
      );
      
      subscriptionRef.current = { workspaceId, websiteIds };
      
      console.log(`Subscribed to competitor status updates for workspace ${workspaceId}`);
    } catch (error) {
      console.error('Failed to subscribe to competitor status updates:', error);
    }
  }, [handleStatusUpdate]);

  // Unsubscribe from current workspace
  const unsubscribeFromWorkspace = useCallback(async () => {
    const { workspaceId } = subscriptionRef.current;
    if (workspaceId) {
      try {
        await competitorStatusService.unsubscribeFromWorkspace(workspaceId);
        subscriptionRef.current = { workspaceId: null, websiteIds: [] };
        
        console.log(`Unsubscribed from competitor status updates for workspace ${workspaceId}`);
      } catch (error) {
        console.error('Failed to unsubscribe from competitor status updates:', error);
      }
    }
  }, []);

  // Add a competitor to monitoring
  const addCompetitorToMonitoring = useCallback(async (competitorId: string) => {
    const { workspaceId } = subscriptionRef.current;
    if (workspaceId) {
      try {
        await competitorStatusService.addCompetitorToMonitoring(workspaceId, competitorId);
        console.log(`Added competitor ${competitorId} to monitoring`);
      } catch (error) {
        console.error(`Failed to add competitor ${competitorId} to monitoring:`, error);
      }
    }
  }, []);

  // Remove a competitor from monitoring
  const removeCompetitorFromMonitoring = useCallback((competitorId: string) => {
    const { workspaceId } = subscriptionRef.current;
    if (workspaceId) {
      competitorStatusService.removeCompetitorFromMonitoring(workspaceId, competitorId);
      clearCompetitorStatus(competitorId);
      console.log(`Removed competitor ${competitorId} from monitoring`);
    }
  }, [clearCompetitorStatus]);

  // Get subscription status for debugging
  const getSubscriptionStatus = useCallback(() => {
    const { workspaceId } = subscriptionRef.current;
    if (workspaceId) {
      return competitorStatusService.getSubscriptionStatus(workspaceId);
    }
    return null;
  }, []);

  // Manual status update (for external services)
  const updateCompetitorAnalysisStatus = useCallback(async (
    competitorId: string,
    status: 'pending' | 'analyzing' | 'completed' | 'failed',
    progress?: number,
    errorMessage?: string
  ): Promise<boolean> => {
    try {
      const success = await competitorStatusService.updateCompetitorStatus(
        competitorId,
        status,
        progress,
        errorMessage
      );
      
      if (!success) {
        console.error(`Failed to update competitor status for ${competitorId}`);
      }
      
      return success;
    } catch (error) {
      console.error(`Error updating competitor status for ${competitorId}:`, error);
      return false;
    }
  }, []);

  // Convenience methods for common status transitions
  const startCompetitorAnalysis = useCallback((competitorId: string) => {
    return updateCompetitorAnalysisStatus(competitorId, 'analyzing', 0);
  }, [updateCompetitorAnalysisStatus]);

  const completeCompetitorAnalysis = useCallback((competitorId: string) => {
    return updateCompetitorAnalysisStatus(competitorId, 'completed', 100);
  }, [updateCompetitorAnalysisStatus]);

  const failCompetitorAnalysis = useCallback((competitorId: string, errorMessage: string) => {
    return updateCompetitorAnalysisStatus(competitorId, 'failed', undefined, errorMessage);
  }, [updateCompetitorAnalysisStatus]);

  // Auto-subscribe when workspace changes
  useEffect(() => {
    const handleWorkspaceChange = async () => {
      // Unsubscribe from previous workspace
      await unsubscribeFromWorkspace();

      // Subscribe to new workspace if available
      if (currentWorkspaceId && selectedWebsiteId) {
        const websiteIds = state.workspace.websites
          .filter(w => w.workspace_id === currentWorkspaceId)
          .map(w => w.id);
          
        if (websiteIds.length > 0) {
          await subscribeToWorkspace(currentWorkspaceId, websiteIds);
        }
      }
    };

    handleWorkspaceChange();
  }, [
    currentWorkspaceId, 
    selectedWebsiteId,
    state.workspace.websites,
    subscribeToWorkspace,
    unsubscribeFromWorkspace
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubscribeFromWorkspace();
    };
  }, [unsubscribeFromWorkspace]);

  // Return interface
  return {
    // State access
    competitorStatusMap: state.competitors.statusMap,
    monitoredCompetitors: state.competitors.monitoredCompetitors,
    
    // Status queries
    getCompetitorStatus,
    isCompetitorMonitored,
    getMonitoredCompetitors,
    
    // Status management
    updateCompetitorStatus: updateCompetitorAnalysisStatus,
    clearCompetitorStatus,
    
    // Monitoring management
    addCompetitorToMonitoring,
    removeCompetitorFromMonitoring,
    
    // Convenience methods
    startCompetitorAnalysis,
    completeCompetitorAnalysis,
    failCompetitorAnalysis,
    
    // Subscription management
    subscribeToWorkspace,
    unsubscribeFromWorkspace,
    getSubscriptionStatus,
    
    // Current subscription info
    currentWorkspaceId,
    isSubscribed: subscriptionRef.current.workspaceId !== null,
  };
}