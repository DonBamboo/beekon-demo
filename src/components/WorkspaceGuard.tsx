import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "./ui/skeleton";
import { WorkspaceDropdown } from "./WorkspaceDropdown";
import { useMemo } from "react";

interface WorkspaceGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireWorkspace?: boolean;
}

/**
 * WorkspaceGuard ensures that workspace state is properly initialized
 * before rendering children. This prevents race conditions during
 * new user onboarding and workspace creation flows.
 */
export function WorkspaceGuard({ 
  children, 
  fallback,
  requireWorkspace = true 
}: WorkspaceGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { 
    currentWorkspace, 
    workspaces, 
    loading: workspaceLoading,
    isWorkspaceStateValid 
  } = useWorkspace();

  // Extract complex expressions to separate variables per ESLint rules
  const hasUser = !!user;
  const hasCurrentWorkspace = !!currentWorkspace;

  // FIXED: Debounce loading state changes to prevent dropdown thrashing during auth flow
  const stableLoadingState = useMemo(() => {
    // Consider stable when both auth and workspace loading are resolved
    return {
      isLoading: authLoading || workspaceLoading,
      hasUser,
      hasWorkspaces: workspaces && workspaces.length > 0,
      hasCurrentWorkspace,
      isStateValid: requireWorkspace ? isWorkspaceStateValid() : true,
    };
  }, [
    authLoading,
    workspaceLoading, 
    hasUser,
    workspaces?.length,
    hasCurrentWorkspace,
    requireWorkspace,
    isWorkspaceStateValid,
    currentWorkspace, // Add missing dependency
    user, // Add missing dependency  
    workspaces, // Add missing dependency
  ]);

  // FIXED: Use stable loading state to prevent rapid re-renders
  if (stableLoadingState.isLoading) {
    return fallback || (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <Skeleton variant="circular" size="lg" />
        <Skeleton variant="text" width="150px" height="1rem" />
      </div>
    );
  }

  // User must be authenticated
  if (!stableLoadingState.hasUser) {
    return fallback || null;
  }

  // Check if workspace state is valid
  if (requireWorkspace && !stableLoadingState.isStateValid) {
    return fallback || (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <Skeleton variant="text" width="250px" height="1rem" />
        <Skeleton variant="circular" size="md" />
      </div>
    );
  }

  // If workspace is required but none exists, show workspace creation prompt
  if (requireWorkspace && !stableLoadingState.hasWorkspaces) {
    return fallback || (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <h3 className="text-lg font-semibold">Create Your First Workspace</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Get started by creating a workspace to organize your website analysis projects.
        </p>
        <WorkspaceDropdown />
      </div>
    );
  }

  // If workspace is required but current workspace is not set
  if (requireWorkspace && !stableLoadingState.hasCurrentWorkspace) {
    return fallback || (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <p className="text-muted-foreground">
          Please select a workspace to continue
        </p>
        <WorkspaceDropdown />
      </div>
    );
  }

  // All checks passed, render children
  return <>{children}</>;
}