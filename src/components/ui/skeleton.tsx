import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'rounded' | 'circular' | 'text' | 'button'
  height?: string | number
  width?: string | number
}

function Skeleton({
  className,
  variant = 'default',
  height,
  width,
  style,
  ...props
}: SkeletonProps) {
  const variants = {
    default: "rounded-lg",
    rounded: "rounded-md",
    circular: "rounded-full",
    text: "rounded",
    button: "rounded-md"
  }

  const inlineStyles = {
    ...style,
    ...(height && { height: typeof height === 'number' ? `${height}px` : height }),
    ...(width && { width: typeof width === 'number' ? `${width}px` : width })
  }

  return (
    <div
      className={cn("animate-pulse bg-muted/50", variants[variant], className)}
      style={inlineStyles}
      {...props}
    />
  )
}

export { Skeleton }
