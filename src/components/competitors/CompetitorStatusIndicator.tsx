import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompetitorStatus } from '@/contexts/AppStateContext';

interface CompetitorStatusIndicatorProps {
  status: CompetitorStatus['status'];
  progress?: number;
  errorMessage?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  showLabel?: boolean;
  className?: string;
}

/**
 * Animated status indicator for competitor analysis
 * 
 * Features:
 * - Real-time status display with color coding
 * - Progress bar for analyzing state
 * - Smooth animations and transitions
 * - Error message tooltips
 * - Flexible sizing options
 */
export function CompetitorStatusIndicator({
  status,
  progress = 0,
  errorMessage,
  size = 'md',
  showProgress = true,
  showLabel = true,
  className
}: CompetitorStatusIndicatorProps) {
  
  const statusConfig = useMemo(() => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          label: 'Pending',
          variant: 'secondary' as const,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
          description: 'Waiting to start analysis'
        };
      case 'analyzing':
        return {
          icon: Loader2,
          label: 'Analyzing',
          variant: 'default' as const,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
          description: 'Analysis in progress',
          animate: true
        };
      case 'completed':
        return {
          icon: CheckCircle2,
          label: 'Completed',
          variant: 'default' as const,
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          description: 'Analysis completed successfully'
        };
      case 'failed':
        return {
          icon: errorMessage ? AlertCircle : XCircle,
          label: 'Failed',
          variant: 'destructive' as const,
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
          description: errorMessage || 'Analysis failed'
        };
      default:
        return {
          icon: Clock,
          label: 'Unknown',
          variant: 'outline' as const,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          description: 'Unknown status'
        };
    }
  }, [status, errorMessage]);

  const sizeConfig = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          iconSize: 'w-3 h-3',
          textSize: 'text-xs',
          padding: 'px-1.5 py-0.5',
          progressHeight: 'h-1',
          gap: 'gap-1'
        };
      case 'lg':
        return {
          iconSize: 'w-5 h-5',
          textSize: 'text-sm',
          padding: 'px-3 py-1.5',
          progressHeight: 'h-2',
          gap: 'gap-2'
        };
      default: // md
        return {
          iconSize: 'w-4 h-4',
          textSize: 'text-xs',
          padding: 'px-2 py-1',
          progressHeight: 'h-1.5',
          gap: 'gap-1.5'
        };
    }
  }, [size]);

  const Icon = statusConfig.icon;

  return (
    <div className={cn("inline-flex items-center", sizeConfig.gap, className)}>
      <Badge
        variant={statusConfig.variant}
        className={cn(
          "transition-all duration-300",
          sizeConfig.padding,
          statusConfig.bgColor,
          statusConfig.borderColor,
          "border"
        )}
        title={statusConfig.description}
      >
        <div className={cn("flex items-center", sizeConfig.gap)}>
          <Icon 
            className={cn(
              sizeConfig.iconSize,
              statusConfig.color,
              statusConfig.animate && "animate-spin"
            )}
          />
          {showLabel && (
            <span className={cn(sizeConfig.textSize, statusConfig.color)}>
              {statusConfig.label}
            </span>
          )}
        </div>
      </Badge>

      {/* Progress bar for analyzing status */}
      {showProgress && status === 'analyzing' && (
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            "flex-1 bg-gray-200 rounded-full overflow-hidden min-w-[60px]",
            sizeConfig.progressHeight
          )}>
            <div
              className={cn(
                "bg-blue-600 rounded-full transition-all duration-500 ease-out",
                sizeConfig.progressHeight
              )}
              style={{
                width: `${Math.min(Math.max(progress, 0), 100)}%`,
                transition: 'width 0.5s ease-out'
              }}
            />
          </div>
          {size !== 'sm' && (
            <span className={cn(
              "text-blue-600 font-medium whitespace-nowrap",
              sizeConfig.textSize
            )}>
              {progress}%
            </span>
          )}
        </div>
      )}

      {/* Error message indicator */}
      {status === 'failed' && errorMessage && size !== 'sm' && (
        <div 
          className="text-red-500 cursor-help"
          title={errorMessage}
        >
          <AlertCircle className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

// Convenience component for compact display
export function CompactCompetitorStatusIndicator({
  status,
  progress,
  errorMessage,
  className
}: Omit<CompetitorStatusIndicatorProps, 'size' | 'showLabel' | 'showProgress'>) {
  return (
    <CompetitorStatusIndicator
      status={status}
      progress={progress}
      errorMessage={errorMessage}
      size="sm"
      showLabel={false}
      showProgress={status === 'analyzing'}
      className={className}
    />
  );
}

// Status indicator with pulse animation for pending state
export function AnimatedCompetitorStatusIndicator({
  status,
  progress,
  errorMessage,
  ...props
}: CompetitorStatusIndicatorProps) {
  return (
    <div className={cn(
      status === 'pending' && "animate-pulse",
      status === 'analyzing' && "animate-bounce"
    )}>
      <CompetitorStatusIndicator
        status={status}
        progress={progress}
        errorMessage={errorMessage}
        {...props}
      />
    </div>
  );
}

// Note: useCompetitorStatusColor hook moved to @/lib/competitor-status-utils