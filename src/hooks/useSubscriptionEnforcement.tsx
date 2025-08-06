import { useToast } from "@/hooks/use-toast";
import { SubscriptionTier, useWorkspace, isValidSubscriptionTier } from "./useWorkspace";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionLimits {
  websiteAnalyses: number;
  competitorTracking: number;
  apiAccess: boolean;
  supportLevel: "email" | "priority" | "24/7";
  reports: "weekly" | "daily" | "none";
}

const subscriptionLimits: Record<SubscriptionTier, SubscriptionLimits> = {
  free: {
    websiteAnalyses: 5,
    competitorTracking: 0,
    apiAccess: false,
    supportLevel: "email",
    reports: "none",
  },
  starter: {
    websiteAnalyses: 50,
    competitorTracking: 3,
    apiAccess: false,
    supportLevel: "priority",
    reports: "weekly",
  },
  professional: {
    websiteAnalyses: 1000,
    competitorTracking: -1, // unlimited
    apiAccess: true,
    supportLevel: "24/7",
    reports: "daily",
  },
  enterprise: {
    websiteAnalyses: 10000,
    competitorTracking: -1, // unlimited
    apiAccess: true,
    supportLevel: "24/7",
    reports: "daily",
  },
};

export function useSubscriptionEnforcement() {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();

  const getCurrentLimits = (): SubscriptionLimits => {
    const tier =
      isValidSubscriptionTier(currentWorkspace?.subscription_tier) 
        ? currentWorkspace.subscription_tier 
        : "free";
    return subscriptionLimits[tier] || subscriptionLimits.free;
  };

  const canPerformAction = (action: keyof SubscriptionLimits): boolean => {
    if (!currentWorkspace) return false;

    const limits = getCurrentLimits();

    switch (action) {
      case "websiteAnalyses":
        return (currentWorkspace.credits_remaining || 0) > 0;
      case "competitorTracking":
        return (
          limits.competitorTracking === -1 || limits.competitorTracking > 0
        );
      case "apiAccess":
        return limits.apiAccess;
      default:
        return true;
    }
  };

  const enforceLimit = (
    action: keyof SubscriptionLimits,
    actionName: string
  ): boolean => {
    if (!canPerformAction(action)) {
      const tier =
        isValidSubscriptionTier(currentWorkspace?.subscription_tier) 
        ? currentWorkspace.subscription_tier 
        : "free";

      let message = "";
      let upgradeAction = "";

      switch (action) {
        case "websiteAnalyses":
          if (!currentWorkspace) {
            message = "Please create a workspace to start analyzing websites.";
            upgradeAction = "Create Workspace";
          } else {
            message = `You have reached your analysis limit for the ${tier} plan. You have ${
              currentWorkspace.credits_remaining || 0
            } credits remaining.`;
            upgradeAction =
              tier === "free"
                ? "Upgrade to Starter"
                : "Upgrade to Professional";
          }
          break;
        case "competitorTracking":
          if (!currentWorkspace) {
            message = "Please create a workspace to track competitors.";
            upgradeAction = "Create Workspace";
          } else {
            message = `Competitor tracking is not available in the ${tier} plan.`;
            upgradeAction = "Upgrade to Starter";
          }
          break;
        case "apiAccess":
          if (!currentWorkspace) {
            message = "Please create a workspace to access the API.";
            upgradeAction = "Create Workspace";
          } else {
            message = `API access is not available in the ${tier} plan.`;
            upgradeAction = "Upgrade to Professional";
          }
          break;
        default:
          message = !currentWorkspace
            ? "Please create a workspace to use this feature."
            : "This feature is not available in your current plan.";
          upgradeAction = !currentWorkspace
            ? "Create Workspace"
            : "Upgrade Plan";
      }

      toast({
        title: !currentWorkspace
          ? "Workspace Required"
          : "Feature Limit Reached",
        description: message,
        variant: "destructive",
        action: {
          label: upgradeAction,
          onClick: () => {
            // Here you would typically navigate to upgrade page or open upgrade modal
          },
        },
      });
      return false;
    }
    return true;
  };

  const consumeCredit = async (): Promise<boolean> => {
    if (!currentWorkspace) {
      toast({
        title: "Workspace Required",
        description: "Please create a workspace to use analysis credits.",
        variant: "destructive",
      });
      return false;
    }

    const credits = currentWorkspace.credits_remaining || 0;
    if (credits <= 0) {
      toast({
        title: "No Credits Remaining",
        description: "You have no analysis credits remaining for this month.",
        variant: "destructive",
      });
      return false;
    }

    try {
      // Make actual database call to consume a credit
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("workspaces")
        .update({ 
          credits_remaining: credits - 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentWorkspace.id)
        .select("credits_remaining")
        .single();

      if (error) {
        // Failed to consume credit
        toast({
          title: "Credit Deduction Failed",
          description: "Failed to deduct credit. Please try again.",
          variant: "destructive",
        });
        return false;
      }

      // Update local workspace state with new credit count
      // This will trigger a re-render with updated credits
      // Credit consumed successfully
      
      return true;
    } catch (error) {
      // Error consuming credit
      toast({
        title: "Credit Deduction Error",
        description: "An error occurred while deducting your credit. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const consumeCreditForCompetitor = async (): Promise<boolean> => {
    if (!currentWorkspace) {
      toast({
        title: "Workspace Required",
        description: "Please create a workspace to add competitors.",
        variant: "destructive",
      });
      return false;
    }

    const tier = getSubscriptionTier();
    const limits = getCurrentLimits();

    // Check if competitor tracking is allowed for this tier
    if (limits.competitorTracking === 0) {
      toast({
        title: "Feature Not Available",
        description: `Competitor tracking is not available in the ${tier} plan. Please upgrade to Starter or higher.`,
        variant: "destructive",
      });
      return false;
    }

    // For professional/enterprise (unlimited), don't consume credits
    if (limits.competitorTracking === -1) {
      return true;
    }

    // For starter tier, consume credits for competitor addition
    return await consumeCredit();
  };

  const restoreCredit = async (): Promise<boolean> => {
    if (!currentWorkspace) {
      // Cannot restore credit: No workspace available
      return false;
    }

    try {
      const currentCredits = currentWorkspace.credits_remaining || 0;
      
      // Restore one credit to the workspace
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("workspaces")
        .update({ 
          credits_remaining: currentCredits + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentWorkspace.id)
        .select("credits_remaining")
        .single();

      if (error) {
        // Failed to restore credit
        return false;
      }

      // Credit restored successfully
      return true;
    } catch (error) {
      // Error restoring credit
      return false;
    }
  };

  const getRemainingCredits = (): number => {
    return currentWorkspace?.credits_remaining || 0;
  };

  const getSubscriptionTier = (): SubscriptionTier => {
    return isValidSubscriptionTier(currentWorkspace?.subscription_tier) 
      ? currentWorkspace.subscription_tier 
      : "free";
  };

  const isFeatureAvailable = (feature: keyof SubscriptionLimits): boolean => {
    return canPerformAction(feature);
  };

  return {
    getCurrentLimits,
    canPerformAction,
    enforceLimit,
    consumeCredit,
    consumeCreditForCompetitor,
    restoreCredit,
    getRemainingCredits,
    getSubscriptionTier,
    isFeatureAvailable,
  };
}
