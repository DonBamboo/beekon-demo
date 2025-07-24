// Unified export utilities for consistent export functionality across the application

import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from "docx";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";

// Export format types - import from database types for consistency
import type { ExportFormat } from "@/types/database";

// Export configuration interface
export interface ExportConfig {
  filename: string;
  format: ExportFormat;
  includeTimestamp?: boolean;
  dateRange?: { start: string; end: string };
  filters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Field mapping configuration for professional column names
export interface FieldMapping {
  [key: string]: {
    displayName: string;
    format?: 'text' | 'number' | 'percentage' | 'currency' | 'date' | 'datetime' | 'boolean' | 'url';
    description?: string;
    width?: number;
    alignment?: 'left' | 'center' | 'right';
  };
}

// Common field mappings for different data types
export const COMMON_FIELD_MAPPINGS: Record<string, FieldMapping> = {
  website: {
    id: { displayName: 'Website ID', format: 'text', description: 'Unique identifier' },
    domain: { displayName: 'Domain', format: 'url', description: 'Website domain name', width: 200 },
    display_name: { displayName: 'Display Name', format: 'text', description: 'Website display name', width: 150 },
    website_type: { displayName: 'Type', format: 'text', description: 'Website category', width: 100 },
    is_active: { displayName: 'Active', format: 'boolean', description: 'Active status', width: 80 },
    monitoring_enabled: { displayName: 'Monitoring', format: 'boolean', description: 'Monitoring status', width: 100 },
    created_at: { displayName: 'Created Date', format: 'date', description: 'Date created', width: 120 },
    updated_at: { displayName: 'Last Updated', format: 'date', description: 'Date last updated', width: 120 },
    description: { displayName: 'Description', format: 'text', description: 'Website description', width: 300 },
    totalAnalyses: { displayName: 'Total Analyses', format: 'number', description: 'Total number of analyses', width: 120 },
    averageConfidence: { displayName: 'Avg. Confidence', format: 'percentage', description: 'Average confidence score', width: 120 },
    averageSentiment: { displayName: 'Avg. Sentiment', format: 'percentage', description: 'Average sentiment score', width: 120 },
    mentionRate: { displayName: 'Mention Rate', format: 'percentage', description: 'Percentage of mentions', width: 120 },
    averageRank: { displayName: 'Avg. Rank', format: 'number', description: 'Average ranking position', width: 100 },
  },
  competitor: {
    id: { displayName: 'Competitor ID', format: 'text', description: 'Unique identifier' },
    competitor_domain: { displayName: 'Domain', format: 'url', description: 'Competitor domain', width: 200 },
    competitor_name: { displayName: 'Company Name', format: 'text', description: 'Competitor name', width: 150 },
    is_active: { displayName: 'Active', format: 'boolean', description: 'Active status', width: 80 },
    created_at: { displayName: 'Added Date', format: 'date', description: 'Date added', width: 120 },
    updated_at: { displayName: 'Last Updated', format: 'date', description: 'Date last updated', width: 120 },
    shareOfVoice: { displayName: 'Share of Voice', format: 'percentage', description: 'Share of voice percentage', width: 120 },
    averageRank: { displayName: 'Avg. Rank', format: 'number', description: 'Average ranking position', width: 100 },
    mentionCount: { displayName: 'Mentions', format: 'number', description: 'Total mentions', width: 100 },
    sentimentScore: { displayName: 'Sentiment Score', format: 'percentage', description: 'Average sentiment', width: 120 },
    analysisStatus: { displayName: 'Analysis Status', format: 'text', description: 'Current analysis status', width: 120 },
  },
  analysis: {
    id: { displayName: 'Analysis ID', format: 'text', description: 'Unique identifier' },
    prompt: { displayName: 'Prompt', format: 'text', description: 'Analysis prompt', width: 300 },
    topic: { displayName: 'Topic', format: 'text', description: 'Analysis topic', width: 150 },
    website_id: { displayName: 'Website ID', format: 'text', description: 'Associated website' },
    status: { displayName: 'Status', format: 'text', description: 'Analysis status', width: 100 },
    confidence: { displayName: 'Confidence', format: 'percentage', description: 'Confidence score', width: 100 },
    created_at: { displayName: 'Created Date', format: 'datetime', description: 'Date created', width: 150 },
    updated_at: { displayName: 'Last Updated', format: 'datetime', description: 'Date last updated', width: 150 },
    llm_provider: { displayName: 'LLM Provider', format: 'text', description: 'AI provider used', width: 120 },
    is_mentioned: { displayName: 'Mentioned', format: 'boolean', description: 'Whether mentioned', width: 100 },
    rank_position: { displayName: 'Rank Position', format: 'number', description: 'Ranking position', width: 100 },
    sentiment_score: { displayName: 'Sentiment', format: 'percentage', description: 'Sentiment score', width: 100 },
    summary_text: { displayName: 'Summary', format: 'text', description: 'Analysis summary', width: 400 },
    response_text: { displayName: 'Full Response', format: 'text', description: 'Complete response', width: 500 },
  },
  dashboard: {
    category: { displayName: 'Category', format: 'text', description: 'Data category', width: 120 },
    metric: { displayName: 'Metric', format: 'text', description: 'Metric name', width: 200 },
    value: { displayName: 'Value', format: 'text', description: 'Metric value', width: 120 },
    unit: { displayName: 'Unit/Status', format: 'text', description: 'Unit or status information', width: 120 },
    // Legacy mappings for backward compatibility
    totalAnalyses: { displayName: 'Total Analyses', format: 'number', description: 'Total number of analyses', width: 120 },
    averageConfidence: { displayName: 'Avg. Confidence', format: 'percentage', description: 'Average confidence score', width: 120 },
    averageSentiment: { displayName: 'Avg. Sentiment', format: 'percentage', description: 'Average sentiment score', width: 120 },
    mentionRate: { displayName: 'Mention Rate', format: 'percentage', description: 'Percentage of mentions', width: 120 },
    topPerformingTopic: { displayName: 'Top Topic', format: 'text', description: 'Best performing topic', width: 150 },
    totalWebsites: { displayName: 'Total Websites', format: 'number', description: 'Number of websites', width: 120 },
    activeWebsites: { displayName: 'Active Websites', format: 'number', description: 'Number of active websites', width: 120 },
    averageRank: { displayName: 'Avg. Rank', format: 'number', description: 'Average ranking position', width: 100 },
    trendDirection: { displayName: 'Trend', format: 'text', description: 'Performance trend', width: 100 },
    period: { displayName: 'Time Period', format: 'text', description: 'Analysis time period', width: 120 },
  }
};

// Export result interface
export interface ExportResult {
  success: boolean;
  filename: string;
  format: ExportFormat;
  size?: number;
  error?: string;
}

// Export data structure for consistent formatting
export interface ExportData {
  title: string;
  data: Record<string, unknown>[] | Record<string, unknown>;
  exportedAt: string;
  totalRecords: number;
  filters?: Record<string, unknown>;
  dateRange?: { start: string; end: string };
  metadata?: Record<string, unknown>;
  dataType?: string; // For field mapping
}

// Chart capture configuration interface
export interface ChartCaptureConfig {
  backgroundColor?: string;
  scale?: number;
  width?: number;
  height?: number;
  useCORS?: boolean;
  quality?: number;
}

// Chart capture result interface
export interface ChartCaptureResult {
  success: boolean;
  imageData?: string; // base64 encoded image
  width?: number;
  height?: number;
  error?: string;
}

// Chart information for PDF integration
export interface ChartInfo {
  id: string;
  title: string;
  imageData: string;
  width: number;
  height: number;
}

// MIME type mappings for different export formats
export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  json: "application/json",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// File extension mappings
export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: "pdf",
  csv: "csv",
  json: "json",
  excel: "xlsx",
  word: "docx",
};

// Validate export item to ensure it has required fields and no undefined values
export function isValidExportItem(item: Record<string, unknown>): boolean {
  // Check for null or undefined item
  if (!item || typeof item !== 'object') return false;
  
  // Check for at least basic structure
  const entries = Object.entries(item);
  if (entries.length === 0) return false;
  
  // Check that critical values are not undefined/null (except for unit which can be empty)
  const hasValidMetric = entries.some(([key, value]) => 
    (key.toLowerCase().includes('metric') || key.toLowerCase().includes('name')) && 
    value !== undefined && value !== null && String(value).trim() !== ''
  );
  
  const hasValidValue = entries.some(([key, value]) => 
    (key.toLowerCase().includes('value') || key.toLowerCase().includes('amount')) && 
    value !== undefined && value !== null && String(value).trim() !== ''
  );
  
  // For categorized data, require either valid metric+value OR at least 2 non-empty fields
  return hasValidMetric && hasValidValue || entries.filter(([key, value]) => 
    value !== undefined && value !== null && String(value).trim() !== ''
  ).length >= 2;
}

// Smart object serialization helper for exports
export function serializeForExport(value: unknown, maxLength: number = 200): string {
  if (value === null || value === undefined) return '';
  
  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    
    // For small arrays, show all items
    if (value.length <= 3) {
      const serialized = value.map(item => 
        typeof item === 'object' && item !== null 
          ? JSON.stringify(item) 
          : String(item)
      ).join(', ');
      
      return serialized.length <= maxLength 
        ? `[${serialized}]` 
        : `[${serialized.substring(0, maxLength - 10)}... +${value.length - 1} more]`;
    }
    
    // For larger arrays, show count and first few items
    return `[${value.length} items: ${String(value[0])}${value.length > 1 ? ', ...' : ''}]`;
  }
  
  // Handle objects
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    
    try {
      const jsonString = JSON.stringify(value, null, 0);
      
      // If object is small enough, return full JSON
      if (jsonString.length <= maxLength) {
        return jsonString;
      }
      
      // For large objects, show summary
      const firstKey = keys[0];
      const firstValue = (value as Record<string, unknown>)[firstKey];
      const summary = `{${firstKey}: ${serializeForExport(firstValue, 50)}${keys.length > 1 ? `, ...+${keys.length - 1} more` : ''}}`;
      
      return summary.length <= maxLength ? summary : `{${keys.length} properties}`;
    } catch (error) {
      return `{${keys.length} properties}`;
    }
  }
  
  // Handle primitives
  const stringValue = String(value);
  return stringValue.length <= maxLength 
    ? stringValue 
    : `${stringValue.substring(0, maxLength - 3)}...`;
}

/**
 * Capture a chart element as a base64 image using html2canvas
 * @param element - The DOM element to capture (chart container)
 * @param config - Configuration options for capture
 * @returns Promise<ChartCaptureResult>
 */
export async function captureChartAsImage(
  element: HTMLElement, 
  config: ChartCaptureConfig = {}
): Promise<ChartCaptureResult> {
  try {
    // Get element's actual dimensions for dynamic sizing
    const elementRect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    
    // Calculate actual content dimensions including padding/margins
    const actualWidth = element.offsetWidth;
    const actualHeight = element.offsetHeight;
    
    // Default configuration with dynamic sizing
    const defaultConfig: ChartCaptureConfig = {
      backgroundColor: 'white',
      scale: 2, // High DPI for crisp charts
      // Use dynamic dimensions with reasonable constraints
      width: Math.max(600, Math.min(1200, actualWidth || 800)), // Min 600px, Max 1200px
      height: Math.max(300, Math.min(800, actualHeight || 400)), // Min 300px, Max 800px
      useCORS: true,
      quality: 0.95,
    };

    const finalConfig = { ...defaultConfig, ...config };

    // Wait longer for layout stabilization, especially for responsive elements
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Ensure element is visible and properly laid out
    if (elementRect.width === 0 || elementRect.height === 0) {
      console.warn('Element has zero dimensions, using fallback sizing');
    }

    // Capture the element as canvas with dynamic sizing
    const canvas = await html2canvas(element, {
      backgroundColor: finalConfig.backgroundColor,
      scale: finalConfig.scale,
      width: finalConfig.width,
      height: finalConfig.height,
      useCORS: finalConfig.useCORS,
      allowTaint: true,
      logging: false, // Disable logging for cleaner output
      removeContainer: true,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc, clonedElement) => {
        // Ensure proper styling is applied in the cloned document
        const style = clonedDoc.createElement('style');
        style.textContent = `
          * { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          .recharts-responsive-container {
            position: relative !important;
            width: 100% !important;
            height: 100% !important;
          }
        `;
        clonedDoc.head.appendChild(style);
        
        // Ensure the cloned element maintains proper dimensions
        if (clonedElement) {
          clonedElement.style.width = `${finalConfig.width}px`;
          clonedElement.style.height = `${finalConfig.height}px`;
          clonedElement.style.overflow = 'visible';
        }
      }
    });

    // Convert to base64 image data
    const imageData = canvas.toDataURL('image/png', finalConfig.quality);

    return {
      success: true,
      imageData,
      width: canvas.width,
      height: canvas.height,
    };

  } catch (error) {
    console.error('Chart capture failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown capture error',
    };
  }
}

/**
 * Capture multiple charts concurrently with element-specific configurations
 * @param chartElements - Array of chart elements with their IDs and titles
 * @param globalConfig - Global configuration options for capture
 * @returns Promise<ChartInfo[]>
 */
export async function captureMultipleCharts(
  chartElements: Array<{ element: HTMLElement; id: string; title: string; config?: ChartCaptureConfig }>,
  globalConfig: ChartCaptureConfig = {}
): Promise<ChartInfo[]> {
  const capturePromises = chartElements.map(async ({ element, id, title, config: elementConfig }) => {
    // Merge global config with element-specific config, with element config taking precedence
    const mergedConfig = { ...globalConfig, ...elementConfig };
    
    // Apply chart-specific optimizations
    const chartSpecificConfig = getChartSpecificConfig(id, mergedConfig);
    
    const result = await captureChartAsImage(element, chartSpecificConfig);
    
    if (result.success && result.imageData) {
      return {
        id,
        title,
        imageData: result.imageData,
        width: result.width || 800,
        height: result.height || 400,
      };
    }
    
    console.warn(`Failed to capture chart: ${title}`, result.error);
    return null;
  });

  const results = await Promise.all(capturePromises);
  return results.filter((result): result is ChartInfo => result !== null);
}

/**
 * Get chart-specific configuration based on chart ID
 * @param chartId - The ID of the chart
 * @param baseConfig - Base configuration to extend
 * @returns ChartCaptureConfig with chart-specific optimizations
 */
function getChartSpecificConfig(chartId: string, baseConfig: ChartCaptureConfig): ChartCaptureConfig {
  const chartConfigs: Record<string, Partial<ChartCaptureConfig>> = {
    'visibility-chart': {
      // Visibility chart tends to be taller due to export button in header
      height: Math.max(450, baseConfig.height || 400), // Ensure minimum 450px height
      // Give extra time for responsive container to stabilize
    },
    'llm-performance': {
      // LLM performance chart is typically wider due to multiple bars
      width: Math.max(700, baseConfig.width || 600),
    },
    'sentiment-distribution': {
      // Pie chart needs square-ish dimensions for proper aspect ratio
      width: Math.max(500, Math.min(600, baseConfig.width || 500)),
      height: Math.max(400, Math.min(500, baseConfig.height || 400)),
    },
    'mention-trends': {
      // Time series chart benefits from wider format
      width: Math.max(750, baseConfig.width || 600),
    },
    'topic-radar': {
      // Radar chart works best with square dimensions
      width: Math.max(500, Math.min(600, baseConfig.width || 500)),
      height: Math.max(500, Math.min(600, baseConfig.height || 500)),
    },
    'website-performance': {
      // Website performance uses progress bars, can be more compact
      height: Math.max(350, baseConfig.height || 300),
    },
  };

  const specificConfig = chartConfigs[chartId] || {};
  return { ...baseConfig, ...specificConfig };
}

// Format value according to field mapping
export function formatValue(value: unknown, fieldMapping?: FieldMapping[string]): string {
  if (value === null || value === undefined) return '';
  
  const format = fieldMapping?.format || 'text';
  
  switch (format) {
    case 'percentage': {
      const numValue = parseFloat(String(value));
      return isNaN(numValue) ? '0%' : `${numValue.toFixed(1)}%`;
    }
    
    case 'number': {
      const num = parseFloat(String(value));
      return isNaN(num) ? '0' : num.toLocaleString();
    }
    
    case 'currency': {
      const currencyNum = parseFloat(String(value));
      return isNaN(currencyNum) ? '$0.00' : `$${currencyNum.toFixed(2)}`;
    }
    
    case 'date': {
      const date = new Date(String(value));
      return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
    }
    
    case 'datetime': {
      const datetime = new Date(String(value));
      return isNaN(datetime.getTime()) ? '' : datetime.toLocaleString();
    }
    
    case 'boolean':
      return value === true ? 'Yes' : value === false ? 'No' : '';
    
    case 'url':
      return String(value);
    
    default:
      // Use smart serialization for complex objects
      if (typeof value === 'object' && value !== null) {
        return serializeForExport(value);
      }
      return String(value);
  }
}

// Get field mapping for a specific data type
export function getFieldMapping(dataType: string): FieldMapping {
  return COMMON_FIELD_MAPPINGS[dataType] || {};
}

// Apply field mapping to transform data
export function applyFieldMapping(data: Record<string, unknown>[], dataType: string): Record<string, unknown>[] {
  const fieldMapping = getFieldMapping(dataType);
  
  return data.map(item => {
    const transformedItem: Record<string, unknown> = {};
    
    Object.entries(item).forEach(([key, value]) => {
      const mapping = fieldMapping[key];
      if (mapping) {
        transformedItem[mapping.displayName] = formatValue(value, mapping);
      } else {
        // For unmapped fields, use a cleaned-up version of the key
        const cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        transformedItem[cleanKey] = formatValue(value);
      }
    });
    
    return transformedItem;
  });
}

// Generate consistent filename with timestamp and format
export function generateExportFilename(
  baseName: string,
  format: ExportFormat,
  options: {
    includeTimestamp?: boolean;
    identifier?: string;
    dateRange?: { start: string; end: string };
  } = {}
): string {
  const { includeTimestamp = true, identifier, dateRange } = options;
  
  // Clean and standardize base name
  let filename = baseName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
  
  // Add identifier if provided
  if (identifier) {
    filename += `-${identifier}`;
  }
  
  // Add date range if provided
  if (dateRange) {
    const startDate = new Date(dateRange.start).toISOString().split('T')[0];
    const endDate = new Date(dateRange.end).toISOString().split('T')[0];
    filename += `-${startDate}_to_${endDate}`;
  }
  
  // Add timestamp if requested
  if (includeTimestamp) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    filename += `-${timestamp}`;
  }
  
  return `${filename}.${EXPORT_FILE_EXTENSIONS[format]}`;
}

// Download blob with enhanced browser compatibility and error handling
export function downloadBlob(
  blob: Blob,
  filename: string,
  format: ExportFormat
): Promise<ExportResult> {
  return new Promise((resolve) => {
    try {
      // Validate blob
      if (!blob || blob.size === 0) {
        resolve({
          success: false,
          filename,
          format,
          error: "Invalid or empty file content",
        });
        return;
      }

      // Log blob details for debugging
      console.log(`Downloading ${format} file:`, {
        filename,
        size: blob.size,
        type: blob.type
      });

      // Use the file-saver library for better compatibility
      try {
        saveAs(blob, filename);
        resolve({
          success: true,
          filename,
          format,
          size: blob.size,
        });
        return;
      } catch (saveAsError) {
        console.warn("file-saver failed, falling back to manual download:", saveAsError);
      }

      // Fallback to manual download method
      const url = window.URL.createObjectURL(blob);
      
      // Create download link with better browser compatibility
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      link.style.visibility = "hidden";
      
      // Add to DOM
      document.body.appendChild(link);
      
      // Create a more reliable download trigger
      const triggerDownload = () => {
        // For better compatibility across browsers
        if (link.click) {
          link.click();
        } else if (document.createEvent) {
          const evt = document.createEvent('MouseEvents');
          evt.initEvent('click', true, true);
          link.dispatchEvent(evt);
        }
      };
      
      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        triggerDownload();
        
        // Clean up after a reasonable delay
        setTimeout(() => {
          try {
            if (document.body.contains(link)) {
              document.body.removeChild(link);
            }
            window.URL.revokeObjectURL(url);
          } catch (cleanupError) {
            console.warn("Cleanup error:", cleanupError);
          }
          
          resolve({
            success: true,
            filename,
            format,
            size: blob.size,
          });
        }, 500); // Increased delay for better reliability
      });
      
    } catch (error) {
      console.error("Download failed:", error);
      resolve({
        success: false,
        filename,
        format,
        error: error instanceof Error ? error.message : "Unknown download error",
      });
    }
  });
}

// Format data for JSON export
export function formatJsonExport(data: ExportData): Blob {
  const jsonContent = JSON.stringify(data, null, 2);
  return new Blob([jsonContent], { type: EXPORT_MIME_TYPES.json });
}

// Format data for CSV export
export function formatCsvExport(data: ExportData, dataType?: string): Blob {
  // Professional CSV header with metadata
  let csvContent = `"${data.title}"\n`;
  csvContent += `"Generated by","Beekon AI"\n`;
  csvContent += `"Exported at","${new Date(data.exportedAt).toLocaleString()}"\n`;
  csvContent += `"Total Records","${data.totalRecords}"\n`;
  
  // Add filters if present
  if (data.filters && Object.keys(data.filters).length > 0) {
    csvContent += `\n"Applied Filters:"\n`;
    Object.entries(data.filters).forEach(([key, value]) => {
      const cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      csvContent += `"${cleanKey}","${value}"\n`;
    });
  }
  
  // Add date range if present
  if (data.dateRange) {
    const startDate = new Date(data.dateRange.start).toLocaleDateString();
    const endDate = new Date(data.dateRange.end).toLocaleDateString();
    csvContent += `\n"Date Range","${startDate} to ${endDate}"\n`;
  }
  
  csvContent += `\n`;
  
  // Add the main data based on its structure
  if (Array.isArray(data.data)) {
    csvContent += formatArrayToCsv(data.data, dataType);
  } else if (typeof data.data === 'object') {
    csvContent += formatObjectToCsv(data.data, dataType);
  }
  
  return new Blob([csvContent], { type: EXPORT_MIME_TYPES.csv });
}

// Format data for PDF export using jsPDF for professional PDF documents
export function formatPdfExport(data: ExportData, dataType?: string, charts?: ChartInfo[]): Blob {
  const doc = new jsPDF();
  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const marginBottom = 20;
  
  // Helper function to add page break if needed
  const checkPageBreak = (neededHeight: number = 10) => {
    if (yPosition + neededHeight > pageHeight - marginBottom) {
      doc.addPage();
      yPosition = 20;
    }
  };
  
  // Document title
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text(data.title.toUpperCase(), 20, yPosition);
  yPosition += 15;
  
  // Subtitle
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text('BEEKON AI REPORT', 20, yPosition);
  yPosition += 15;
  
  // Document metadata
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date(data.exportedAt).toLocaleString()}`, 20, yPosition);
  yPosition += 6;
  doc.text(`Total Records: ${data.totalRecords.toLocaleString()}`, 20, yPosition);
  yPosition += 6;
  
  // Add date range if present
  if (data.dateRange) {
    const startDate = new Date(data.dateRange.start).toLocaleDateString();
    const endDate = new Date(data.dateRange.end).toLocaleDateString();
    doc.text(`Date Range: ${startDate} to ${endDate}`, 20, yPosition);
    yPosition += 6;
  }
  
  yPosition += 10;
  
  // Add filters if present
  if (data.filters && Object.keys(data.filters).length > 0) {
    checkPageBreak(20);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('APPLIED FILTERS', 20, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    Object.entries(data.filters).forEach(([key, value]) => {
      checkPageBreak();
      const cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      // Handle arrays with better formatting
      let displayValue;
      if (Array.isArray(value)) {
        displayValue = value.map(item => {
          // Convert camelCase to readable format
          return String(item)
            .replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
            .trim();
        }).join(', ');
      } else if (typeof value === 'object' && value !== null) {
        // Handle objects by serializing them
        displayValue = serializeForExport(value, 100);
      } else {
        displayValue = String(value || '');
      }
      
      doc.text(`• ${cleanKey}: ${displayValue}`, 25, yPosition);
      yPosition += 6;
    });
    yPosition += 10;
  }
  
  // Add the main data
  checkPageBreak(20);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('DATA', 20, yPosition);
  yPosition += 10;
  
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  
  if (Array.isArray(data.data)) {
    const processedData = dataType ? applyFieldMapping(data.data, dataType) : data.data;
    
    if (processedData.length > 0) {
      // Check if data has category field for organized display
      const hasCategoryField = processedData.some(item => item.hasOwnProperty('category') || item.hasOwnProperty('Category'));
      
      if (hasCategoryField) {
        // Group data by category for organized sections
        const categoryKey = processedData[0].hasOwnProperty('category') ? 'category' : 'Category';
        const groupedData = processedData.reduce((groups, item) => {
          const category = String(item[categoryKey] || 'Uncategorized');
          if (!groups[category]) {
            groups[category] = [];
          }
          groups[category].push(item);
          return groups;
        }, {} as Record<string, typeof processedData>);
        
        // Define category display order for better organization
        const categoryOrder = [
          'Summary', 'Performance', 'Metrics', 'Websites', 'Website Performance', 
          'Top Topics', 'LLM Performance', 'Time Series', 'Analysis', 'Configuration'
        ];
        
        // Sort categories by predefined order, then alphabetically
        const sortedCategories = Object.keys(groupedData).sort((a, b) => {
          const orderA = categoryOrder.indexOf(a);
          const orderB = categoryOrder.indexOf(b);
          
          if (orderA !== -1 && orderB !== -1) return orderA - orderB;
          if (orderA !== -1) return -1;
          if (orderB !== -1) return 1;
          return a.localeCompare(b);
        });
        
        // Render each category as a separate section
        sortedCategories.forEach((category, categoryIndex) => {
          const categoryData = groupedData[category];
          
          checkPageBreak(25);
          
          // Category header
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text(category.toUpperCase(), 20, yPosition);
          yPosition += 8;
          
          // Add underline for category
          doc.setLineWidth(0.5);
          doc.line(20, yPosition - 3, 20 + (category.length * 2.5), yPosition - 3);
          yPosition += 6;
          
          // Create two-column layout for better readability
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          
          // Filter and process valid items only
          const validCategoryData = categoryData.filter(item => isValidExportItem(item));
          
          validCategoryData.slice(0, 20).forEach((item, index) => { // Limit items per category
            checkPageBreak(8);
            
            // Extract metric and value (skip category field)
            const itemEntries = Object.entries(item).filter(([key, value]) => 
              key !== categoryKey && key !== 'category' && key !== 'Category' &&
              value !== undefined && value !== null && String(value).trim() !== ''
            );
            
            if (itemEntries.length >= 2) {
              // Use metric and value format for cleaner display
              const metric = itemEntries.find(([key]) => 
                key.toLowerCase().includes('metric') || key.toLowerCase().includes('name')
              )?.[1] || itemEntries[0][1];
              
              const value = itemEntries.find(([key]) => 
                key.toLowerCase().includes('value') || key.toLowerCase().includes('amount')
              )?.[1] || itemEntries[1][1];
              
              const unit = itemEntries.find(([key]) => 
                key.toLowerCase().includes('unit') || key.toLowerCase().includes('status')
              )?.[1] || '';
              
              // Skip if critical values are undefined
              if (metric === undefined || metric === null || value === undefined || value === null) {
                return; // Skip this item
              }
              
              // Format the line
              const metricText = String(metric || '');
              const valueText = String(value || '');
              const unitText = unit && String(unit).trim() ? ` (${String(unit)})` : '';
              
              // Skip empty entries
              if (!metricText.trim() || !valueText.trim()) {
                return; // Skip this item
              }
              
              // Metric name (left-aligned)
              doc.setFont(undefined, 'bold');
              const truncatedMetric = metricText.length > 35 ? metricText.substring(0, 32) + '...' : metricText;
              doc.text(truncatedMetric, 25, yPosition);
              
              // Value and unit (right-aligned area)
              doc.setFont(undefined, 'normal');
              const displayValue = `${valueText}${unitText}`;
              const truncatedValue = displayValue.length > 40 ? displayValue.substring(0, 37) + '...' : displayValue;
              doc.text(truncatedValue, 110, yPosition);
            } else {
              // Fallback: display all non-category fields that are not undefined/null
              const displayText = itemEntries.map(([key, value]) => 
                `${key}: ${String(value)}`
              ).join(' | ');
              
              // Skip if no valid content
              if (!displayText.trim() || displayText.trim() === '') {
                return; // Skip this item
              }
              
              const truncatedText = displayText.length > 70 ? displayText.substring(0, 67) + '...' : displayText;
              doc.text(truncatedText, 25, yPosition);
            }
            
            yPosition += 6;
          });
          
          // Update count message to reflect actual valid items
          const validItemsShown = Math.min(validCategoryData.length, 20);
          const remainingValidItems = Math.max(0, validCategoryData.length - 20);
          
          // Add note if category has more valid items
          if (remainingValidItems > 0) {
            checkPageBreak();
            doc.setFont(undefined, 'italic');
            doc.setFontSize(8);
            doc.text(`... and ${remainingValidItems} more ${category.toLowerCase()} items`, 25, yPosition);
            yPosition += 5;
          }
          
          // Add spacing between categories (except last)
          if (categoryIndex < sortedCategories.length - 1) {
            yPosition += 10;
          }
        });
        
      } else {
        // Fallback to original table format for non-categorized data
        const headers = Object.keys(processedData[0]);
        const maxCharsPerColumn = Math.floor(170 / headers.length);
        
        // Headers
        checkPageBreak(15);
        doc.setFont(undefined, 'bold');
        let xPosition = 20;
        headers.forEach(header => {
          const truncatedHeader = header.length > maxCharsPerColumn ? 
            header.substring(0, maxCharsPerColumn - 3) + '...' : header;
          doc.text(truncatedHeader, xPosition, yPosition);
          xPosition += maxCharsPerColumn * 1.2;
        });
        yPosition += 8;
        
        // Add separator line
        doc.line(20, yPosition - 3, 190, yPosition - 3);
        
        // Data rows
        doc.setFont(undefined, 'normal');
        processedData.slice(0, 50).forEach((row, index) => { // Limit to 50 rows for PDF readability
          checkPageBreak();
          xPosition = 20;
          headers.forEach(header => {
            const rawValue = row[header];
            // Use smart serialization for objects and arrays
            const value = typeof rawValue === 'object' && rawValue !== null 
              ? serializeForExport(rawValue, maxCharsPerColumn * 3) 
              : String(rawValue ?? '');
            
            const truncatedValue = value.length > maxCharsPerColumn ? 
              value.substring(0, maxCharsPerColumn - 3) + '...' : value;
            doc.text(truncatedValue, xPosition, yPosition);
            xPosition += maxCharsPerColumn * 1.2;
          });
          yPosition += 6;
        });
        
        if (processedData.length > 50) {
          yPosition += 5;
          doc.setFont(undefined, 'italic');
          doc.text(`... and ${processedData.length - 50} more records`, 20, yPosition);
        }
      }
    }
  } else if (typeof data.data === 'object') {
    const fieldMapping = dataType ? getFieldMapping(dataType) : {};
    
    Object.entries(data.data).forEach(([key, value]) => {
      checkPageBreak();
      const mapping = fieldMapping[key];
      const displayName = mapping?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      // Use smart serialization for objects, otherwise use field mapping
      const formattedValue = mapping ? formatValue(value, mapping) : 
        (typeof value === 'object' && value !== null ? serializeForExport(value, 400) : String(value ?? ''));
      
      doc.setFont(undefined, 'bold');
      doc.text(`${displayName}:`, 20, yPosition);
      doc.setFont(undefined, 'normal');
      
      // Handle long values by wrapping text
      const maxWidth = 170;
      const splitText = doc.splitTextToSize(formattedValue, maxWidth - 40);
      
      if (Array.isArray(splitText)) {
        splitText.forEach((line: string, index: number) => {
          if (index === 0) {
            doc.text(line, 60, yPosition);
          } else {
            yPosition += 5;
            checkPageBreak();
            doc.text(line, 60, yPosition);
          }
        });
      } else {
        doc.text(splitText, 60, yPosition);
      }
      
      yPosition += 8;
    });
  }
  
  // Add charts if provided
  if (charts && charts.length > 0) {
    checkPageBreak(40); // Ensure space for charts section header
    
    // Charts section header
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('DASHBOARD CHARTS', 20, yPosition);
    yPosition += 15;
    
    // Add separator line
    doc.setLineWidth(1);
    doc.line(20, yPosition - 5, 190, yPosition - 5);
    yPosition += 10;
    
    // Process each chart
    charts.forEach((chart, index) => {
      checkPageBreak(100); // Ensure enough space for chart (including title)
      
      // Chart title
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(chart.title, 20, yPosition);
      yPosition += 8;
      
      try {
        // Calculate image dimensions to fit page width
        const pageWidth = doc.internal.pageSize.width;
        const maxImageWidth = pageWidth - 40; // 20px margin on each side
        const maxImageHeight = 80; // Maximum height to prevent overflow
        
        // Calculate scaled dimensions maintaining aspect ratio
        const aspectRatio = chart.width / chart.height;
        let imageWidth = Math.min(maxImageWidth, chart.width * 0.1); // Scale down for PDF
        let imageHeight = imageWidth / aspectRatio;
        
        // Adjust if height exceeds maximum
        if (imageHeight > maxImageHeight) {
          imageHeight = maxImageHeight;
          imageWidth = imageHeight * aspectRatio;
        }
        
        // Add the chart image
        doc.addImage(
          chart.imageData,
          'PNG',
          20, // x position
          yPosition, // y position
          imageWidth,
          imageHeight,
          `chart-${index}`, // alias
          'MEDIUM' // compression
        );
        
        yPosition += imageHeight + 15; // Move position after image + spacing
        
      } catch (error) {
        console.error(`Failed to add chart "${chart.title}" to PDF:`, error);
        
        // Add error message instead of chart
        doc.setFontSize(10);
        doc.setFont(undefined, 'italic');
        doc.text(`[Chart could not be rendered: ${chart.title}]`, 20, yPosition);
        yPosition += 10;
      }
      
      // Add spacing between charts
      if (index < charts.length - 1) {
        yPosition += 10;
      }
    });
    
    yPosition += 10; // Extra spacing after charts section
  }
  
  // Add footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text(
      `Generated by Beekon AI - ${new Date().toLocaleDateString()} | Page ${i} of ${totalPages}`, 
      20, 
      pageHeight - 10
    );
  }
  
  return new Blob([doc.output('blob')], { type: EXPORT_MIME_TYPES.pdf });
}

// Format data for Excel export using xlsx library for real Excel files
export function formatExcelExport(data: ExportData, dataType?: string): Blob {
  const workbook = XLSX.utils.book_new();
  
  // Create metadata worksheet
  const metadataSheet = XLSX.utils.aoa_to_sheet([
    ['Export Information'],
    ['Title', data.title],
    ['Generated By', 'Beekon AI'],
    ['Exported At', new Date(data.exportedAt).toLocaleString()],
    ['Total Records', data.totalRecords.toString()],
    ...(data.dateRange ? [
      ['Date Range Start', new Date(data.dateRange.start).toLocaleDateString()],
      ['Date Range End', new Date(data.dateRange.end).toLocaleDateString()]
    ] : []),
    [''],
    ...(data.filters && Object.keys(data.filters).length > 0 ? [
      ['Applied Filters'],
      ...Object.entries(data.filters).map(([key, value]) => [
        key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        String(value)
      ])
    ] : [])
  ]);
  
  XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Export Info');
  
  // Create main data worksheet
  if (Array.isArray(data.data)) {
    const processedData = dataType ? applyFieldMapping(data.data, dataType) : data.data;
    
    if (processedData.length > 0) {
      const dataSheet = XLSX.utils.json_to_sheet(processedData);
      
      // Apply styling to headers
      const range = XLSX.utils.decode_range(dataSheet['!ref'] || 'A1:A1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!dataSheet[cellAddress]) continue;
        
        dataSheet[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'E2E8F0' } },
          alignment: { horizontal: 'center' }
        };
      }
      
      // Auto-size columns
      const columnWidths = Object.keys(processedData[0]).map(key => ({
        wch: Math.max(key.length, 15)
      }));
      dataSheet['!cols'] = columnWidths;
      
      XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');
    }
  } else if (typeof data.data === 'object') {
    const fieldMapping = dataType ? getFieldMapping(dataType) : {};
    const formattedData = Object.entries(data.data).map(([key, value]) => {
      const mapping = fieldMapping[key];
      const displayName = mapping?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const formattedValue = mapping ? formatValue(value, mapping) : String(value ?? '');
      
      return {
        Property: displayName,
        Value: formattedValue
      };
    });
    
    const dataSheet = XLSX.utils.json_to_sheet(formattedData);
    
    // Style headers
    dataSheet['A1'].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } } };
    dataSheet['B1'].s = { font: { bold: true }, fill: { fgColor: { rgb: 'E2E8F0' } } };
    
    // Auto-size columns
    dataSheet['!cols'] = [{ wch: 30 }, { wch: 50 }];
    
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');
  }
  
  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { 
    bookType: 'xlsx', 
    type: 'array',
    cellStyles: true
  });
  
  return new Blob([excelBuffer], { type: EXPORT_MIME_TYPES.excel });
}

// Format data for Word export using docx library for professional Word documents
export async function formatWordExport(data: ExportData, dataType?: string): Promise<Blob> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Document title
        new Paragraph({
          children: [
            new TextRun({
              text: data.title.toUpperCase(),
              bold: true,
              size: 32,
            }),
          ],
          alignment: "center",
          spacing: { after: 300 }
        }),
        
        // Subtitle
        new Paragraph({
          children: [
            new TextRun({
              text: "BEEKON AI REPORT",
              bold: true,
              size: 24,
            }),
          ],
          alignment: "center",
          spacing: { after: 600 }
        }),
        
        // Document metadata
        new Paragraph({
          children: [
            new TextRun({
              text: "Document Information",
              bold: true,
              size: 20,
            }),
          ],
          spacing: { after: 200 }
        }),
        
        new Paragraph({
          children: [
            new TextRun({ text: "Generated: ", bold: true }),
            new TextRun({ text: new Date(data.exportedAt).toLocaleString() }),
          ],
          spacing: { after: 100 }
        }),
        
        new Paragraph({
          children: [
            new TextRun({ text: "Total Records: ", bold: true }),
            new TextRun({ text: data.totalRecords.toLocaleString() }),
          ],
          spacing: { after: 100 }
        }),
        
        ...(data.dateRange ? [
          new Paragraph({
            children: [
              new TextRun({ text: "Date Range: ", bold: true }),
              new TextRun({ 
                text: `${new Date(data.dateRange.start).toLocaleDateString()} to ${new Date(data.dateRange.end).toLocaleDateString()}` 
              }),
            ],
            spacing: { after: 100 }
          })
        ] : []),
        
        // Add spacing before next section
        new Paragraph({
          children: [new TextRun({ text: "" })],
          spacing: { after: 300 }
        }),
        
        // Add filters section if present
        ...(data.filters && Object.keys(data.filters).length > 0 ? [
          new Paragraph({
            children: [
              new TextRun({
                text: "Applied Filters",
                bold: true,
                size: 20,
              }),
            ],
            spacing: { after: 200 }
          }),
          ...Object.entries(data.filters).map(([key, value]) => 
            new Paragraph({
              children: [
                new TextRun({ text: "• " }),
                new TextRun({ 
                  text: `${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: `,
                  bold: true 
                }),
                new TextRun({ text: String(value) }),
              ],
              spacing: { after: 100 }
            })
          ),
          new Paragraph({
            children: [new TextRun({ text: "" })],
            spacing: { after: 300 }
          })
        ] : []),
        
        // Data section header
        new Paragraph({
          children: [
            new TextRun({
              text: "Data",
              bold: true,
              size: 20,
            }),
          ],
          spacing: { after: 200 }
        }),
      ]
    }]
  });
  
  // Add data content
  const section = doc.sections[0];
  
  if (Array.isArray(data.data)) {
    const processedData = dataType ? applyFieldMapping(data.data, dataType) : data.data;
    
    if (processedData.length > 0) {
      const headers = Object.keys(processedData[0]);
      
      // Create table with data
      const tableRows = [
        // Header row
        new TableRow({
          children: headers.map(header => 
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: header,
                      bold: true
                    })
                  ]
                })
              ],
              width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE }
            })
          )
        }),
        // Data rows (limit to 100 for document size)
        ...processedData.slice(0, 100).map(row => 
          new TableRow({
            children: headers.map(header => 
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: String(row[header] ?? '')
                      })
                    ]
                  })
                ],
                width: { size: Math.floor(100 / headers.length), type: WidthType.PERCENTAGE }
              })
            )
          })
        )
      ];
      
      const table = new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE }
      });
      
      section.children.push(table);
      
      // Add note if data was truncated
      if (processedData.length > 100) {
        section.children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `... and ${processedData.length - 100} more records`,
                italics: true
              })
            ],
            spacing: { before: 200 }
          })
        );
      }
    }
  } else if (typeof data.data === 'object') {
    const fieldMapping = dataType ? getFieldMapping(dataType) : {};
    
    // Create a two-column table for key-value pairs
    const tableRows = Object.entries(data.data).map(([key, value]) => {
      const mapping = fieldMapping[key];
      const displayName = mapping?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const formattedValue = mapping ? formatValue(value, mapping) : String(value ?? '');
      
      return new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: displayName,
                    bold: true
                  })
                ]
              })
            ],
            width: { size: 30, type: WidthType.PERCENTAGE }
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: formattedValue
                  })
                ]
              })
            ],
            width: { size: 70, type: WidthType.PERCENTAGE }
          })
        ]
      });
    });
    
    const table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    });
    
    section.children.push(table);
  }
  
  // Add footer
  section.children.push(
    new Paragraph({
      children: [new TextRun({ text: "" })],
      spacing: { before: 600, after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by Beekon AI - ${new Date().toLocaleDateString()}`,
          italics: true,
          size: 18
        })
      ],
      alignment: "center"
    })
  );
  
  // Generate Word document
  const buffer = await Packer.toBlob(doc);
  return new Blob([buffer], { type: EXPORT_MIME_TYPES.word });
}

// Helper function to format array data to CSV
function formatArrayToCsv(data: Record<string, unknown>[], dataType?: string): string {
  if (data.length === 0) return `"No data available"\n`;
  
  // Apply field mapping if dataType is provided
  const processedData = dataType ? applyFieldMapping(data, dataType) : data;
  
  // Get headers from the first object
  const headers = Object.keys(processedData[0]);
  
  // Create CSV header with proper quoting
  let csvContent = headers.map(header => `"${header}"`).join(",") + "\n";
  
  // Add data rows
  processedData.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      
      // Handle nested objects and arrays with smart serialization
      if (typeof value === 'object' && value !== null) {
        const serialized = serializeForExport(value, 500); // Allow more space in CSV
        return `"${serialized.replace(/"/g, '""')}"`;
      }
      
      // Convert to string and escape quotes
      const stringValue = String(value ?? '');
      return `"${stringValue.replace(/"/g, '""')}"`;
    });
    csvContent += values.join(",") + "\n";
  });
  
  return csvContent;
}

// Helper function to format object data to CSV
function formatObjectToCsv(data: Record<string, unknown>, dataType?: string): string {
  let csvContent = `"Property","Value"\n`;
  
  const fieldMapping = dataType ? getFieldMapping(dataType) : {};
  
  Object.entries(data).forEach(([key, value]) => {
    const mapping = fieldMapping[key];
    const displayName = mapping?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const formattedValue = mapping ? formatValue(value, mapping) : 
      (typeof value === 'object' && value !== null ? serializeForExport(value, 500) : String(value ?? ''));
    
    csvContent += `"${displayName}","${formattedValue.replace(/"/g, '""')}"\n`;
  });
  
  return csvContent;
}

// Helper function to format array data to PDF
function formatArrayToPdf(data: Record<string, unknown>[], dataType?: string): string {
  if (data.length === 0) return "No data available\n";
  
  // Apply field mapping if dataType is provided
  const processedData = dataType ? applyFieldMapping(data, dataType) : data;
  
  let pdfContent = "DATA RECORDS\n";
  pdfContent += "-".repeat(20) + "\n\n";
  
  processedData.forEach((item, index) => {
    pdfContent += `${(index + 1).toString().padStart(3, '0')}. RECORD\n`;
    pdfContent += "-".repeat(15) + "\n";
    
    Object.entries(item).forEach(([key, value]) => {
      const formattedKey = key.length > 25 ? key.substring(0, 25) + '...' : key;
      const formattedValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
      
      // Wrap long values
      if (formattedValue.length > 80) {
        const wrappedValue = formattedValue.match(/.{1,80}/g)?.join('\n    ') || formattedValue;
        pdfContent += `${formattedKey.padEnd(25)}: ${wrappedValue}\n`;
      } else {
        pdfContent += `${formattedKey.padEnd(25)}: ${formattedValue}\n`;
      }
    });
    
    pdfContent += "\n";
  });
  
  return pdfContent;
}

// Helper function to format object data to PDF
function formatObjectToPdf(data: Record<string, unknown>, dataType?: string): string {
  let pdfContent = "DATA SUMMARY\n";
  pdfContent += "-".repeat(20) + "\n\n";
  
  const fieldMapping = dataType ? getFieldMapping(dataType) : {};
  
  Object.entries(data).forEach(([key, value]) => {
    const mapping = fieldMapping[key];
    const displayName = mapping?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const formattedValue = mapping ? formatValue(value, mapping) : (typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? ''));
    
    const formattedKey = displayName.length > 25 ? displayName.substring(0, 25) + '...' : displayName;
    
    // Wrap long values
    if (formattedValue.length > 80) {
      const wrappedValue = formattedValue.match(/.{1,80}/g)?.join('\n    ') || formattedValue;
      pdfContent += `${formattedKey.padEnd(25)}: ${wrappedValue}\n`;
    } else {
      pdfContent += `${formattedKey.padEnd(25)}: ${formattedValue}\n`;
    }
  });
  
  return pdfContent;
}

// Export hook with consistent error handling and toast notifications
export function useExportHandler() {
  const handleExport = async (
    exportFunction: () => Promise<Blob>,
    config: ExportConfig
  ): Promise<ExportResult> => {
    try {
      // Show loading toast
      toast({
        title: "Preparing export...",
        description: `Generating ${config.format.toUpperCase()} file`,
      });
      
      // Execute export function
      const blob = await exportFunction();
      
      // Generate filename
      const filename = generateExportFilename(
        config.filename,
        config.format,
        {
          includeTimestamp: config.includeTimestamp,
          dateRange: config.dateRange,
        }
      );
      
      // Download file
      const result = await downloadBlob(blob, filename, config.format);
      
      // Show success/error toast
      if (result.success) {
        const formatNote = config.format === 'pdf' 
          ? ' (Note: PDF exports are in readable text format)'
          : '';
        toast({
          title: "Export successful",
          description: `${filename} has been downloaded${formatNote}`,
        });
      } else {
        toast({
          title: "Export failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      toast({
        title: "Export failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      return {
        success: false,
        filename: config.filename,
        format: config.format,
        error: errorMessage,
      };
    }
  };
  
  return { handleExport };
}

// Validate export data before processing
export function validateExportData(data: ExportData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate required fields
  if (!data.title?.trim()) {
    errors.push("Export title is required");
  }
  
  if (!data.exportedAt) {
    errors.push("Export timestamp is required");
  } else {
    const exportDate = new Date(data.exportedAt);
    if (isNaN(exportDate.getTime())) {
      errors.push("Invalid export timestamp");
    }
  }
  
  if (typeof data.totalRecords !== 'number' || data.totalRecords < 0) {
    errors.push("Total records must be a non-negative number");
  }
  
  // Validate data content
  if (!data.data) {
    errors.push("Export data is required");
  } else if (Array.isArray(data.data)) {
    if (data.data.length === 0 && data.totalRecords > 0) {
      errors.push("Data array is empty but total records indicates data should exist");
    }
    
    // Check for consistent data structure in arrays
    if (data.data.length > 0) {
      const firstItemKeys = Object.keys(data.data[0]);
      const hasInconsistentStructure = data.data.some((item, index) => {
        if (typeof item !== 'object' || item === null) {
          errors.push(`Data item at index ${index} is not a valid object`);
          return true;
        }
        return false;
      });
    }
  } else if (typeof data.data !== 'object') {
    errors.push("Export data must be an object or array");
  }
  
  // Validate date range if provided
  if (data.dateRange) {
    const start = new Date(data.dateRange.start);
    const end = new Date(data.dateRange.end);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push("Invalid date range");
    } else if (start >= end) {
      errors.push("Start date must be before end date");
    }
  }
  
  // Validate filters if provided
  if (data.filters && typeof data.filters !== 'object') {
    errors.push("Filters must be an object");
  }
  
  // Validate metadata if provided
  if (data.metadata && typeof data.metadata !== 'object') {
    errors.push("Metadata must be an object");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Validate export configuration
export function validateExportConfig(config: ExportConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.filename.trim()) {
    errors.push("Filename is required");
  }
  
  // Check for invalid filename characters
  const invalidChars = /[<>:"/\\|?*]/g;
  if (invalidChars.test(config.filename)) {
    errors.push("Filename contains invalid characters");
  }
  
  if (!Object.values(EXPORT_FILE_EXTENSIONS).includes(EXPORT_FILE_EXTENSIONS[config.format])) {
    errors.push("Invalid export format");
  }
  
  if (config.dateRange) {
    const start = new Date(config.dateRange.start);
    const end = new Date(config.dateRange.end);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push("Invalid date range");
    } else if (start >= end) {
      errors.push("Start date must be before end date");
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Sanitize export data to prevent potential issues
export function sanitizeExportData(data: ExportData): ExportData {
  const sanitized: ExportData = {
    ...data,
    title: data.title?.trim() || 'Untitled Export',
    exportedAt: data.exportedAt || new Date().toISOString(),
    totalRecords: Math.max(0, data.totalRecords || 0),
  };
  
  // Sanitize data content
  if (Array.isArray(data.data)) {
    sanitized.data = data.data.map(item => {
      if (typeof item === 'object' && item !== null) {
        const sanitizedItem: Record<string, unknown> = {};
        Object.entries(item).forEach(([key, value]) => {
          // Replace null/undefined with empty string for better export compatibility
          sanitizedItem[key] = value ?? '';
        });
        return sanitizedItem;
      }
      return item;
    });
  } else if (typeof data.data === 'object' && data.data !== null) {
    const sanitizedData: Record<string, unknown> = {};
    Object.entries(data.data).forEach(([key, value]) => {
      sanitizedData[key] = value ?? '';
    });
    sanitized.data = sanitizedData;
  }
  
  return sanitized;
}

// Get export format display name
export function getExportFormatDisplayName(format: ExportFormat): string {
  const displayNames: Record<ExportFormat, string> = {
    pdf: "PDF Document",
    csv: "CSV Spreadsheet",
    json: "JSON Data",
    excel: "Excel Spreadsheet",
    word: "Word Document",
  };
  
  return displayNames[format] || format.toUpperCase();
}

// Calculate estimated file size based on data
export function estimateExportSize(data: unknown, format: ExportFormat): string {
  const dataSize = JSON.stringify(data).length;
  
  // Rough size multipliers for different formats
  const sizeMultipliers: Record<ExportFormat, number> = {
    json: 1,
    csv: 0.7,
    pdf: 1.5,
    excel: 2,
    word: 3,
  };
  
  const estimatedBytes = dataSize * sizeMultipliers[format];
  
  if (estimatedBytes < 1024) {
    return `${Math.round(estimatedBytes)} B`;
  } else if (estimatedBytes < 1024 * 1024) {
    return `${Math.round(estimatedBytes / 1024)} KB`;
  } else {
    return `${Math.round(estimatedBytes / (1024 * 1024))} MB`;
  }
}