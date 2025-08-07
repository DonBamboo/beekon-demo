import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type SubscriptionTier =
  | "free"
  | "starter"
  | "professional"
  | "enterprise";

// Type guard for SubscriptionTier
export function isValidSubscriptionTier(value: any): value is SubscriptionTier {
  return (
    typeof value === "string" &&
    ["free", "starter", "professional", "enterprise"].includes(value)
  );
}

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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);

  // Workspace change listeners
  const workspaceChangeListeners = useRef<
    Set<(workspace: Workspace | null) => void>
  >(new Set());

  // Function to notify all listeners about workspace changes
  const notifyWorkspaceChange = useCallback((workspace: Workspace | null) => {
    workspaceChangeListeners.current.forEach((listener) => listener(workspace));

    // Also dispatch a custom event for useAuth to listen to
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("workspaceChange", {
          detail: { workspaceId: workspace?.id || null },
        })
      );
    }
  }, []);

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
  }, [user?.id, toast]);

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

        // Return the created workspace for external use
        return newWorkspace;
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
    [currentWorkspace?.id, toast]
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
    [currentWorkspace?.id, toast]
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        setCurrentWorkspaceWithNotification(workspace);
        toast({
          title: "Success",
          description: `Switched to workspace "${workspace.name}"`,
        });
      }
    },
    [workspaces, toast, setCurrentWorkspaceWithNotification]
  );

  const refetchWorkspaces = useCallback(async () => {
    setLoading(true);
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  const fetchWebsites = useCallback(async () => {
    if (!user?.id || !currentWorkspace?.id) {
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

      setWebsites((prev) => {
        // Use a more efficient comparison - check length and IDs first
        if (prev.length !== websiteData.length) {
          return websiteData;
        }

        // Compare IDs and updated_at timestamps for efficient change detection
        const hasChanges = prev.some((prevWebsite, index) => {
          const newWebsite = websiteData[index];
          return (
            !newWebsite ||
            prevWebsite.id !== newWebsite.id ||
            prevWebsite.updated_at !== newWebsite.updated_at
          );
        });

        return hasChanges ? websiteData : prev;
      });
    } catch (error) {
      // Error fetching websites
      setWebsites([]);
      toast({
        title: "Error",
        description: "Failed to fetch websites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, currentWorkspace?.id, toast]);

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
      setCurrentWorkspaceWithNotification(workspaces[0]);
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
        setWebsites((prev) => prev.filter((w) => w.id !== websiteId));
      } catch (error) {
        // Website deletion failed, but we can ignore the error
        // The UI will refresh and show the actual state
      }
    },
    [user?.id, currentWorkspace?.id]
  );

  useEffect(() => {
    if (user?.id) {
      fetchWorkspaces();
    } else {
      setCurrentWorkspaceWithNotification(null);
      setWorkspaces([]);
      setWebsites([]);
      setLoading(false);
    }
  }, [user?.id, fetchWorkspaces, setCurrentWorkspaceWithNotification]);

  // Separate effect for fetching websites when workspace changes
  useEffect(() => {
    if (user?.id && currentWorkspace?.id) {
      fetchWebsites();
    } else {
      setWebsites([]);
    }
  }, [user?.id, currentWorkspace?.id, fetchWebsites]);

  // Validate workspace state periodically and after any state changes
  useEffect(() => {
    if (!loading && workspaces.length > 0) {
      const timeoutId = setTimeout(() => {
        validateWorkspaceState();
      }, 100); // Small delay to allow state settling

      return () => clearTimeout(timeoutId);
    }
  }, [workspaces, currentWorkspace, loading, validateWorkspaceState]);

  const refetchWebsites = useCallback(async () => {
    setLoading(true);
    await fetchWebsites();
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
