import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import {
  SubscriptionTier,
  useWorkspace,
  Workspace,
  isValidSubscriptionTier,
} from "@/hooks/useWorkspace";
import { Building, Plus, Save } from "lucide-react";

const workspaceSchema = z.object({
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(50, "Name must be 50 characters or less"),
  subscriptionTier: z.enum(["free", "starter", "professional", "enterprise"]),
  creditLimit: z.number().min(1, "Credit limit must be at least 1").optional(),
});

type WorkspaceFormData = z.infer<typeof workspaceSchema>;

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace?: Workspace | null;
}

const subscriptionTiers = [
  {
    value: "free",
    label: "Free",
    description: "5 website analyses per month",
    credits: 5,
    color: "bg-gray-500",
  },
  {
    value: "starter",
    label: "Starter",
    description: "50 website analyses per month",
    credits: 50,
    color: "bg-blue-500",
  },
  {
    value: "professional",
    label: "Professional",
    description: "1000 website analyses per month",
    credits: 1000,
    color: "bg-purple-500",
  },
  {
    value: "enterprise",
    label: "Enterprise",
    description: "10000 website analyses per month",
    credits: 10000,
    color: "bg-orange-500",
  },
];

export function WorkspaceModal({
  isOpen,
  onClose,
  workspace,
}: WorkspaceModalProps) {
  const { createWorkspace, updateWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const isEditing = !!workspace;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      name: workspace?.name || "",
      subscriptionTier:
        isValidSubscriptionTier(workspace?.subscription_tier) ? workspace.subscription_tier : "free",
      creditLimit: workspace?.credits_remaining || undefined,
    },
  });

  const selectedTier = watch("subscriptionTier");
  const selectedTierData = subscriptionTiers.find(
    (tier) => tier.value === selectedTier
  );

  const onSubmit = async (data: WorkspaceFormData) => {
    setLoading(true);
    try {
      if (isEditing && workspace) {
        await updateWorkspace(workspace.id, {
          name: data.name,
          subscription_tier: data.subscriptionTier,
          credits_remaining: data.creditLimit || selectedTierData?.credits,
        });
      } else {
        await createWorkspace(
          data.name,
          data.subscriptionTier,
          data.creditLimit
        );
      }
      handleClose();
    } catch (error) {
      // Error handling is done in the context
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTierChange = (value: SubscriptionTier) => {
    setValue("subscriptionTier", value);
    const tierData = subscriptionTiers.find((tier) => tier.value === value);
    if (tierData && !isEditing) {
      setValue("creditLimit", tierData.credits);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            {isEditing ? "Edit Workspace" : "Create New Workspace"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your workspace settings and subscription details."
              : "Create a new workspace to organize your website analyses."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace Name</Label>
            <Input
              id="name"
              placeholder="My Company Workspace"
              {...register("name")}
              // error={!!errors.name}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subscriptionTier">Subscription Tier</Label>
            <Select value={selectedTier} onValueChange={handleTierChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a subscription tier" />
              </SelectTrigger>
              <SelectContent>
                {subscriptionTiers.map((tier) => (
                  <SelectItem key={tier.value} value={tier.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${tier.color}`} />
                      <span className="font-medium">{tier.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTierData && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {selectedTierData.description}
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="creditLimit">Credit Limit</Label>
            <Input
              id="creditLimit"
              type="number"
              placeholder={selectedTierData?.credits.toString() || "100"}
              {...register("creditLimit", { valueAsNumber: true })}
              // error={!!errors.creditLimit}
            />
            <p className="text-sm text-muted-foreground">
              Number of website analyses allowed per month
            </p>
            {errors.creditLimit && (
              <p className="text-sm text-destructive">
                {errors.creditLimit.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText={isEditing ? "Saving..." : "Creating..."}
              icon={
                isEditing ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )
              }
            >
              {isEditing ? "Save Changes" : "Create Workspace"}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
