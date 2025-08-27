import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace, Workspace } from "@/hooks/useWorkspace";
import {
  Building,
  ChevronDown,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { WorkspaceModal } from "./WorkspaceModal";

export function WorkspaceDropdown() {
  const {
    currentWorkspace,
    workspaces,
    loading,
    switchWorkspace,
    deleteWorkspace,
  } = useWorkspace();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(
    null
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(
    null
  );

  // FIXED: Memoize stable props to prevent dropdown from re-rendering during loading transitions
  const stableProps = useMemo(() => ({
    hasWorkspaces: workspaces && workspaces.length > 0,
    hasCurrentWorkspace: !!currentWorkspace,
    workspaceCount: workspaces?.length || 0,
    currentWorkspaceName: currentWorkspace?.name || '',
    currentWorkspaceTier: currentWorkspace?.subscription_tier || null,
    currentWorkspaceCredits: currentWorkspace?.credits_remaining || 0,
  }), [
    workspaces?.length, // Only depend on count, not the full array
    currentWorkspace?.id, // Only depend on ID, not full object
    currentWorkspace?.name,
    currentWorkspace?.subscription_tier,
    currentWorkspace?.credits_remaining,
  ]);

  // FIXED: Don't render dropdown during critical loading states to prevent Radix UI thrashing
  const shouldRenderDropdown = useMemo(() => {
    // Don't render dropdowns during initial auth or rapid loading state changes
    return !loading && (stableProps.hasWorkspaces || stableProps.hasCurrentWorkspace);
  }, [loading, stableProps.hasWorkspaces, stableProps.hasCurrentWorkspace]);

  const getTierBadge = (tier: string | null) => {
    if (!tier) return null;

    const tierConfig = {
      free: { label: "Free", color: "bg-gray-500" },
      starter: { label: "Starter", color: "bg-blue-500" },
      professional: { label: "Pro", color: "bg-purple-500" },
      enterprise: { label: "Enterprise", color: "bg-orange-500" },
    };

    const config = tierConfig[tier as keyof typeof tierConfig];
    if (!config) return null;

    return (
      <Badge variant="outline" className="text-xs">
        <div className={`w-2 h-2 rounded-full ${config.color} mr-1`} />
        {config.label}
      </Badge>
    );
  };

  const handleCreateWorkspace = () => {
    setEditingWorkspace(null);
    setIsModalOpen(true);
  };

  const handleEditWorkspace = (workspace: Workspace) => {
    if (!workspace) {
      // Cannot edit null workspace
      return;
    }
    setEditingWorkspace(workspace);
    setIsModalOpen(true);
  };

  const handleDeleteWorkspace = (workspace: Workspace) => {
    if (!workspace) {
      // Cannot delete null workspace
      return;
    }
    setWorkspaceToDelete(workspace);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (workspaceToDelete) {
      await deleteWorkspace(workspaceToDelete.id);
      setShowDeleteConfirm(false);
      setWorkspaceToDelete(null);
    }
  };

  if (loading) {
    return <Skeleton variant="button" size="md" width="120px" />;
  }

  // FIXED: Add guard to prevent rendering dropdown during loading state transitions
  if (!shouldRenderDropdown) {
    return <Skeleton variant="button" size="md" width="120px" />;
  }

  if (!currentWorkspace) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={handleCreateWorkspace}>
          <Plus className="h-4 w-4 mr-2" />
          Create Workspace
        </Button>
        <WorkspaceModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          workspace={editingWorkspace}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 px-3">
            <Building className="h-4 w-4 mr-2" />
            <span className="max-w-[150px] truncate">
              {stableProps.currentWorkspaceName}
            </span>
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>
            <div className="flex items-center justify-between">
              <span>Current Workspace</span>
              {getTierBadge(stableProps.currentWorkspaceTier)}
            </div>
          </DropdownMenuLabel>
          <div className="px-2 py-1 text-sm text-muted-foreground">
            <div className="font-medium">{stableProps.currentWorkspaceName}</div>
            <div className="flex items-center gap-2 mt-1">
              <span>Credits: {stableProps.currentWorkspaceCredits}</span>
            </div>
          </div>
          <DropdownMenuSeparator />

          {stableProps.workspaceCount > 1 && (
            <>
              <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
              {workspaces
                .filter((w) => w.id !== currentWorkspace.id)
                .map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => switchWorkspace(workspace.id)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      <span className="max-w-[150px] truncate">
                        {workspace.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTierBadge(workspace.subscription_tier)}
                    </div>
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={handleCreateWorkspace}>
            <Plus className="h-4 w-4 mr-2" />
            Create New Workspace
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() =>
              currentWorkspace && handleEditWorkspace(currentWorkspace)
            }
            disabled={!currentWorkspace}
          >
            <Settings className="h-4 w-4 mr-2" />
            Workspace Settings
          </DropdownMenuItem>

          {stableProps.workspaceCount > 1 && currentWorkspace && (
            <DropdownMenuItem
              onClick={() => handleDeleteWorkspace(currentWorkspace)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Workspace
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        workspace={editingWorkspace}
      />

      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setWorkspaceToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Workspace"
        description={`Are you sure you want to delete "${workspaceToDelete?.name}"? This will permanently remove all associated websites and analysis data. This action cannot be undone.`}
        confirmText="Delete Workspace"
        variant="destructive"
      />
    </>
  );
}
