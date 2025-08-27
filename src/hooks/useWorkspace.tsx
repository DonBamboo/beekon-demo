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

  // FIXED: Use refs to stabilize callbacks and prevent infinite loops
  const setAppStateWebsitesRef = useRef(setAppStateWebsites);
  const toastRef = useRef(toast);

  // FIXED: Add initialization sequence tracking to prevent race conditions
  const initializationStateRef = useRef<{
    userLoaded: boolean;
    workspacesLoaded: boolean;
    websitesLoaded: boolean;
    currentPhase: "auth" | "workspaces" | "websites" | "complete";
  }>({
    userLoaded: false,
    workspacesLoaded: false,
    websitesLoaded: false,
    currentPhase: "auth",
  });

  useEffect(() => {
    setAppStateWebsitesRef.current = setAppStateWebsites;
    toastRef.current = toast;
  }, [setAppStateWebsites, toast]);
  // const [websites, setWebsites] = useState<Website[]>([]);

  // Get websites directly from AppStateContext (single source of truth)
  // Include a status hash to force re-render when any website status changes
  // FIXED: Deep stabilization using useRef and custom comparison to prevent infinite loops
  const websitesRef = useRef<Website[]>([]);
  const websites = useMemo(() => {
    if (!currentWorkspace?.id) return [];

    const filteredWebsites = appState.workspace.websites.filter(
      (w) => w.workspace_id === currentWorkspace.id
    );

    // Custom deep comparison to prevent unnecessary recreations
    const hasChanged =
      websitesRef.current.length !== filteredWebsites.length ||
      websitesRef.current.some((prev, index) => {
        const current = filteredWebsites[index];
        return (
          !current ||
          prev.id !== current.id ||
          prev.domain !== current.domain ||
          prev.display_name !== current.display_name ||
          prev.is_active !== current.is_active
        );
      });

    if (hasChanged) {
      websitesRef.current = filteredWebsites;
      return filteredWebsites;
    }

    // Return previous reference if no meaningful changes (status updates don't matter for UI stability)
    return websitesRef.current;
  }, [
    currentWorkspace?.id,
    appState.workspace.websites, // Include full array as ESLint requires it
    // Deep comparison logic above prevents unnecessary recreations
  ]);
  const [loading, setLoading] = useState(true);

  // FIXED: Add loading state debouncing to prevent rapid state thrashing
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // FIXED: Add development mode safeguards for infinite loop detection
  const loadingChangeCountRef = useRef(0);
  const loadingChangeTimestampRef = useRef(Date.now());
  
  // FIXED: Add validation guards to prevent concurrent validations and unnecessary runs
  const isValidatingRef = useRef(false);
  const isInitializingRef = useRef(false);
  
  // FIXED: Add guard to prevent concurrent fetchWebsites calls from useEffect
  const isFetchingWebsitesFromEffectRef = useRef(false);
  const lastWorkspaceIdProcessedRef = useRef<string | null>(null);

  // FIXED: Convert setLoadingDebounced to stable ref pattern to break circular dependencies
  const setLoadingDebouncedRef =
    useRef<(newLoading: boolean, immediate?: boolean) => void>();

  // Initialize the debounced loading setter - this ref never changes
  useEffect(() => {
    setLoadingDebouncedRef.current = (
      newLoading: boolean,
      immediate = false
    ) => {
      // Clear any pending loading state change
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }

      // FIXED: Development mode safeguards - detect excessive loading state changes
      if (import.meta.env.DEV) {
        const now = Date.now();
        const timeSinceLastChange = now - loadingChangeTimestampRef.current;

        // Reset counter if it's been more than 5 seconds since last change
        if (timeSinceLastChange > 5000) {
          loadingChangeCountRef.current = 0;
        }

        loadingChangeCountRef.current += 1;
        loadingChangeTimestampRef.current = now;

        // Warn if we have excessive loading state changes (potential infinite loop)
        if (loadingChangeCountRef.current > 20) {
          console.warn(
            "[useWorkspace] Excessive loading state changes detected (potential infinite loop)",
            {
              changeCount: loadingChangeCountRef.current,
              newLoading,
              immediate,
              timeSinceLastChange,
            }
          );
        }
      }

      if (immediate || isInitialLoadRef.current) {
        // Immediate updates for initial load or critical state changes
        setLoading(newLoading);
        if (newLoading === false) {
          isInitialLoadRef.current = false;
        }
      } else {
        // Debounce rapid loading state changes to prevent dropdown thrashing
        loadingTimeoutRef.current = setTimeout(() => {
          setLoading(newLoading);
          loadingTimeoutRef.current = null;
        }, 50);
      }
    };
  }, []); // Empty deps - truly stable function

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
  const [workspaceForEvent, setWorkspaceForEvent] = useState<Workspace | null>(
    null
  );

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

  // FIXED: Create stable ref for setCurrentWorkspaceWithNotification to break validateWorkspaceState dependency cycles
  const setCurrentWorkspaceWithNotificationRef = useRef(setCurrentWorkspaceWithNotification);
  useEffect(() => {
    setCurrentWorkspaceWithNotificationRef.current = setCurrentWorkspaceWithNotification;
  }, [setCurrentWorkspaceWithNotification]);

  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) {
      // Reset initialization state when no user
      initializationStateRef.current = {
        userLoaded: false,
        workspacesLoaded: false,
        websitesLoaded: false,
        currentPhase: "auth",
      };
      setLoadingDebouncedRef.current!(false, true); // Immediate for critical auth state
      return;
    }

    // FIXED: Update initialization phase and set guard to prevent validation during fetch
    initializationStateRef.current.currentPhase = "workspaces";
    isInitializingRef.current = true;

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
      toastRef.current({
        title: "Error",
        description: "Failed to fetch workspaces. Please try again.",
        variant: "destructive",
      });
    } finally {
      // FIXED: Mark workspaces as loaded and update phase
      initializationStateRef.current.workspacesLoaded = true;
      initializationStateRef.current.currentPhase = "websites";
      setLoadingDebouncedRef.current!(false); // Debounced for operation completion
      
      // GUARD: Clear initialization flag when fetchWorkspaces completes (success or failure)
      isInitializingRef.current = false;
    }
  }, [user?.id, setCurrentWorkspaceWithNotification]); // Removed setLoadingDebounced - now stable ref

  const createWorkspace = useCallback(
    async (
      name: string,
      subscriptionTier: SubscriptionTier,
      creditLimit?: number
    ) => {
      if (!user?.id) {
        const error = new Error("User not authenticated");
        toastRef.current({
          title: "Error",
          description: "You must be logged in to create a workspace",
          variant: "destructive",
        });
        throw error;
      }

      // Validate input parameters
      if (!name.trim()) {
        const error = new Error("Workspace name is required");
        toastRef.current({
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

        toastRef.current({
          title: "Success",
          description: `Workspace "${name}" created successfully`,
        });

        // Return void to match interface expectation
        return;
      } catch (error) {
        // Error creating workspace
        const errorMessage =
          error instanceof Error ? error.message : "Failed to create workspace";
        toastRef.current({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        throw error;
      }
    },
    [user?.id, setCurrentWorkspaceWithNotification]
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

        toastRef.current({
          title: "Success",
          description: "Workspace updated successfully",
        });
      } catch (error) {
        // Error updating workspace
        toastRef.current({
          title: "Error",
          description: "Failed to update workspace",
          variant: "destructive",
        });
        throw error;
      }
    },
    [currentWorkspace?.id, setCurrentWorkspaceWithNotification]
  );

  const invalidateWebsitesCache = useCallback(() => {
    websitesCache.current = null;
  }, []);

  // Sync websites to AppStateContext to ensure real-time updates work
  // FIXED: Use ref to avoid infinite loops from unstable setAppStateWebsites
  const syncWebsitesToAppState = useCallback(
    (websiteData: Website[]) => {
      try {
        setAppStateWebsitesRef.current(websiteData);
      } catch (error) {
        // Error syncing websites to AppStateContext - handled silently
      }
    },
    [] // No dependencies needed - ref is always stable
  );

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

        toastRef.current({
          title: "Success",
          description: "Workspace deleted successfully",
        });
      } catch (error) {
        // Error deleting workspace
        toastRef.current({
          title: "Error",
          description: "Failed to delete workspace",
          variant: "destructive",
        });
        throw error;
      }
    },
    [currentWorkspace?.id, setCurrentWorkspaceWithNotification]
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        // Clear websites cache when switching workspaces to ensure fresh data
        invalidateWebsitesCache();
        setCurrentWorkspaceWithNotification(workspace);
        toastRef.current({
          title: "Success",
          description: `Switched to workspace "${workspace.name}"`,
        });
      }
    },
    [workspaces, setCurrentWorkspaceWithNotification, invalidateWebsitesCache]
  );

  const refetchWorkspaces = useCallback(async () => {
    setLoadingDebouncedRef.current!(true, true); // Immediate for user-initiated action
    await fetchWorkspaces();
  }, [fetchWorkspaces]); // Removed setLoadingDebounced - now stable ref

  const fetchWebsites = useCallback(
    async (forceRefresh = false) => {
      if (!user?.id || !currentWorkspace?.id) {
        setLoadingDebouncedRef.current!(false); // Debounced for guard condition
        return;
      }

      // FIXED: Only proceed if workspaces are loaded (proper sequencing)
      if (!forceRefresh && !initializationStateRef.current.workspacesLoaded) {
        return;
      }

      // FIXED: Update initialization phase and set guard
      initializationStateRef.current.currentPhase = "websites";
      isInitializingRef.current = true;

      // Check cache first
      const now = Date.now();
      const cache = websitesCache.current;

      if (
        !forceRefresh &&
        cache &&
        cache.workspaceId === currentWorkspace.id &&
        now - cache.timestamp < WEBSITES_CACHE_DURATION
      ) {
        // UNIFIED: Use cached data by syncing to AppStateContext
        syncWebsitesToAppState(cache.data);
        setLoadingDebouncedRef.current!(false); // Debounced for cached data
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
        toastRef.current({
          title: "Error",
          description: "Failed to fetch websites. Please try again.",
          variant: "destructive",
        });
      } finally {
        // FIXED: Mark websites as loaded and complete initialization
        initializationStateRef.current.websitesLoaded = true;
        initializationStateRef.current.currentPhase = "complete";
        setLoadingDebouncedRef.current!(false); // Debounced for operation completion
        
        // GUARD: Clear initialization flag when fetchWebsites completes (success or failure)
        isInitializingRef.current = false;
      }
    },
    [
      user?.id,
      currentWorkspace?.id,
      syncWebsitesToAppState, // Now stable due to ref pattern
      // setLoadingDebounced removed - now using stable ref pattern
      WEBSITES_CACHE_DURATION, // Constant but ESLint needs it explicitly
    ]
  );

  // FIXED: State validation function with guards to prevent infinite loops
  const validateWorkspaceState = useCallback(() => {
    // GUARD: Skip validation if already validating or during initialization
    if (isValidatingRef.current || isInitializingRef.current) {
      return true; // Skip validation but don't indicate failure
    }

    // GUARD: Set validation lock to prevent concurrent runs
    isValidatingRef.current = true;
    
    try {
      // Ensure currentWorkspace exists in workspaces array
      if (
        currentWorkspace &&
        !workspaces.find((w) => w.id === currentWorkspace.id)
      ) {
        // Current workspace is not in the list, reset it
        setCurrentWorkspaceWithNotificationRef.current(
          workspaces.length > 0 ? workspaces[0] ?? null : null
        );
        return false;
      }

      // Ensure we have a current workspace if workspaces exist
      if (workspaces.length > 0 && !currentWorkspace) {
        const firstWorkspace = workspaces[0];
        if (firstWorkspace) {
          setCurrentWorkspaceWithNotificationRef.current(firstWorkspace);
        }
        return false;
      }

      return true;
    } finally {
      // GUARD: Always release validation lock
      isValidatingRef.current = false;
    }
  }, [currentWorkspace, workspaces]); // FIXED: Removed unstable setCurrentWorkspaceWithNotification - now using ref

  const deleteWebsite = useCallback(
    async (websiteId: string) => {
      if (!user?.id || !currentWorkspace?.id) {
        setLoadingDebouncedRef.current!(false); // Debounced for guard condition
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
    [user?.id, currentWorkspace?.id, invalidateWebsitesCache, fetchWebsites]
  );

  useEffect(() => {
    if (user?.id) {
      // FIXED: Mark user as loaded and start workspace loading phase
      initializationStateRef.current.userLoaded = true;
      initializationStateRef.current.currentPhase = "workspaces";
      fetchWorkspaces();
    } else {
      // FIXED: Reset initialization state for logged out user
      initializationStateRef.current = {
        userLoaded: false,
        workspacesLoaded: false,
        websitesLoaded: false,
        currentPhase: "auth",
      };
      setCurrentWorkspaceWithNotification(null);
      setWorkspaces([]);
      syncWebsitesToAppState([]); // Clear websites from AppStateContext
      setLoadingDebouncedRef.current!(false, true); // Immediate for auth state change
    }
  }, [user?.id, fetchWorkspaces, setCurrentWorkspaceWithNotification]); // Removed setLoadingDebounced - now stable ref

  // Cleanup loading timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, []);

  // SMART CACHE STRATEGY: Cache only for initial loads, real-time updates bypass all caches
  // The WebsiteStatusProvider handles all real-time updates directly to AppStateContext
  // No need for custom event handlers - unified context manages everything

  // FIXED: Break circular dependency using refs to prevent infinite loops
  const fetchWebsitesRef = useRef(fetchWebsites);
  // const websitesRef = useRef(websites);

  // Update refs when values change
  useEffect(() => {
    fetchWebsitesRef.current = fetchWebsites;
  }, [fetchWebsites, syncWebsitesToAppState]);

  useEffect(() => {
    websitesRef.current = websites;
  }, [websites]);

  // FIXED: Set up real-time subscription and fetch initial data when workspace changes
  // Added guards to prevent infinite loop from fetchWebsites triggering state updates
  useEffect(() => {
    if (user?.id && currentWorkspace?.id) {
      // GUARD: Prevent concurrent fetchWebsites calls and duplicate processing
      if (
        isFetchingWebsitesFromEffectRef.current || 
        lastWorkspaceIdProcessedRef.current === currentWorkspace.id
      ) {
        return;
      }
      
      // GUARD: Set flags to prevent re-execution
      isFetchingWebsitesFromEffectRef.current = true;
      lastWorkspaceIdProcessedRef.current = currentWorkspace.id;
      
      // Fetch initial websites and sync to AppStateContext
      fetchWebsitesRef.current().then(() => {
        // Set up real-time subscription for the current workspace
        const websiteIds = websitesRef.current.map((w) => w.id);
        if (websiteIds.length > 0) {
          websiteStatusContext.subscribeToWorkspace(
            currentWorkspace.id,
            websiteIds
          );
        }
      }).finally(() => {
        // GUARD: Always clear the fetching flag when done
        isFetchingWebsitesFromEffectRef.current = false;
      });
    } else {
      // Clean up subscription when no workspace
      if (currentWorkspace?.id) {
        websiteStatusContext.unsubscribeFromWorkspace(currentWorkspace.id);
      }
      
      // GUARD: Reset tracking when no workspace
      lastWorkspaceIdProcessedRef.current = null;
      isFetchingWebsitesFromEffectRef.current = false;
    }
  }, [user?.id, currentWorkspace?.id, websiteStatusContext]); // Removed fetchWebsites and websites from dependencies

  // Clean up subscriptions on unmount or workspace change
  const prevWorkspaceId = useRef<string | null>(null);
  useEffect(() => {
    const previousId = prevWorkspaceId.current;
    const currentId = currentWorkspace?.id || null;

    if (previousId && previousId !== currentId) {
      websiteStatusContext.unsubscribeFromWorkspace(previousId);
      
      // GUARD: Reset workspace tracking when workspace actually changes
      lastWorkspaceIdProcessedRef.current = null;
      isFetchingWebsitesFromEffectRef.current = false;
    }

    prevWorkspaceId.current = currentId;
  }, [currentWorkspace?.id, websiteStatusContext]);

  // Create ref for validateWorkspaceState to break dependency cycle
  const validateWorkspaceStateRef = useRef(validateWorkspaceState);

  // Update ref when function changes
  useEffect(() => {
    validateWorkspaceStateRef.current = validateWorkspaceState;
  }, [validateWorkspaceState]);

  // FIXED: Validate workspace state on meaningful changes, NOT loading changes
  // Removed loading dependency to break infinite loop chain
  useEffect(() => {
    if (workspaces.length > 0) {
      const timeoutId = setTimeout(() => {
        validateWorkspaceStateRef.current();
      }, 100); // Small delay to allow state settling

      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [workspaces, currentWorkspace]); // FIXED: Removed loading - it was causing infinite loop

  // ELIMINATED: No longer need complex status hash - AppStateContext is single source of truth
  // Direct consumption of websites from AppStateContext via useMemo above eliminates sync complexity

  // ELIMINATED: Complex sync logic no longer needed
  // websites = useMemo() above automatically updates when AppStateContext changes
  // Real-time updates flow directly: Database → WebsiteStatusProvider → AppStateContext → websites (useMemo)

  const refetchWebsites = useCallback(async () => {
    setLoadingDebouncedRef.current!(true, true); // Immediate for user-initiated refresh
    await fetchWebsitesRef.current(true); // Use ref to avoid dependency
  }, []); // No dependencies needed - using stable refs

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
  const addWebsiteToMonitoring = useCallback(
    async (websiteId: string) => {
      if (currentWorkspace?.id) {
        // Re-subscribe with updated website list including the new website
        const updatedWebsiteIds = [...websites.map((w) => w.id), websiteId];
        await websiteStatusContext.subscribeToWorkspace(
          currentWorkspace.id,
          updatedWebsiteIds
        );
      }
    },
    [currentWorkspace?.id, websites, websiteStatusContext]
  );

  const removeWebsiteFromMonitoring = useCallback(
    async (websiteId: string) => {
      if (currentWorkspace?.id) {
        // Re-subscribe with updated website list excluding the removed website
        const updatedWebsiteIds = websites
          .filter((w) => w.id !== websiteId)
          .map((w) => w.id);
        if (updatedWebsiteIds.length > 0) {
          await websiteStatusContext.subscribeToWorkspace(
            currentWorkspace.id,
            updatedWebsiteIds
          );
        } else {
          await websiteStatusContext.unsubscribeFromWorkspace(
            currentWorkspace.id
          );
        }
      }
    },
    [currentWorkspace?.id, websites, websiteStatusContext]
  );

  const getWebsiteStatusSubscriptionInfo = useCallback(() => {
    if (currentWorkspace?.id) {
      return {
        isConnected: websiteStatusContext.isConnected,
        connectionStatus:
          websiteStatusContext.connectionStatus[currentWorkspace.id] || false,
        websiteCount: websites.length,
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
