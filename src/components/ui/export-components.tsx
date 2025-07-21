// Reusable export UI components for consistent user interface patterns

import React, { useState } from "react";
import { Download, FileText, Table, Code, File, FileSpreadsheet, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExportFormat, getExportFormatDisplayName, estimateExportSize } from "@/lib/export-utils";
import { ExportPreviewModal, ExportOptions } from "@/components/ExportPreviewModal";

// Export button props
export interface ExportButtonProps {
  onExport: (format: ExportFormat) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  formats?: ExportFormat[];
  defaultFormat?: ExportFormat;
  data?: any;
  className?: string;
  showEstimatedSize?: boolean;
}

// Export format option configuration
interface ExportFormatOption {
  format: ExportFormat;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

// Available export format options
const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  {
    format: "pdf",
    label: "PDF Document",
    icon: FileText,
    description: "Formatted document for printing and sharing",
  },
  {
    format: "csv",
    label: "CSV Spreadsheet",
    icon: Table,
    description: "Comma-separated values for spreadsheet applications",
  },
  {
    format: "json",
    label: "JSON Data",
    icon: Code,
    description: "Raw data in JSON format for developers",
  },
  {
    format: "excel",
    label: "Excel Spreadsheet",
    icon: FileSpreadsheet,
    description: "Microsoft Excel compatible spreadsheet",
  },
  {
    format: "word",
    label: "Word Document",
    icon: File,
    description: "Microsoft Word compatible document",
  },
];

// Single export button with default format
export function ExportButton({
  onExport,
  isLoading = false,
  disabled = false,
  defaultFormat = "pdf",
  className = "",
}: Omit<ExportButtonProps, "formats">) {
  const formatOption = EXPORT_FORMAT_OPTIONS.find(opt => opt.format === defaultFormat);
  const Icon = formatOption?.icon || Download;

  return (
    <LoadingButton
      onClick={() => onExport(defaultFormat)}
      loading={isLoading}
      disabled={disabled}
      variant="outline"
      size="sm"
      className={className}
    >
      <Icon className="h-4 w-4 mr-2" />
      Export {formatOption?.label || defaultFormat.toUpperCase()}
    </LoadingButton>
  );
}

// Export dropdown with multiple format options
export function ExportDropdown({
  onExport,
  isLoading = false,
  disabled = false,
  formats = ["pdf", "csv", "json"],
  data,
  className = "",
  showEstimatedSize = false,
}: ExportButtonProps) {
  const availableFormats = EXPORT_FORMAT_OPTIONS.filter(opt => 
    formats.includes(opt.format)
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isLoading}
          className={className}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableFormats.map((formatOption) => (
          <DropdownMenuItem
            key={formatOption.format}
            onClick={() => onExport(formatOption.format)}
            disabled={isLoading}
            className="cursor-pointer"
          >
            <formatOption.icon className="h-4 w-4 mr-3" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{formatOption.label}</span>
                {showEstimatedSize && data && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {estimateExportSize(data, formatOption.format)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatOption.description}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Export progress indicator
export interface ExportProgressProps {
  isExporting: boolean;
  progress?: number;
  currentStep?: string;
  onCancel?: () => void;
}

export function ExportProgress({
  isExporting,
  progress = 0,
  currentStep = "Preparing export...",
  onCancel,
}: ExportProgressProps) {
  if (!isExporting) return null;

  return (
    <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">Exporting data</span>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-background rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{currentStep}</p>
      </div>
      {onCancel && (
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="ml-2"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

// Export configuration dialog trigger
export interface ExportConfigTriggerProps {
  children: React.ReactNode;
  onConfigureExport?: () => void;
}

export function ExportConfigTrigger({ children, onConfigureExport }: ExportConfigTriggerProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div onClick={onConfigureExport} className="cursor-pointer">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Configure export options</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Export format badge
export interface ExportFormatBadgeProps {
  format: ExportFormat;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export function ExportFormatBadge({
  format,
  size = "sm",
  showIcon = true,
}: ExportFormatBadgeProps) {
  const formatOption = EXPORT_FORMAT_OPTIONS.find(opt => opt.format === format);
  const Icon = formatOption?.icon || File;

  return (
    <Badge variant="secondary" className={`${size === "sm" ? "text-xs" : "text-sm"}`}>
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {format.toUpperCase()}
    </Badge>
  );
}

// Export history item
export interface ExportHistoryItemProps {
  filename: string;
  format: ExportFormat;
  size?: number;
  timestamp: string;
  status: "success" | "failed" | "pending";
  onDownload?: () => void;
  onRetry?: () => void;
}

export function ExportHistoryItem({
  filename,
  format,
  size,
  timestamp,
  status,
  onDownload,
  onRetry,
}: ExportHistoryItemProps) {
  const formatOption = EXPORT_FORMAT_OPTIONS.find(opt => opt.format === format);
  const Icon = formatOption?.icon || File;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      case "pending":
        return "text-yellow-600";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center space-x-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{filename}</p>
          <div className="flex items-center space-x-2 mt-1">
            <ExportFormatBadge format={format} showIcon={false} />
            {size && (
              <span className="text-xs text-muted-foreground">
                {(size / 1024).toFixed(1)} KB
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {new Date(timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <span className={`text-xs font-medium ${getStatusColor(status)}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        {status === "success" && onDownload && (
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="h-4 w-4" />
          </Button>
        )}
        {status === "failed" && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

// Export summary card
export interface ExportSummaryProps {
  title: string;
  recordCount: number;
  formats: ExportFormat[];
  dateRange?: { start: string; end: string };
  onExport: (format: ExportFormat) => Promise<void>;
  isLoading?: boolean;
  data?: any;
}

export function ExportSummary({
  title,
  recordCount,
  formats,
  dateRange,
  onExport,
  isLoading = false,
  data,
}: ExportSummaryProps) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {recordCount} records ready for export
        </p>
        {dateRange && (
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
          </p>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex space-x-2">
          {formats.map((format) => (
            <ExportFormatBadge key={format} format={format} />
          ))}
        </div>
        
        <ExportDropdown
          onExport={onExport}
          isLoading={isLoading}
          formats={formats}
          data={data}
          showEstimatedSize={true}
        />
      </div>
    </div>
  );
}

// Export toolbar with filters and options
export interface ExportToolbarProps {
  onExport: (format: ExportFormat) => Promise<void>;
  isLoading?: boolean;
  formats?: ExportFormat[];
  showFilters?: boolean;
  children?: React.ReactNode;
}

export function ExportToolbar({
  onExport,
  isLoading = false,
  formats = ["pdf", "csv", "json"],
  showFilters = false,
  children,
}: ExportToolbarProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center space-x-4">
        {showFilters && (
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">Filters:</span>
            {/* Filter components would go here */}
          </div>
        )}
        {children}
      </div>
      
      <ExportDropdown
        onExport={onExport}
        isLoading={isLoading}
        formats={formats}
      />
    </div>
  );
}

// Advanced export dropdown with preview option
export interface AdvancedExportDropdownProps extends ExportButtonProps {
  title: string;
  exportType: string;
  onExportWithOptions?: (format: ExportFormat, options: ExportOptions) => Promise<void>;
}

export function AdvancedExportDropdown({
  onExport,
  onExportWithOptions,
  isLoading = false,
  disabled = false,
  formats = ["pdf", "csv", "json"],
  data,
  title,
  exportType,
  className = "",
  showEstimatedSize = false,
}: AdvancedExportDropdownProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const availableFormats = EXPORT_FORMAT_OPTIONS.filter(opt => 
    formats.includes(opt.format)
  );

  const handleQuickExport = async (format: ExportFormat) => {
    await onExport(format);
  };

  const handleExportWithOptions = async (format: ExportFormat, options: ExportOptions) => {
    if (onExportWithOptions) {
      await onExportWithOptions(format, options);
    } else {
      await onExport(format);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || isLoading}
            className={className}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Quick Export</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableFormats.map((formatOption) => (
            <DropdownMenuItem
              key={formatOption.format}
              onClick={() => handleQuickExport(formatOption.format)}
              disabled={isLoading}
              className="cursor-pointer"
            >
              <formatOption.icon className="h-4 w-4 mr-3" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatOption.label}</span>
                  {showEstimatedSize && data && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {estimateExportSize(data, formatOption.format)}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatOption.description}
                </p>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsPreviewOpen(true)}
            className="cursor-pointer"
          >
            <Settings className="h-4 w-4 mr-3" />
            <div>
              <span className="font-medium">Advanced Options</span>
              <p className="text-xs text-muted-foreground mt-1">
                Preview and customize export settings
              </p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={data}
        title={title}
        exportType={exportType}
        onExport={handleExportWithOptions}
      />
    </>
  );
}