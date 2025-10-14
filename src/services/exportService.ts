// Enhanced export service with additional formats and features

import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import {
  ExportData,
  formatJsonExport,
  formatCsvExport,
  formatPdfExport,
  generateExportFilename,
  validateExportData,
  sanitizeExportData,
  ChartInfo,
} from "@/lib/export-utils";
import type { ExportFormat } from "@/types/database";
import { exportHistoryService } from "./exportHistoryService";
import { ExportType, ExportHistoryRecord } from "@/types/database";
import { Json } from "@/integrations/supabase/types";

// Export service class with enhanced functionality
export class ExportService {
  private static instance: ExportService;

  public static getInstance(): ExportService {
    if (!ExportService.instance) {
      ExportService.instance = new ExportService();
    }
    return ExportService.instance;
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
    const {
      trackHistory = true,
      exportType = "filtered_data",
      customFilename,
      charts,
    } = options;

    // Validate export data before processing
    const validation = validateExportData(data);
    if (!validation.isValid) {
      throw new Error(
        `Export validation failed: ${validation.errors.join(", ")}`
      );
    }

    // Sanitize data to prevent issues
    const sanitizedData = sanitizeExportData(data);

    let exportRecord: ExportHistoryRecord | null = null;
    let historyTrackingFailed = false;

    try {
      // Create export history record if tracking is enabled
      if (trackHistory) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            throw new Error("User not authenticated");
          }

          const filename =
            customFilename ||
            generateExportFilename(
              data.title.toLowerCase().replace(/\s+/g, "_"),
              format,
              {
                includeTimestamp: true,
                dateRange: data.dateRange,
              }
            );

          exportRecord = await exportHistoryService.createExportRecord({
            export_type: exportType,
            format,
            filename,
            filters: data.filters as Json,
            date_range: data.dateRange,
            user_id: user.id,
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
          // Export history tracking failed, continuing with export
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
          // Failed to update export history as completed
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
          // Failed to update export history as failed
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
    const {
      includeMetrics = true,
      includeAnalysisHistory = false,
      dateRange,
    } = options;

    // Fetch website data
    const { data: websites, error } = await supabase
      .schema("beekon_data")
      .from("websites")
      .select(
        `
        id,
        domain,
        display_name,
        created_at,
        updated_at,
        is_active,
        crawl_status,
        last_crawled_at,
        workspace_id
      `
      )
      .in("id", websiteIds);

    if (error) throw error;

    let exportData: Record<string, unknown>[] = websites || [];

    // Add metrics if requested
    if (includeMetrics) {
      const metricsPromises = websiteIds.map(async (websiteId) => {
        try {
          let metricsQuery = (supabase.schema("beekon_data") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
            .from("mv_analysis_results")
            .select(
              `
              confidence_score,
              sentiment_score,
              is_mentioned,
              rank_position,
              analyzed_at,
              topic_name
            `
            )
            .eq("website_id", websiteId);

          if (dateRange) {
            metricsQuery = metricsQuery
              .gte("analyzed_at", dateRange.start)
              .lte("analyzed_at", dateRange.end);
          }

          const { data: metrics, error } = await metricsQuery;
          if (error) throw error;

          // Transform materialized view data to expected format
          const transformedMetrics = (metrics || []).map((row: any) => ({
            // eslint-disable-line @typescript-eslint/no-explicit-any
            confidence_score: row.confidence_score,
            sentiment_score: row.sentiment_score,
            is_mentioned: row.is_mentioned,
            rank_position: row.rank_position,
            created_at: row.analyzed_at,
            prompts: {
              topics: {
                website_id: websiteId,
                topic_name: row.topic_name,
              },
            },
          }));

          return { websiteId, metrics: transformedMetrics };
        } catch (error) {
          console.warn(
            `⚠️ Materialized view query failed for export metrics, falling back (website: ${websiteId}):`,
            error
          );

          // Fallback to original expensive query
          let metricsQuery = supabase
            .schema("beekon_data")
            .from("llm_analysis_results")
            .select(
              `
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
            `
            )
            .eq("prompts.topics.website_id", websiteId);

          if (dateRange) {
            metricsQuery = metricsQuery
              .gte("created_at", dateRange.start)
              .lte("created_at", dateRange.end);
          }

          const { data: metrics } = await metricsQuery;
          return { websiteId, metrics: metrics || [] };
        }
      });

      const metricsResults = await Promise.all(metricsPromises);

      // Flatten website data with metrics for tabular export format
      exportData =
        websites?.flatMap((website) => {
          const websiteMetrics = metricsResults.find(
            (m) => m.websiteId === website.id
          );

          // Calculate metrics
          const totalAnalyses = websiteMetrics?.metrics.length || 0;
          const metrics = websiteMetrics?.metrics || [];
          const averageConfidence =
            metrics.length > 0
              ? metrics.reduce(
                  (sum: number, m: any) => sum + (m.confidence_score || 0),
                  0
                ) / metrics.length
              : 0; // eslint-disable-line @typescript-eslint/no-explicit-any
          const averageSentiment =
            metrics.length > 0
              ? metrics.reduce(
                  (sum: number, m: any) => sum + (m.sentiment_score || 0),
                  0
                ) / metrics.length
              : 0; // eslint-disable-line @typescript-eslint/no-explicit-any
          const mentionRate =
            metrics.length > 0
              ? (metrics.filter((m: any) => m.is_mentioned).length /
                  metrics.length) *
                100
              : 0; // eslint-disable-line @typescript-eslint/no-explicit-any
          const averageRank =
            metrics.length > 0
              ? metrics.reduce(
                  (sum: number, m: any) => sum + (m.rank_position || 0),
                  0
                ) / metrics.length
              : 0; // eslint-disable-line @typescript-eslint/no-explicit-any

          // Return flattened tabular data - each row represents one data point
          return [
            // Website basic info
            {
              category: "Website Info",
              metric: "Website Name",
              value: website.display_name || website.domain,
              unit: "text",
              websiteId: website.id,
            },
            {
              category: "Website Info",
              metric: "Domain URL",
              value: website.domain,
              unit: "url",
              websiteId: website.id,
            },
            {
              category: "Website Info",
              metric: "Active Status",
              value: website.is_active ? "Active" : "Inactive",
              unit: "status",
              websiteId: website.id,
            },
            {
              category: "Website Info",
              metric: "Crawl Status",
              value: website.crawl_status || "Unknown",
              unit: "status",
              websiteId: website.id,
            },
            {
              category: "Website Info",
              metric: "Date Added",
              value: website.created_at
                ? new Date(website.created_at).toLocaleDateString()
                : "Unknown",
              unit: "date",
              websiteId: website.id,
            },
            {
              category: "Website Info",
              metric: "Last Modified",
              value: website.updated_at
                ? new Date(website.updated_at).toLocaleDateString()
                : "Unknown",
              unit: "date",
              websiteId: website.id,
            },
            {
              category: "Website Info",
              metric: "Last Analyzed",
              value: website.last_crawled_at
                ? new Date(website.last_crawled_at).toLocaleDateString()
                : "Never",
              unit: "date",
              websiteId: website.id,
            },

            // Performance metrics
            {
              category: "Performance Metrics",
              metric: "Total Analyses",
              value: totalAnalyses.toString(),
              unit: "count",
              websiteId: website.id,
            },
            {
              category: "Performance Metrics",
              metric: "Average Confidence",
              value: `${(averageConfidence * 100).toFixed(1)}%`,
              unit: "percentage",
              websiteId: website.id,
            },
            {
              category: "Performance Metrics",
              metric: "Average Sentiment",
              value: `${(averageSentiment * 100).toFixed(1)}%`,
              unit: "percentage",
              websiteId: website.id,
            },
            {
              category: "Performance Metrics",
              metric: "Mention Rate",
              value: `${mentionRate.toFixed(1)}%`,
              unit: "percentage",
              websiteId: website.id,
            },
            {
              category: "Performance Metrics",
              metric: "Average Ranking",
              value: averageRank.toFixed(1),
              unit: "position",
              websiteId: website.id,
            },
          ];
        }) || [];
    }

    // Add analysis history if requested
    if (includeAnalysisHistory) {
      const historyPromises = websiteIds.map(async (websiteId) => {
        try {
          let historyQuery = (supabase.schema("beekon_data") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
            .from("mv_analysis_results")
            .select(
              `
              analyzed_at,
              llm_provider,
              is_mentioned,
              rank_position,
              confidence_score,
              sentiment_score,
              response_text,
              prompt_text,
              topic_name
            `
            )
            .eq("website_id", websiteId)
            .order("analyzed_at", { ascending: false });

          if (dateRange) {
            historyQuery = historyQuery
              .gte("analyzed_at", dateRange.start)
              .lte("analyzed_at", dateRange.end);
          }

          const { data: history, error } = await historyQuery;
          if (error) throw error;

          // Transform materialized view data to expected format
          const transformedHistory = (history || []).map((row: any) => ({
            // eslint-disable-line @typescript-eslint/no-explicit-any
            created_at: row.analyzed_at,
            llm_provider: row.llm_provider,
            is_mentioned: row.is_mentioned,
            rank_position: row.rank_position,
            confidence_score: row.confidence_score,
            sentiment_score: row.sentiment_score,
            response_text: row.response_text,
            prompts: {
              prompt_text: row.prompt_text,
              topics: {
                website_id: websiteId,
                topic_name: row.topic_name,
              },
            },
          }));

          return { websiteId, history: transformedHistory };
        } catch (error) {
          console.warn(
            `⚠️ Materialized view query failed for export history, falling back (website: ${websiteId}):`,
            error
          );

          // Fallback to original expensive query
          let historyQuery = supabase
            .schema("beekon_data")
            .from("llm_analysis_results")
            .select(
              `
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
            `
            )
            .eq("prompts.topics.website_id", websiteId)
            .order("created_at", { ascending: false });

          if (dateRange) {
            historyQuery = historyQuery
              .gte("created_at", dateRange.start)
              .lte("created_at", dateRange.end);
          }

          const { data: history } = await historyQuery;
          return { websiteId, history: history || [] };
        }
      });

      const historyResults = await Promise.all(historyPromises);

      // Add analysis history data to the flattened export format
      const historyData = historyResults.flatMap(({ websiteId, history }) => {
        if (!history || history.length === 0) {
          return [
            {
              category: "Analysis History",
              metric: "History Status",
              value: "No analysis history available",
              unit: "text",
              websiteId,
            },
          ];
        }

        return history.slice(0, 5).map((analysis: any, index: number) => ({
          // eslint-disable-line @typescript-eslint/no-explicit-any
          category: "Analysis History",
          metric: `Analysis #${index + 1}`,
          value: `${analysis.llm_provider} - ${
            analysis.is_mentioned ? "Mentioned" : "Not Mentioned"
          } - Rank: ${analysis.rank_position || "N/A"}`,
          unit: `Confidence: ${((analysis.confidence_score || 0) * 100).toFixed(
            1
          )}%`,
          websiteId,
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
        dateRange,
      }),
    });
  }

  // Export configuration data (for modals)
  async exportConfigurationData(
    configData: Record<string, unknown>,
    configType: "analysis" | "website_settings" | "workspace",
    format: ExportFormat
  ): Promise<Blob> {
    const exportContent: ExportData = {
      title: `${configType
        .replace("_", " ")
        .replace(/\b\w/g, (l) => l.toUpperCase())} Configuration`,
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
        includeTimestamp: true,
      }),
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
      .from(tableName as keyof Database["beekon_data"]["Tables"])
      .select(selectFields)
      .order(orderBy, { ascending: false });

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
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
      data: Array.isArray(data)
        ? (data as unknown as Record<string, unknown>[])
        : [],
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
        dateRange,
      }),
    });
  }
}

// Export singleton instance
export const exportService = ExportService.getInstance();
