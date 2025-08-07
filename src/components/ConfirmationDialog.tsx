import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { AlertTriangle, Trash2, Info } from "lucide-react";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default" | "warning";
  icon?: React.ReactNode;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  icon,
}: ConfirmationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // Confirmation action failed
    } finally {
      setIsLoading(false);
    }
  };

  const getIcon = () => {
    if (icon) return icon;
    
    switch (variant) {
      case "destructive":
        return <Trash2 className="h-6 w-6 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-6 w-6 text-warning" />;
      default:
        return <Info className="h-6 w-6 text-primary" />;
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "destructive":
        return "text-destructive";
      case "warning":
        return "text-warning";
      default:
        return "text-primary";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-3">
            {getIcon()}
            <span className={getVariantStyles()}>{title}</span>
          </DialogTitle>
          <DialogDescription className="text-base">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <LoadingButton
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            loading={isLoading}
            loadingText={
              variant === "destructive" ? "Deleting..." : "Processing..."
            }
          >
            {confirmText}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}