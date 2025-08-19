import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAppState } from "@/hooks/appStateHooks";
import { supabase } from "@/integrations/supabase/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SubscriptionTier, isValidSubscriptionTier } from "@/utils/typeGuards";
import { useWebsiteStatusContext } from "@/contexts/WebsiteStatusContext";

export interface WorkspaceSettings {
  theme?: "light" | "dark" | "system";
  timezone?: string;
  language?: string;
  default_analysis_frequency?: "daily" | "weekly" | "bi-weekly" | "monthly";
  notifications?: {
    email?: boolean;
    push?: boolean;
    weekly_reports?: boolean;
  };
  integrations?: {
    slack?: { webhook_url?: string; enabled?: boolean };
    discord?: { webhook_url?: string; enabled?: boolean };
  };
  [key: string]: unknown; // Allow additional settings
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string | null;
  subscription_tier: SubscriptionTier | null;
  credits_remaining: number | null;
  credits_reset_at: string | null;
  settings: WorkspaceSettings | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Website {
  id: string;
  workspace_id: string;
  domain: string;
  display_name: string;
  crawl_status: string | null;
  last_crawled_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  websites: Website[] | null;
  deleteWebsite: (websiteId: string) => Promise<void>;
  refetchWebsites: () => Promise<void>;
  createWorkspace: (
    name: string,
    subscriptionTier: SubscriptionTier,
    creditLimit?: number
  ) => Promise<void>;
  updateWorkspace: (
    workspaceId: string,
    updates: Partial<Workspace>
  ) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refetchWorkspaces: () => Promise<void>;
  // Add listeners for workspace changes
  onWorkspaceChange: (
    callback: (workspace: Workspace | null) => void
  ) => () => void;
  // State validation
  isWorkspaceStateValid: () => boolean;
  // Real-time website status functions
  addWebsiteToMonitoring: (websiteId: string) => Promise<void>;
  removeWebsiteFromMonitoring: (websiteId: string) => void;
  getWebsiteStatusSubscriptionInfo: () => {
    isConnected: boolean;
    connectionStatus: boolean;
    websiteCount: number;
  } | null;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { state: appState, setWebsites: setAppStateWebsites } = useAppState();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // ELIMINATED: No more local websites state - use AppStateContext as single source of truth
  // const [websites, setWebsites] = useState<Website[]>([]);
  
  // Get websites directly from AppStateContext (single source of truth)
  // Include a status hash to force re-render when any website status changes
  const websites = useMemo(() => {
    if (!currentWorkspace?.id) return [];
    const filteredWebsites = appState.workspace.websites.filter(w => w.workspace_id === currentWorkspace.id);
    
    
    return filteredWebsites;
  }, [
    appState.workspace.websites, 
    currentWorkspace?.id,
    // Add status hash to trigger re-renders when status changes
    appState.workspace.websites.map(w => `${w.id}:${w.crawl_status}:${w.updated_at}`).join('|')
  ]);
  const [loading, setLoading] = useState(true);
  
  // Add intelligent caching for websites
  const websitesCache = useRef<{
    data: Website[];
    timestamp: number;
    workspaceId: string;
  } | null>(null);
  const WEBSITES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // UNIFIED: Use WebsiteStatusContext for all real-time status management
  const websiteStatusContext = useWebsiteStatusContext();

  // Workspace change listeners
  const workspaceChangeListeners = useRef<
    Set<(workspace: Workspace | null) => void>
  >(new Set());

  // State to track workspace changes for event broadcasting
  const [workspaceForEvent, setWorkspaceForEvent] = useState<Workspace | null>(null);

  // Function to notify all listeners about workspace changes (without event dispatch)
  const notifyWorkspaceChange = useCallback((workspace: Workspace | null) => {
    workspaceChangeListeners.current.forEach((listener) => listener(workspace));

    // Set workspace for event broadcasting (will be handled by useEffect)
    setWorkspaceForEvent(workspace);
  }, []);

  // useEffect to dispatch workspace change events asynchronously (after render)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("workspaceChange", {
          detail: { workspaceId: workspaceForEvent?.id || null },
        })
      );
    }
  }, [workspaceForEvent]);

  // Custom setCurrentWorkspace that notifies listeners
  const setCurrentWorkspaceWithNotification = useCallback(
    (
      workspace:
        | Workspace
        | null
        | ((prev: Workspace | null) => Workspace | null)
    ) => {
      if (typeof workspace === "function") {
        setCurrentWorkspace((prevWorkspace) => {
          const newWorkspace = workspace(prevWorkspace);
          notifyWorkspaceChange(newWorkspace);
          return newWorkspace;
        });
      } else {
        setCurrentWorkspace(workspace);
        notifyWorkspaceChange(workspace);
      }
    },
    [notifyWorkspaceChange]
  );

  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("workspaces")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const workspaceData = (data || []).map((w) => ({
        ...w,
        subscription_tier: isValidSubscriptionTier(w.subscription_tier)
          ? w.subscription_tier
          : null,
        settings: (w.settings ?? null) as WorkspaceSettings | null,
      }));

      setWorkspaces((prev) => {
        // Use a more efficient comparison - check length and IDs first
        if (prev.length !== workspaceData.length) {
          return workspaceData;
        }

        // Compare IDs and updated_at timestamps for efficient change detection
        const hasChanges = prev.some((prevWorkspace, index) => {
          const newWorkspace = workspaceData[index];
          return (
            !newWorkspace ||
            prevWorkspace.id !== newWorkspace.id ||
            prevWorkspace.updated_at !== newWorkspace.updated_at
          );
        });

        return hasChanges ? workspaceData : prev;
      });

      // Set current workspace to the first one if none is selected and workspaces exist
      setCurrentWorkspaceWithNotification((prevWorkspace) => {
        if (workspaceData.length > 0 && !prevWorkspace) {
          return workspaceData[0] ?? null;
        } else if (workspaceData.length === 0) {
          // Ensure currentWorkspace is null when no workspaces exist
          return null;
        }

        // Validate that current workspace still exists
        if (
          prevWorkspace &&
          !workspaceData.find((w) => w.id === prevWorkspace.id)
        ) {
          return workspaceData.length > 0 ? workspaceData[0] ?? null : null;
        }

        return prevWorkspace;
      });
    } catch (error) {
      // Error fetching workspaces
      setWorkspaces([]);
      setCurrentWorkspaceWithNotification(null);
      toast({
        title: "Error",
        description: "Failed to fetch workspaces. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast, setCurrentWorkspaceWithNotification]);

  const createWorkspace = useCallback(
    async (
      name: string,
      subscriptionTier: SubscriptionTier,
      creditLimit?: number
    ) => {
      if (!user?.id) {
        const error = new Error("User not authenticated");
        toast({
          title: "Error",
          description: "You must be logged in to create a workspace",
          variant: "destructive",
        });
        throw error;
      }

      // Validate input parameters
      if (!name.trim()) {
        const error = new Error("Workspace name is required");
        toast({
          title: "Error",
          description: "Workspace name cannot be empty",
          variant: "destructive",
        });
        throw error;
      }

      try {
        const { data, error } = await supabase
          .schema("beekon_data")
          .from("workspaces")
          .insert({
            name: name.trim(),
            owner_id: user.id,
            subscription_tier: subscriptionTier,
            credits_remaining:
              creditLimit || getDefaultCredits(subscriptionTier),
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Database error: ${error.message}`);
        }

        if (!data) {
          throw new Error("No data returned from workspace creation");
        }

        const newWorkspace: Workspace = {
          ...data,
          subscription_tier: isValidSubscriptionTier(data.subscription_tier)
            ? data.subscription_tier
            : null,
          settings: (data.settings ?? null) as WorkspaceSettings | null,
        };

        // Update workspaces list
        setWorkspaces((prev) => [...prev, newWorkspace]);

        // Set as current workspace (always for new workspaces to ensure immediate availability)
        setCurrentWorkspaceWithNotification(newWorkspace);

        toast({
          title: "Success",
          description: `Workspace "${name}" created successfully`,
        });

        // Return void to match interface expectation
        return;
      } catch (error) {
        // Error creating workspace
        const errorMessage =
          error instanceof Error ? error.message : "Failed to create workspace";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        throw error;
      }
    },
    [user?.id, toast, setCurrentWorkspaceWithNotification]
  );

  const updateWorkspace = useCallback(
    async (workspaceId: string, updates: Partial<Workspace>) => {
      try {
        // Ensure settings is serializable to JSON or null
        const updatesForSupabase = {
          ...updates,
          settings:
            updates.settings === undefined
              ? undefined
              : updates.settings === null
              ? null
              : JSON.parse(JSON.stringify(updates.settings)),
        };

        const { data, error } = await supabase
          .schema("beekon_data")
          .from("workspaces")
          .update(updatesForSupabase)
          .eq("id", workspaceId)
          .select()
          .single();

        if (error) throw error;

        const updatedWorkspace = data;
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id === workspaceId
              ? {
                  ...updatedWorkspace,
                  subscription_tier: isValidSubscriptionTier(
                    updatedWorkspace.subscription_tier
                  )
                    ? updatedWorkspace.subscription_tier
                    : null,
                  settings: (updatedWorkspace.settings ??
                    null) as WorkspaceSettings | null,
                }
              : w
          )
        );

        if (currentWorkspace?.id === workspaceId) {
          setCurrentWorkspaceWithNotification({
            ...updatedWorkspace,
            subscription_tier: isValidSubscriptionTier(
              updatedWorkspace.subscription_tier
            )
              ? updatedWorkspace.subscription_tier
              : null,
            settings: (updatedWorkspace.settings ??
              null) as WorkspaceSettings | null,
          });
        }

        toast({
          title: "Success",
          description: "Workspace updated successfully",
        });
      } catch (error) {
        // Error updating workspace
        toast({
          title: "Error",
          description: "Failed to update workspace",
          variant: "destructive",
        });
        throw error;
      }
    },
    [currentWorkspace?.id, toast, setCurrentWorkspaceWithNotification]
  );

  const invalidateWebsitesCache = useCallback(() => {
    websitesCache.current = null;
  }, []);

  // Sync websites to AppStateContext to ensure real-time updates work
  const syncWebsitesToAppState = useCallback((websiteData: Website[]) => {
    try {
      setAppStateWebsites(websiteData);
    } catch (error) {
      // Error syncing websites to AppStateContext - handled silently
    }
  }, [setAppStateWebsites]);

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const { error } = await supabase
          .schema("beekon_data")
          .from("workspaces")
          .delete()
          .eq("id", workspaceId);

        if (error) throw error;

        // Update workspaces and handle current workspace selection in one operation
        setWorkspaces((prev) => {
          const remainingWorkspaces = prev.filter((w) => w.id !== workspaceId);

          // If the deleted workspace was the current one, select a new one
          if (currentWorkspace?.id === workspaceId) {
            setCurrentWorkspaceWithNotification(
              remainingWorkspaces.length > 0
                ? (remainingWorkspaces[0] as Workspace)
                : null
            );
          }

          return remainingWorkspaces;
        });

        toast({
          title: "Success",
          description: "Workspace deleted successfully",
        });
      } catch (error) {
        // Error deleting workspace
        toast({
          title: "Error",
          description: "Failed to delete workspace",
          variant: "destructive",
        });
        throw error;
      }
    },
    [currentWorkspace?.id, toast, setCurrentWorkspaceWithNotification]
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        // Clear websites cache when switching workspaces to ensure fresh data
        invalidateWebsitesCache();
        setCurrentWorkspaceWithNotification(workspace);
        toast({
          title: "Success",
          description: `Switched to workspace "${workspace.name}"`,
        });
      }
    },
    [workspaces, toast, setCurrentWorkspaceWithNotification, invalidateWebsitesCache]
  );

  const refetchWorkspaces = useCallback(async () => {
    setLoading(true);
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const fetchWebsites = useCallback(async (forceRefresh = false) => {
    if (!user?.id || !currentWorkspace?.id) {
      setLoading(false);
      return;
    }

    // Check cache first
    const now = Date.now();
    const cache = websitesCache.current;
    
    if (!forceRefresh && cache && 
        cache.workspaceId === currentWorkspace.id && 
        (now - cache.timestamp) < WEBSITES_CACHE_DURATION) {
      // UNIFIED: Use cached data by syncing to AppStateContext
      syncWebsitesToAppState(cache.data);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("websites")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const websiteData = (data || []).map((w) => ({
        ...w,
        workspace_id: w.workspace_id ?? "",
        display_name: w.display_name ?? "",
        crawl_status: w.crawl_status ?? null,
        last_crawled_at: w.last_crawled_at ?? "",
        is_active: w.is_active ?? false,
        created_at: w.created_at ?? "",
        updated_at: w.updated_at ?? "",
      }));

      // Update cache
      websitesCache.current = {
        data: websiteData,
        timestamp: now,
        workspaceId: currentWorkspace.id,
      };

      // UNIFIED: Always sync fresh data to AppStateContext (single source of truth)  
      syncWebsitesToAppState(websiteData);
    } catch (error) {
      // Error fetching websites - sync empty array to AppStateContext
      syncWebsitesToAppState([]);
      toast({
        title: "Error",
        description: "Failed to fetch websites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentWorkspace?.id, toast, WEBSITES_CACHE_DURATION, syncWebsitesToAppState]);

  // State validation function to ensure workspace consistency
  const validateWorkspaceState = useCallback(() => {
    // Ensure currentWorkspace exists in workspaces array
    if (
      currentWorkspace &&
      !workspaces.find((w) => w.id === currentWorkspace.id)
    ) {
      // Current workspace is not in the list, reset it
      setCurrentWorkspaceWithNotification(
        workspaces.length > 0 ? workspaces[0] ?? null : null
      );
      return false;
    }

    // Ensure we have a current workspace if workspaces exist
    if (workspaces.length > 0 && !currentWorkspace) {
      const firstWorkspace = workspaces[0];
      if (firstWorkspace) {
        setCurrentWorkspaceWithNotification(firstWorkspace);
      }
      return false;
    }

    return true;
  }, [currentWorkspace, workspaces, setCurrentWorkspaceWithNotification]);

  const deleteWebsite = useCallback(
    async (websiteId: string) => {
      if (!user?.id || !currentWorkspace?.id) {
        setLoading(false);
        return;
      }

      try {
        const { error } = await supabase
          .schema("beekon_data")
          .from("websites")
          .delete()
          .eq("id", websiteId)
          .eq("workspace_id", currentWorkspace?.id);

        if (error) throw error;
        
        // UNIFIED: Invalidate cache and update AppStateContext
        invalidateWebsitesCache();
        // Force refetch to update AppStateContext with current state
        fetchWebsites(true);
      } catch (error) {
        // Website deletion failed, but we can ignore the error
        // The UI will refresh and show the actual state
      }
    },
    [user?.id, currentWorkspace?.id, invalidateWebsitesCache]
  );

  useEffect(() => {
    if (user?.id) {
      fetchWorkspaces();
    } else {
      setCurrentWorkspaceWithNotification(null);
      setWorkspaces([]);
      syncWebsitesToAppState([]); // Clear websites from AppStateContext
      setLoading(false);
    }
  }, [user?.id, fetchWorkspaces, setCurrentWorkspaceWithNotification]);

  // SMART CACHE STRATEGY: Cache only for initial loads, real-time updates bypass all caches
  // The WebsiteStatusProvider handles all real-time updates directly to AppStateContext
  // No need for custom event handlers - unified context manages everything

  // UNIFIED: Set up real-time subscription and fetch initial data when workspace changes
  useEffect(() => {
    if (user?.id && currentWorkspace?.id) {
      // Fetch initial websites and sync to AppStateContext
      fetchWebsites().then(() => {
        // Set up real-time subscription for the current workspace
        const websiteIds = websites.map(w => w.id);
        if (websiteIds.length > 0) {
          websiteStatusContext.subscribeToWorkspace(currentWorkspace.id, websiteIds);
        }
      });
    } else {
      // Clean up subscription when no workspace
      if (currentWorkspace?.id) {
        websiteStatusContext.unsubscribeFromWorkspace(currentWorkspace.id);
      }
    }
  }, [user?.id, currentWorkspace?.id, fetchWebsites, websites, websiteStatusContext]);

  // Clean up subscriptions on unmount or workspace change
  const prevWorkspaceId = useRef<string | null>(null);
  useEffect(() => {
    const previousId = prevWorkspaceId.current;
    const currentId = currentWorkspace?.id || null;
    
    if (previousId && previousId !== currentId) {
      websiteStatusContext.unsubscribeFromWorkspace(previousId);
    }
    
    prevWorkspaceId.current = currentId;
  }, [currentWorkspace?.id, websiteStatusContext]);

  // Validate workspace state periodically and after any state changes
  useEffect(() => {
    if (!loading && workspaces.length > 0) {
      const timeoutId = setTimeout(() => {
        validateWorkspaceState();
      }, 100); // Small delay to allow state settling

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [workspaces, currentWorkspace, loading, validateWorkspaceState]);

  // ELIMINATED: No longer need complex status hash - AppStateContext is single source of truth
  // Direct consumption of websites from AppStateContext via useMemo above eliminates sync complexity

  // ELIMINATED: Complex sync logic no longer needed
  // websites = useMemo() above automatically updates when AppStateContext changes
  // Real-time updates flow directly: Database → WebsiteStatusProvider → AppStateContext → websites (useMemo)

  const refetchWebsites = useCallback(async () => {
    setLoading(true);
    await fetchWebsites(true); // Force refresh to bypass cache
  }, [fetchWebsites]);

  // Add listener registration function
  const onWorkspaceChange = useCallback(
    (callback: (workspace: Workspace | null) => void) => {
      workspaceChangeListeners.current.add(callback);

      // Return cleanup function
      return () => {
        workspaceChangeListeners.current.delete(callback);
      };
    },
    []
  );

  // Expose validation function for external use
  const isWorkspaceStateValid = useCallback(() => {
    return validateWorkspaceState();
  }, [validateWorkspaceState]);

  // UNIFIED: Website status monitoring functions using WebsiteStatusContext
  const addWebsiteToMonitoring = useCallback(async (websiteId: string) => {
    if (currentWorkspace?.id) {
      // Re-subscribe with updated website list including the new website
      const updatedWebsiteIds = [...websites.map(w => w.id), websiteId];
      await websiteStatusContext.subscribeToWorkspace(currentWorkspace.id, updatedWebsiteIds);
    }
  }, [currentWorkspace?.id, websites, websiteStatusContext]);

  const removeWebsiteFromMonitoring = useCallback(async (websiteId: string) => {
    if (currentWorkspace?.id) {
      // Re-subscribe with updated website list excluding the removed website
      const updatedWebsiteIds = websites.filter(w => w.id !== websiteId).map(w => w.id);
      if (updatedWebsiteIds.length > 0) {
        await websiteStatusContext.subscribeToWorkspace(currentWorkspace.id, updatedWebsiteIds);
      } else {
        await websiteStatusContext.unsubscribeFromWorkspace(currentWorkspace.id);
      }
    }
  }, [currentWorkspace?.id, websites, websiteStatusContext]);

  const getWebsiteStatusSubscriptionInfo = useCallback(() => {
    if (currentWorkspace?.id) {
      return {
        isConnected: websiteStatusContext.isConnected,
        connectionStatus: websiteStatusContext.connectionStatus[currentWorkspace.id] || false,
        websiteCount: websites.length
      };
    }
    return null;
  }, [currentWorkspace?.id, websiteStatusContext, websites]);

  const value = {
    currentWorkspace,
    workspaces,
    loading,
    websites,
    deleteWebsite,
    refetchWebsites,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    switchWorkspace,
    refetchWorkspaces,
    onWorkspaceChange,
    isWorkspaceStateValid,
    addWebsiteToMonitoring,
    removeWebsiteFromMonitoring,
    getWebsiteStatusSubscriptionInfo,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};

// Helper function to get default credits based on subscription tier
function getDefaultCredits(tier: SubscriptionTier): number {
  switch (tier) {
    case "free":
      return 5;
    case "starter":
      return 50;
    case "professional":
      return 1000;
    case "enterprise":
      return 10000;
    default:
      return 5;
  }
}
