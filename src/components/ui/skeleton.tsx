import { cn } from "@/lib/utils"
import React from "react"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'rounded' | 'circular' | 'text' | 'button' | 'avatar' | 'card' | 'input'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  height?: string | number
  width?: string | number
  lines?: number
  pulse?: boolean
  shimmer?: boolean
}

function Skeleton({
  className,
  variant = 'default',
  size = 'md',
  height,
  width,
  lines = 1,
  pulse = true,
  shimmer = false,
  style,
  ...props
}: SkeletonProps) {
  const variants = {
    default: "rounded-lg",
    rounded: "rounded-md", 
    circular: "rounded-full",
    text: "rounded-sm",
    button: "rounded-md",
    avatar: "rounded-full",
    card: "rounded-lg",
    input: "rounded-md"
  }

  const sizes = {
    xs: { height: '0.75rem', width: '3rem' },
    sm: { height: '1rem', width: '4rem' },
    md: { height: '1.25rem', width: '8rem' },
    lg: { height: '1.5rem', width: '12rem' },
    xl: { height: '2rem', width: '16rem' }
  }

  // Handle avatar sizes specifically
  const avatarSizes = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8', 
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  }

  // Handle button sizes specifically
  const buttonSizes = {
    xs: 'h-6 px-3',
    sm: 'h-8 px-4',
    md: 'h-10 px-6',
    lg: 'h-11 px-8',
    xl: 'h-12 px-10'
  }

  // Handle input sizes specifically  
  const inputSizes = {
    xs: 'h-6',
    sm: 'h-8',
    md: 'h-10', 
    lg: 'h-11',
    xl: 'h-12'
  }

  const getVariantClasses = (): string => {
    if (variant === 'avatar') return avatarSizes[size]
    if (variant === 'button') return buttonSizes[size]
    if (variant === 'input') return inputSizes[size]
    return variants[variant]
  }

  const getAnimationClasses = (): string => {
    if (shimmer) return "animate-shimmer bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 bg-[length:200%_100%]"
    if (pulse) return "animate-pulse bg-muted/50"
    return "bg-muted/50"
  }

  const getSizeStyles = () => {
    if (variant === 'avatar' || variant === 'button' || variant === 'input') {
      return {} // Size handled by CSS classes
    }
    
    const sizeConfig = sizes[size]
    return {
      height: height || sizeConfig.height,
      width: width || sizeConfig.width
    }
  }

  const inlineStyles = {
    ...style,
    ...getSizeStyles(),
    ...(height && typeof height === 'number' && { height: `${height}px` }),
    ...(width && typeof width === 'number' && { width: `${width}px` }),
    ...(typeof height === 'string' && { height }),
    ...(typeof width === 'string' && { width })
  }

  // Handle multiple lines for text skeletons
  if (lines > 1) {
    return (
      <div className={cn("space-y-2", className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              getAnimationClasses(),
              variants[variant],
              i === lines - 1 && "w-3/4" // Last line is shorter
            )}
            style={inlineStyles}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        getAnimationClasses(),
        getVariantClasses(),
        className
      )}
      style={inlineStyles}
      {...props}
    />
  )
}

export { Skeleton }
