import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "./LoadingStates";
import { WorkspaceDropdown } from "./WorkspaceDropdown";

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

  // Show loading while authentication or workspace data is loading
  if (authLoading || workspaceLoading) {
    return fallback || (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
        <span className="ml-2">Loading workspace...</span>
      </div>
    );
  }

  // User must be authenticated
  if (!user) {
    return fallback || null;
  }

  // Check if workspace state is valid
  if (requireWorkspace && !isWorkspaceStateValid()) {
    return fallback || (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <p className="text-muted-foreground">
          Workspace state is being synchronized...
        </p>
        <Spinner size="md" />
      </div>
    );
  }

  // If workspace is required but none exists, show workspace creation prompt
  if (requireWorkspace && workspaces.length === 0) {
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
  if (requireWorkspace && !currentWorkspace) {
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