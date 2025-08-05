import { cn } from "@/lib/utils";

interface ColorIndicatorProps {
  color: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ColorIndicator({ color, className, size = "md" }: ColorIndicatorProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3", 
    lg: "w-4 h-4"
  };

  return (
    <div
      className={cn(
        "rounded-full border border-gray-300 dark:border-gray-600",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

interface ColorLegendProps {
  items: Array<{
    name: string;
    color: string;
    colorName?: string;
  }>;
  className?: string;
}

export function ColorLegend({ items, className }: ColorLegendProps) {
  return (
    <div className={cn("flex flex-wrap gap-4", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ColorIndicator color={item.color} />
          <span className="text-sm text-muted-foreground">
            {item.name}
            {item.colorName && (
              <span className="text-xs ml-1">({item.colorName})</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}