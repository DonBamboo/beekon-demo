import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Spinner } from "@/components/LoadingStates";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  icon?: LucideIcon;
  loading?: boolean;
  loadingText?: string;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  className?: string;
  size?: "sm" | "md" | "lg";
  illustration?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon: Icon,
      title,
      description,
      actions = [],
      className,
      size = "md",
      illustration,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "py-8",
      md: "py-12",
      lg: "py-16",
    };

    const iconSizeClasses = {
      sm: "h-8 w-8",
      md: "h-12 w-12",
      lg: "h-16 w-16",
    };

    const titleSizeClasses = {
      sm: "text-lg",
      md: "text-xl",
      lg: "text-2xl",
    };

    const descriptionSizeClasses = {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
    };

    return (
      <Card
        ref={ref}
        className={cn("text-center", sizeClasses[size], className)}
        {...props}
      >
        <CardContent className="space-y-4">
          {/* Illustration or Icon */}
          <div className="flex justify-center">
            {illustration ? (
              illustration
            ) : Icon ? (
              <Icon
                className={cn(
                  "text-muted-foreground",
                  iconSizeClasses[size]
                )}
              />
            ) : null}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h3
              className={cn(
                "font-semibold tracking-tight",
                titleSizeClasses[size]
              )}
            >
              {title}
            </h3>

            {/* Description */}
            <p
              className={cn(
                "text-muted-foreground max-w-md mx-auto",
                descriptionSizeClasses[size]
              )}
            >
              {description}
            </p>
          </div>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center pt-2">
              {actions.map((action, index) => {
                const ActionIcon = action.icon;
                
                return (
                  <Button
                    key={index}
                    variant={action.variant || "default"}
                    onClick={action.onClick}
                    disabled={action.loading}
                    className="min-w-[120px]"
                  >
                    {action.loading ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        {action.loadingText || "Loading..."}
                      </>
                    ) : (
                      <>
                        {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
                        {action.label}
                      </>
                    )}
                  </Button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

EmptyState.displayName = "EmptyState";

export { EmptyState };