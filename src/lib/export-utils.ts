// Unified export utilities for consistent export functionality across the application

import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";

// Export format types - import from database types for consistency
import type { ExportFormat } from "@/types/database";

// Re-export for external use
export type { ExportFormat };

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

// Enhanced field mappings with business-friendly names and proper formatting
export const COMMON_FIELD_MAPPINGS: Record<string, FieldMapping> = {
  website: {
    category: { displayName: 'Category', format: 'text', description: 'Data category grouping', width: 150 },
    metric: { displayName: 'Metric Name', format: 'text', description: 'Specific metric or field name', width: 200 },
    value: { displayName: 'Value', format: 'auto', description: 'Metric value or data', width: 150 },
    unit: { displayName: 'Unit/Type', format: 'text', description: 'Unit of measurement or data type', width: 120 },
    websiteId: { displayName: 'Website ID', format: 'text', description: 'Associated website identifier', width: 120 },
  },
  competitor: {
    id: { displayName: 'Competitor ID', format: 'text', description: 'Unique identifier' },
    competitor_domain: { displayName: 'Competitor URL', format: 'url', description: 'Competitor domain', width: 200 },
    competitor_name: { displayName: 'Company Name', format: 'text', description: 'Competitor name', width: 150 },
    is_active: { displayName: 'Status', format: 'boolean', description: 'Active status', width: 80 },
    created_at: { displayName: 'Date Added', format: 'date', description: 'Date added', width: 120 },
    updated_at: { displayName: 'Last Updated', format: 'date', description: 'Date last updated', width: 120 },
    shareOfVoice: { displayName: 'Share of Voice', format: 'percentage', description: 'Share of voice percentage', width: 120 },
    averageRank: { displayName: 'Average Ranking', format: 'rank', description: 'Average ranking position', width: 100 },
    mentionCount: { displayName: 'Total Mentions', format: 'number', description: 'Total mentions', width: 100 },
    sentimentScore: { displayName: 'Sentiment Score', format: 'percentage', description: 'Average sentiment', width: 120 },
    analysisStatus: { displayName: 'Analysis Status', format: 'text', description: 'Current analysis status', width: 120 },
  },
  analysis: {
    id: { displayName: 'Analysis ID', format: 'text', description: 'Unique identifier' },
    prompt: { displayName: 'Search Query', format: 'text', description: 'Analysis prompt', width: 300 },
    topic: { displayName: 'Topic', format: 'text', description: 'Analysis topic', width: 150 },
    website_id: { displayName: 'Website', format: 'text', description: 'Associated website' },
    status: { displayName: 'Status', format: 'text', description: 'Analysis status', width: 100 },
    confidence: { displayName: 'Confidence Score', format: 'percentage', description: 'Confidence score', width: 100 },
    created_at: { displayName: 'Analysis Date', format: 'datetime', description: 'Date created', width: 150 },
    updated_at: { displayName: 'Last Updated', format: 'datetime', description: 'Date last updated', width: 150 },
    llm_provider: { displayName: 'AI Provider', format: 'text', description: 'AI provider used', width: 120 },
    is_mentioned: { displayName: 'Website Mentioned', format: 'boolean', description: 'Whether mentioned', width: 100 },
    rank_position: { displayName: 'Ranking Position', format: 'rank', description: 'Ranking position', width: 100 },
    sentiment_score: { displayName: 'Sentiment Score', format: 'percentage', description: 'Sentiment score', width: 100 },
    summary_text: { displayName: 'Summary', format: 'text', description: 'Analysis summary', width: 400 },
    response_text: { displayName: 'Full Response', format: 'text', description: 'Complete response', width: 500 },
  },
  dashboard: {
    category: { displayName: 'Category', format: 'text', description: 'Data category', width: 120 },
    metric: { displayName: 'Metric Name', format: 'text', description: 'Performance metric', width: 200 },
    value: { displayName: 'Value', format: 'auto', description: 'Metric value', width: 120 },
    unit: { displayName: 'Unit', format: 'text', description: 'Unit or status information', width: 120 },
    details: { displayName: 'Additional Details', format: 'text', description: 'Extra information', width: 200 },
    // Enhanced mappings with proper formatting
    totalAnalyses: { displayName: 'Total Analyses', format: 'number', description: 'Total number of analyses', width: 120 },
    averageConfidence: { displayName: 'Confidence Score', format: 'percentage', description: 'Average confidence score', width: 120 },
    averageSentiment: { displayName: 'Sentiment Score', format: 'percentage', description: 'Average sentiment score', width: 120 },
    mentionRate: { displayName: 'Mention Rate', format: 'percentage', description: 'Percentage of mentions', width: 120 },
    topPerformingTopic: { displayName: 'Top Performing Topic', format: 'text', description: 'Best performing topic', width: 150 },
    totalWebsites: { displayName: 'Total Websites', format: 'number', description: 'Number of websites', width: 120 },
    activeWebsites: { displayName: 'Active Websites', format: 'number', description: 'Number of active websites', width: 120 },
    averageRank: { displayName: 'Average Ranking', format: 'rank', description: 'Average ranking position', width: 100 },
    trendDirection: { displayName: 'Performance Trend', format: 'text', description: 'Performance trend indicator', width: 100 },
    period: { displayName: 'Time Period', format: 'text', description: 'Analysis time period', width: 120 },
    overallVisibilityScore: { displayName: 'Visibility Score', format: 'percentage', description: 'Overall visibility score', width: 120 },
    sentimentScore: { displayName: 'Sentiment Score', format: 'percentage', description: 'Sentiment score', width: 120 },
    averageRanking: { displayName: 'Average Ranking', format: 'rank', description: 'Average ranking position', width: 100 },
    totalMentions: { displayName: 'Total Mentions', format: 'number', description: 'Total number of mentions', width: 120 },
    visibility: { displayName: 'Visibility Score', format: 'percentage', description: 'Topic visibility score', width: 120 },
    sentiment: { displayName: 'Sentiment', format: 'percentage', description: 'Topic sentiment score', width: 120 },
    mentions: { displayName: 'Mentions', format: 'number', description: 'Number of mentions', width: 100 },
    ranking: { displayName: 'Ranking', format: 'rank', description: 'Ranking position', width: 100 },
  },
  // Add specific mappings for export types
  export_summary: {
    reportTitle: { displayName: 'Report Title', format: 'text', description: 'Export report title', width: 200 },
    generatedAt: { displayName: 'Generated', format: 'datetime', description: 'Export generation time', width: 150 },
    totalRecords: { displayName: 'Total Records', format: 'number', description: 'Number of records exported', width: 120 },
    exportFormat: { displayName: 'Format', format: 'text', description: 'Export file format', width: 100 },
    fileSize: { displayName: 'File Size', format: 'text', description: 'Approximate file size', width: 100 },
  },
  performance_metrics: {
    metric_name: { displayName: 'Performance Metric', format: 'text', description: 'Name of the metric', width: 180 },
    current_value: { displayName: 'Current Value', format: 'auto', description: 'Current metric value', width: 120 },
    previous_value: { displayName: 'Previous Value', format: 'auto', description: 'Previous period value', width: 120 },
    change_percent: { displayName: 'Change %', format: 'percentage', description: 'Percentage change', width: 100 },
    trend_direction: { displayName: 'Trend', format: 'text', description: 'Trend direction', width: 80 },
    benchmark: { displayName: 'Benchmark', format: 'auto', description: 'Industry benchmark', width: 120 },
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
};

// File extension mappings
export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: "pdf",
  csv: "csv",
  json: "json",
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
    // Element dimensions check for fallback sizing
    if (elementRect.width === 0 || elementRect.height === 0) {
      // Use fallback sizing when element dimensions are zero
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
    // Chart capture failed
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
    
    // Failed to capture chart
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

// Enhanced value formatting with intelligent type detection and business-friendly output
export function formatValue(value: unknown, fieldMapping?: FieldMapping[string]): string {
  if (value === null || value === undefined) return '';
  
  const format = fieldMapping?.format || 'auto';
  
  // Auto-detect format if not specified
  let detectedFormat = format;
  if (format === 'auto' || format === 'text') {
    const stringValue = String(value);
    
    // Detect percentages (ends with % or is a decimal between 0-1)
    if (stringValue.endsWith('%') || (typeof value === 'number' && value >= 0 && value <= 1 && value !== Math.floor(value))) {
      detectedFormat = 'percentage';
    }
    // Detect large numbers (likely counts)
    else if (typeof value === 'number' && value > 1 && value === Math.floor(value)) {
      detectedFormat = 'number';
    }
    // Detect dates
    else if (!isNaN(Date.parse(stringValue)) && stringValue.length > 8) {
      detectedFormat = 'date';
    }
    // Detect URLs
    else if (stringValue.startsWith('http') || stringValue.includes('.com') || stringValue.includes('.org')) {
      detectedFormat = 'url';
    }
    // Detect boolean-like values
    else if (['true', 'false', 'yes', 'no', 'active', 'inactive', 'enabled', 'disabled'].includes(stringValue.toLowerCase())) {
      detectedFormat = 'boolean';
    }
  }
  
  switch (detectedFormat) {
    case 'percentage': {
      let numValue: number;
      
      // Handle percentage strings (e.g., "85.3%")
      if (String(value).endsWith('%')) {
        numValue = parseFloat(String(value).replace('%', ''));
      } else {
        numValue = parseFloat(String(value));
        // Convert decimal to percentage if it's between 0-1
        if (numValue >= 0 && numValue <= 1 && numValue !== Math.floor(numValue)) {
          numValue *= 100;
        }
      }
      
      return isNaN(numValue) ? '0.0%' : `${numValue.toFixed(1)}%`;
    }
    
    case 'number': {
      const num = parseFloat(String(value));
      if (isNaN(num)) return '0';
      
      // Format based on magnitude for better readability
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
      } else if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
      } else if (num === Math.floor(num)) {
        return num.toLocaleString();
      } else {
        return num.toFixed(2);
      }
    }
    
    case 'currency': {
      const currencyNum = parseFloat(String(value));
      if (isNaN(currencyNum)) return '$0.00';
      
      // Format currency with appropriate precision
      if (currencyNum >= 1000000) {
        return `$${(currencyNum / 1000000).toFixed(1)}M`;
      } else if (currencyNum >= 1000) {
        return `$${(currencyNum / 1000).toFixed(1)}K`;
      } else {
        return `$${currencyNum.toFixed(2)}`;
      }
    }
    
    case 'date': {
      const date = new Date(String(value));
      if (isNaN(date.getTime())) return '';
      
      // Return formatted date based on recency
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 1) {
        return 'Today';
      } else if (diffDays <= 7) {
        return date.toLocaleDateString('en-US', { weekday: 'long' });
      } else {
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      }
    }
    
    case 'datetime': {
      const datetime = new Date(String(value));
      if (isNaN(datetime.getTime())) return '';
      
      return datetime.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    case 'boolean': {
      const stringValue = String(value).toLowerCase();
      
      // Enhanced boolean detection
      if (['true', '1', 'yes', 'active', 'enabled', 'on'].includes(stringValue)) {
        return '✓ Yes';
      } else if (['false', '0', 'no', 'inactive', 'disabled', 'off'].includes(stringValue)) {
        return '✗ No';
      } else if (value === true) {
        return '✓ Yes';
      } else if (value === false) {
        return '✗ No';
      }
      return String(value);
    }
    
    case 'url': {
      const url = String(value);
      // Truncate long URLs for better readability
      if (url.length > 50) {
        const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        return `${domain}...`;
      }
      return url;
    }
    
    case 'rank':
    case 'position': {
      const num = parseFloat(String(value));
      if (isNaN(num)) return 'N/A';
      
      // Add ordinal suffix
      const suffix = num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th';
      return `${Math.round(num)}${suffix}`;
    }
    
    case 'score': {
      const num = parseFloat(String(value));
      if (isNaN(num)) return '0.0';
      
      // Format score out of 100 or 10
      if (num <= 10) {
        return `${num.toFixed(1)}/10`;
      } else {
        return `${num.toFixed(1)}/100`;
      }
    }
    
    case 'duration': {
      const num = parseFloat(String(value));
      if (isNaN(num)) return '0s';
      
      // Convert to human-readable duration
      if (num >= 86400) {
        return `${Math.round(num / 86400)}d`;
      } else if (num >= 3600) {
        return `${Math.round(num / 3600)}h`;
      } else if (num >= 60) {
        return `${Math.round(num / 60)}m`;
      } else {
        return `${Math.round(num)}s`;
      }
    }
    
    default: {
      // Enhanced object/array handling
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          // Format arrays as readable lists
          if (value.length === 0) return 'None';
          if (value.length <= 3) return value.join(', ');
          return `${value.slice(0, 3).join(', ')} (+ ${value.length - 3} more)`;
        } else {
          // Format objects as key-value pairs
          const entries = Object.entries(value);
          if (entries.length === 0) return 'Empty';
          if (entries.length === 1) return `${entries[0][0]}: ${entries[0][1]}`;
          return `${entries.length} properties`;
        }
      }
      
      // Handle primitives with cleanup
      const stringValue = String(value);
      
      // Clean up common technical strings
      return stringValue
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to spaced
        .replace(/_/g, ' ') // underscores to spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // capitalize words
    }
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

      // Prepare blob for download

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
        // file-saver failed, falling back to manual download
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
            // Cleanup error occurred
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
      // Download failed
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

// Shared data transformation function for consistent export processing
export function transformExportData(data: Record<string, unknown>[]): Record<string, unknown>[] {
  if (!data || data.length === 0) {
    return data;
  }
  
  // Check if data has the flattened category/metric/value structure
  const hasCategoryMetricStructure = data.every(item => 
    item && 
    typeof item === 'object' &&
    'metric' in item && 
    'value' in item
  );
  
  if (hasCategoryMetricStructure) {
    // Transform to standardized column structure for consistency
    const transformedData = data.map(item => {
      const baseData = {
        'Metric': String(item.metric || ''),
        'Value': String(item.value || ''),
        'Unit/Type': String(item.unit || ''),
        'Additional Info': item.details ? String(item.details) : ''
      };
      
      // Add Website ID column if present
      if (item.websiteId) {
        baseData['Website ID'] = String(item.websiteId);
      }
      
      return baseData;
    }).filter(row => row.Metric.trim() !== ''); // Remove empty rows
    
    return transformedData;
  }
  
  // Return data as-is for non-standardized structures
  return data;
}

// Helper function to create hierarchical CSV sections
function createCsvSection(title: string, data: Record<string, unknown>[], includeHeaders: boolean = true): string {
  let section = `\n"=== ${title.toUpperCase()} ==="\n`;
  
  if (data.length === 0) {
    section += `"No data available"\n`;
    return section;
  }
  
  // Apply shared transformation for consistent formatting
  const transformedData = transformExportData(data);
  
  if (transformedData !== data) {
    // Use standardized column format from transformation
    const headers = Object.keys(transformedData[0]);
    if (includeHeaders) {
      section += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    }
    
    transformedData.forEach(row => {
      const values = headers.map(header => {
        const value = String(row[header] || '').replace(/"/g, '""');
        return `"${value}"`;
      });
      section += values.join(',') + '\n';
    });
  } else {
    // Standard table format for other data
    const headers = Object.keys(data[0]);
    if (includeHeaders) {
      section += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    }
    
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        
        // Better object/array handling
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            return `"${value.join('; ').replace(/"/g, '""')}"`;
          } else {
            // Convert objects to readable key-value pairs instead of JSON
            const objectStr = Object.entries(value)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ');
            return `"${objectStr.replace(/"/g, '""')}"`;
          }
        }
        
        // Handle primitives
        const stringValue = String(value ?? '');
        return `"${stringValue.replace(/"/g, '""')}"`;
      });
      section += values.join(',') + '\n';
    });
  }
  
  return section;
}

// Enhanced CSV export with hierarchical structure and business-friendly formatting
export function formatCsvExport(data: ExportData, dataType?: string): Blob {
  let csvContent = '';
  
  // Executive Summary Header
  csvContent += `"${data.title}"\n`;
  csvContent += `"Generated by Beekon AI"\n`;
  csvContent += `"Report Date: ${new Date(data.exportedAt).toLocaleDateString()}"\n`;
  csvContent += `"Report Time: ${new Date(data.exportedAt).toLocaleTimeString()}"\n`;
  csvContent += `"Total Records: ${data.totalRecords.toLocaleString()}"\n`;
  
  // Report Period Section
  if (data.dateRange) {
    const startDate = new Date(data.dateRange.start).toLocaleDateString();
    const endDate = new Date(data.dateRange.end).toLocaleDateString();
    csvContent += `\n"=== REPORT PERIOD ==="\n`;
    csvContent += `"Start Date","${startDate}"\n`;
    csvContent += `"End Date","${endDate}"\n`;
    csvContent += `"Period Duration","${Math.ceil((new Date(data.dateRange.end).getTime() - new Date(data.dateRange.start).getTime()) / (1000 * 60 * 60 * 24))} days"\n`;
  }
  
  // Filters Section
  if (data.filters && Object.keys(data.filters).length > 0) {
    csvContent += `\n"=== APPLIED FILTERS ==="\n`;
    csvContent += `"Filter","Value"\n`;
    Object.entries(data.filters).forEach(([key, value]) => {
      const cleanKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const cleanValue = Array.isArray(value) ? value.join(', ') : String(value);
      csvContent += `"${cleanKey}","${cleanValue.replace(/"/g, '""')}"\n`;
    });
  }
  
  // Main Data Sections
  if (Array.isArray(data.data) && data.data.length > 0) {
    const processedData = dataType ? applyFieldMapping(data.data, dataType) : data.data;
    
    // Check if data has categories for organized sections
    const hasCategories = processedData.some(item => 'category' in item);
    
    if (hasCategories) {
      const groupedData = groupDataByCategory(processedData);
      
      // Define section order for logical flow (aligned with XLSX sheet order)
      const sectionOrder = [
        'Summary', 'Website Info', 'Performance Metrics', 'Analysis History',
        'Performance', 'Websites', 'Top Topics', 'Performance by Topics',
        'LLM Performance', 'Time Series', 'Website Performance', 'Metrics'
      ];
      
      // Create organized sections
      sectionOrder.forEach(category => {
        if (groupedData[category] && groupedData[category].length > 0) {
          csvContent += createCsvSection(category, groupedData[category]);
        }
      });
      
      // Add remaining categories
      Object.keys(groupedData).forEach(category => {
        if (!sectionOrder.includes(category) && groupedData[category].length > 0) {
          csvContent += createCsvSection(category, groupedData[category]);
        }
      });
      
    } else {
      // Single data section for non-categorized data
      csvContent += createCsvSection('Data', processedData);
    }
    
  } else if (typeof data.data === 'object') {
    // Handle object data as key-value pairs
    const fieldMapping = dataType ? getFieldMapping(dataType) : {};
    
    csvContent += `\n"=== CONFIGURATION DATA ==="\n`;
    csvContent += `"Property","Value","Data Type"\n`;
    
    Object.entries(data.data)
      .filter(([key, value]) => value !== undefined && value !== null)
      .forEach(([key, value]) => {
        const mapping = fieldMapping[key];
        const displayName = mapping?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        let formattedValue: string;
        let dataType: string;
        
        if (mapping) {
          formattedValue = formatValue(value, mapping);
          dataType = mapping.format || 'text';
        } else {
          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              formattedValue = value.join('; ');
              dataType = 'array';
            } else {
              formattedValue = Object.entries(value)
                .map(([k, v]) => `${k}: ${v}`)
                .join('; ');
              dataType = 'object';
            }
          } else {
            formattedValue = String(value ?? '');
            dataType = typeof value;
          }
        }
        
        csvContent += `"${displayName}","${formattedValue.replace(/"/g, '""')}","${dataType}"\n`;
      });
  }
  
  // Footer Section
  csvContent += `\n"=== EXPORT INFORMATION ==="\n`;
  csvContent += `"Generated by","Beekon AI Analytics Platform"\n`;
  csvContent += `"Export Format","CSV (Comma Separated Values)"\n`;
  csvContent += `"File Encoding","UTF-8"\n`;
  csvContent += `"Export Timestamp","${new Date().toISOString()}"\n`;
  
  if (data.metadata) {
    csvContent += `"Workspace ID","${data.metadata.workspaceId || 'N/A'}"\n`;
    csvContent += `"Analysis Count","${data.metadata.analysisCount || 'N/A'}"\n`;
  }
  
  // Add UTF-8 BOM for better CSV compatibility
  const BOM = '\uFEFF';
  return new Blob([BOM + csvContent], { type: EXPORT_MIME_TYPES.csv });
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
      const hasCategoryField = processedData.some(item => 'category' in item || 'Category' in item);
      
      if (hasCategoryField) {
        // Group data by category for organized sections
        const categoryKey = 'category' in processedData[0] ? 'category' : 'Category';
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
        // Failed to add chart to PDF
        
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

// Helper function to group data by category for multi-sheet organization
function groupDataByCategory(data: Record<string, unknown>[]): Record<string, Record<string, unknown>[]> {
  const grouped: Record<string, Record<string, unknown>[]> = {};
  
  data.forEach(item => {
    const category = String(item.category || 'General');
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(item);
  });
  
  return grouped;
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