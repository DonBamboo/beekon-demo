// Enhanced export service with additional formats and features

import { supabase } from "@/integrations/supabase/client";
import {
  ExportData,
  ExportConfig,
  formatJsonExport,
  formatCsvExport,
  formatPdfExport,
  generateExportFilename,
  applyFieldMapping,
  getFieldMapping,
  formatValue,
  validateExportData,
  sanitizeExportData,
  ChartInfo,
} from "@/lib/export-utils";
import type { ExportFormat } from "@/types/database";
import { exportHistoryService } from "./exportHistoryService";
import { ExportType, ExportHistoryRecord } from "@/types/database";

// Export service class with enhanced functionality
export class ExportService {
  private static instance: ExportService;
  
  public static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
  }

  // Format array data for Word
  private formatArrayToWord(data: Record<string, unknown>[]): string {
    if (data.length === 0) return "No data available\n";
    
    let wordContent = "Data Records\n";
    wordContent += "-".repeat(20) + "\n\n";
    
    data.forEach((item, index) => {
      wordContent += `${index + 1}. Record\n`;
      wordContent += "-".repeat(15) + "\n";
      
      Object.entries(item).forEach(([key, value]) => {
        const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        let formattedValue: string;
        
        if (typeof value === 'object' && value !== null) {
          formattedValue = JSON.stringify(value, null, 2);
        } else if (value instanceof Date) {
          formattedValue = value.toLocaleString();
        } else {
          formattedValue = String(value ?? '');
        }
        
        wordContent += `${formattedKey}: ${formattedValue}\n`;
      });
      
      wordContent += "\n";
    });
    
    return wordContent;
  }

  // Format object data for Word
  private formatObjectToWord(data: Record<string, unknown>): string {
    let wordContent = "Data Summary\n";
    wordContent += "-".repeat(20) + "\n\n";
    
    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      let formattedValue: string;
      
      if (typeof value === 'object' && value !== null) {
        formattedValue = JSON.stringify(value, null, 2);
      } else if (value instanceof Date) {
        formattedValue = value.toLocaleString();
      } else {
        formattedValue = String(value ?? '');
      }
      
      wordContent += `${formattedKey}: ${formattedValue}\n`;
    });
    
    return wordContent;
  }

  // Main export function with support for all formats and history tracking
  async exportData(
    data: ExportData,
    format: ExportFormat,
    options: {
      trackHistory?: boolean;
      exportType?: ExportType;
      customFilename?: string;
      charts?: ChartInfo[];
    } = {}
  ): Promise<Blob> {
    const { trackHistory = true, exportType = "filtered_data", customFilename, charts } = options;
    
    // Validate export data before processing
    const validation = validateExportData(data);
    if (!validation.isValid) {
      throw new Error(`Export validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Sanitize data to prevent issues
    const sanitizedData = sanitizeExportData(data);
    
    let exportRecord: ExportHistoryRecord | null = null;
    let historyTrackingFailed = false;
    
    try {
      // Create export history record if tracking is enabled
      if (trackHistory) {
        try {
          const filename = customFilename || generateExportFilename(
            data.title.toLowerCase().replace(/\s+/g, '_'),
            format,
            { 
              includeTimestamp: true, 
              dateRange: data.dateRange 
            }
          );
          
          exportRecord = await exportHistoryService.createExportRecord({
            export_type: exportType,
            format,
            filename,
            filters: data.filters,
            date_range: data.dateRange,
            metadata: {
              ...data.metadata,
              total_records: data.totalRecords,
              export_title: data.title,
            },
          });
          
          // Mark as processing
          await exportHistoryService.startExportProcessing(exportRecord.id, {
            processing_started: new Date().toISOString(),
          });
        } catch (historyError) {
          console.warn("Export history tracking failed, continuing with export:", historyError);
          historyTrackingFailed = true;
          // Continue with export despite history tracking failure
        }
      }
      
      // Generate the export
      let blob: Blob;
      switch (format) {
        case "json":
          blob = formatJsonExport(sanitizedData);
          break;
        case "csv":
          blob = formatCsvExport(sanitizedData, sanitizedData.dataType);
          break;
        case "pdf":
          blob = formatPdfExport(sanitizedData, sanitizedData.dataType, charts);
          break;
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      // Mark as completed if tracking is enabled and not failed
      if (trackHistory && exportRecord && !historyTrackingFailed) {
        try {
          await exportHistoryService.completeExport(
            exportRecord.id,
            blob.size,
            {
              processing_completed: new Date().toISOString(),
              actual_size: blob.size,
              content_type: blob.type,
            }
          );
        } catch (historyError) {
          console.warn("Failed to update export history as completed:", historyError);
          // Don't fail the export if history update fails
        }
      }
      
      return blob;
    } catch (error) {
      // Mark as failed if tracking is enabled and record exists
      if (trackHistory && exportRecord && !historyTrackingFailed) {
        try {
          await exportHistoryService.failExport(
            exportRecord.id,
            error instanceof Error ? error.message : "Unknown error",
            {
              error_details: error instanceof Error ? error.stack : undefined,
              failed_at: new Date().toISOString(),
            }
          );
        } catch (historyError) {
          console.warn("Failed to update export history as failed:", historyError);
          // Don't mask the original error
        }
      }
      
      throw error;
    }
  }

  // Export website data (for Websites page)
  async exportWebsiteData(
    websiteIds: string[],
    format: ExportFormat,
    options: {
      includeMetrics?: boolean;
      includeAnalysisHistory?: boolean;
      dateRange?: { start: string; end: string };
    } = {}
  ): Promise<Blob> {
    const { includeMetrics = true, includeAnalysisHistory = false, dateRange } = options;

    // Fetch website data
    const { data: websites, error } = await supabase
      .schema("beekon_data")
      .from("websites")
      .select(`
        id,
        domain,
        display_name,
        created_at,
        updated_at,
        is_active,
        crawl_status,
        last_crawled_at,
        workspace_id
      `)
      .in("id", websiteIds);

    if (error) throw error;

    let exportData: Record<string, unknown>[] = websites || [];

    // Add metrics if requested
    if (includeMetrics) {
      const metricsPromises = websiteIds.map(async (websiteId) => {
        let metricsQuery = supabase
          .schema("beekon_data")
          .from("llm_analysis_results")
          .select(`
            confidence_score,
            sentiment_score,
            is_mentioned,
            rank_position,
            created_at,
            prompts!inner(
              topics!inner(
                website_id,
                topic_name
              )
            )
          `)
          .eq("prompts.topics.website_id", websiteId);

        if (dateRange) {
          metricsQuery = metricsQuery
            .gte("created_at", dateRange.start)
            .lte("created_at", dateRange.end);
        }

        const { data: metrics } = await metricsQuery;
        return { websiteId, metrics: metrics || [] };
      });

      const metricsResults = await Promise.all(metricsPromises);
      
      // Flatten website data with metrics for tabular export format
      exportData = websites?.flatMap((website) => {
        const websiteMetrics = metricsResults.find(m => m.websiteId === website.id);
        
        // Calculate metrics
        const totalAnalyses = websiteMetrics?.metrics.length || 0;
        const averageConfidence = websiteMetrics?.metrics.reduce((sum, m) => sum + (m.confidence_score || 0), 0) / (websiteMetrics?.metrics.length || 1) || 0;
        const averageSentiment = websiteMetrics?.metrics.reduce((sum, m) => sum + (m.sentiment_score || 0), 0) / (websiteMetrics?.metrics.length || 1) || 0;
        const mentionRate = (websiteMetrics?.metrics.filter(m => m.is_mentioned).length || 0) / (websiteMetrics?.metrics.length || 1) * 100;
        const averageRank = websiteMetrics?.metrics.reduce((sum, m) => sum + (m.rank_position || 0), 0) / (websiteMetrics?.metrics.length || 1) || 0;
        
        // Return flattened tabular data - each row represents one data point
        return [
          // Website basic info
          { category: "Website Info", metric: "Website Name", value: website.display_name || website.domain, unit: "text", websiteId: website.id },
          { category: "Website Info", metric: "Domain URL", value: website.domain, unit: "url", websiteId: website.id },
          { category: "Website Info", metric: "Active Status", value: website.is_active ? "Active" : "Inactive", unit: "status", websiteId: website.id },
          { category: "Website Info", metric: "Crawl Status", value: website.crawl_status || "Unknown", unit: "status", websiteId: website.id },
          { category: "Website Info", metric: "Date Added", value: new Date(website.created_at).toLocaleDateString(), unit: "date", websiteId: website.id },
          { category: "Website Info", metric: "Last Modified", value: new Date(website.updated_at).toLocaleDateString(), unit: "date", websiteId: website.id },
          { category: "Website Info", metric: "Last Analyzed", value: website.last_crawled_at ? new Date(website.last_crawled_at).toLocaleDateString() : "Never", unit: "date", websiteId: website.id },
          
          // Performance metrics
          { category: "Performance Metrics", metric: "Total Analyses", value: totalAnalyses.toString(), unit: "count", websiteId: website.id },
          { category: "Performance Metrics", metric: "Average Confidence", value: `${(averageConfidence * 100).toFixed(1)}%`, unit: "percentage", websiteId: website.id },
          { category: "Performance Metrics", metric: "Average Sentiment", value: `${(averageSentiment * 100).toFixed(1)}%`, unit: "percentage", websiteId: website.id },
          { category: "Performance Metrics", metric: "Mention Rate", value: `${mentionRate.toFixed(1)}%`, unit: "percentage", websiteId: website.id },
          { category: "Performance Metrics", metric: "Average Ranking", value: averageRank.toFixed(1), unit: "position", websiteId: website.id },
        ];
      }) || [];
    }

    // Add analysis history if requested
    if (includeAnalysisHistory) {
      const historyPromises = websiteIds.map(async (websiteId) => {
        let historyQuery = supabase
          .schema("beekon_data")
          .from("llm_analysis_results")
          .select(`
            created_at,
            llm_provider,
            is_mentioned,
            rank_position,
            confidence_score,
            sentiment_score,
            response_text,
            prompts!inner(
              prompt_text,
              topics!inner(
                website_id,
                topic_name
              )
            )
          `)
          .eq("prompts.topics.website_id", websiteId)
          .order("created_at", { ascending: false });

        if (dateRange) {
          historyQuery = historyQuery
            .gte("created_at", dateRange.start)
            .lte("created_at", dateRange.end);
        }

        const { data: history } = await historyQuery;
        return { websiteId, history: history || [] };
      });

      const historyResults = await Promise.all(historyPromises);
      
      // Add analysis history data to the flattened export format
      const historyData = historyResults.flatMap(({ websiteId, history }) => {
        if (!history || history.length === 0) {
          return [{ category: "Analysis History", metric: "History Status", value: "No analysis history available", unit: "text", websiteId }];
        }
        
        return history.slice(0, 5).map((analysis, index) => ({
          category: "Analysis History",
          metric: `Analysis #${index + 1}`,
          value: `${analysis.llm_provider} - ${analysis.is_mentioned ? 'Mentioned' : 'Not Mentioned'} - Rank: ${analysis.rank_position || 'N/A'}`,
          unit: `Confidence: ${((analysis.confidence_score || 0) * 100).toFixed(1)}%`,
          websiteId
        }));
      });
      
      exportData = [...exportData, ...historyData];
    }

    const exportContent: ExportData = {
      title: `Website Data Export`,
      data: exportData,
      exportedAt: new Date().toISOString(),
      totalRecords: exportData.length,
      filters: {
        includeMetrics,
        includeAnalysisHistory,
        websiteCount: websiteIds.length,
      },
      dateRange,
      dataType: "website", // Add dataType for field mapping
      metadata: {
        exportType: "website_data",
        generatedBy: "Beekon AI Export Service",
      },
    };

    return this.exportData(exportContent, format, { 
      exportType: "website", 
      customFilename: generateExportFilename("website_data", format, { 
        includeTimestamp: true, 
        dateRange 
      }) 
    });
  }

  // Export configuration data (for modals)
  async exportConfigurationData(
    configData: Record<string, unknown>,
    configType: "analysis" | "website_settings" | "workspace",
    format: ExportFormat
  ): Promise<Blob> {
    const exportContent: ExportData = {
      title: `${configType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} Configuration`,
      data: configData,
      exportedAt: new Date().toISOString(),
      totalRecords: Array.isArray(configData) ? configData.length : 1,
      dataType: configType, // Add dataType for field mapping
      metadata: {
        exportType: `${configType}_configuration`,
        generatedBy: "Beekon AI Export Service",
        configType,
      },
    };

    return this.exportData(exportContent, format, { 
      exportType: "configuration", 
      customFilename: generateExportFilename(`${configType}_config`, format, { 
        includeTimestamp: true 
      }) 
    });
  }

  // Export filtered data with advanced options
  async exportFilteredData(
    tableName: string,
    filters: Record<string, unknown>,
    format: ExportFormat,
    options: {
      selectFields?: string;
      orderBy?: string;
      limit?: number;
      dateRange?: { start: string; end: string };
      title?: string;
    } = {}
  ): Promise<Blob> {
    const {
      selectFields = "*",
      orderBy = "created_at",
      limit,
      dateRange,
      title = `${tableName} Export`,
    } = options;

    // Build query
    let query = supabase
      .schema("beekon_data")
      .from(tableName)
      .select(selectFields)
      .order(orderBy, { ascending: false });

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else {
          query = query.eq(key, value);
        }
      }
    });

    // Apply date range
    if (dateRange) {
      query = query
        .gte("created_at", dateRange.start)
        .lte("created_at", dateRange.end);
    }

    // Apply limit
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    const exportContent: ExportData = {
      title,
      data: data || [],
      exportedAt: new Date().toISOString(),
      totalRecords: data?.length || 0,
      filters,
      dateRange,
      dataType: tableName, // Use table name as dataType for field mapping
      metadata: {
        exportType: "filtered_data",
        tableName,
        generatedBy: "Beekon AI Export Service",
      },
    };

    return this.exportData(exportContent, format, { 
      exportType: "filtered_data", 
      customFilename: generateExportFilename(tableName, format, { 
        includeTimestamp: true, 
        dateRange 
      }) 
    });
  }
}

// Export singleton instance
export const exportService = ExportService.getInstance();