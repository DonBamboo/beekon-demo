import { supabase } from "@/integrations/supabase/client";
import {
  ExportHistoryRecord,
  ExportStatistics,
  UserExportSummary,
  ExportStatus,
  ExportType,
  ExportFormat,
  ExportHistoryInsert,
  ExportHistoryUpdate,
} from "@/types/database";

export interface ExportHistoryFilter {
  export_type?: ExportType;
  format?: ExportFormat;
  status?: ExportStatus;
  date_range?: { start: string; end: string };
  search?: string;
}

export interface ExportHistoryOptions {
  limit?: number;
  offset?: number;
  sort_by?: "created_at" | "updated_at" | "file_size" | "filename";
  sort_order?: "asc" | "desc";
}

export class ExportHistoryService {
  private static instance: ExportHistoryService;

  public static getInstance(): ExportHistoryService {
    if (!ExportHistoryService.instance) {
      ExportHistoryService.instance = new ExportHistoryService();
    }
    return ExportHistoryService.instance;
  }

  /**
   * Create a new export history record
   */
  async createExportRecord(
    exportData: Omit<ExportHistoryInsert, "id" | "created_at" | "updated_at">
  ): Promise<ExportHistoryRecord> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in createExportRecord
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const insertData: ExportHistoryInsert = {
      ...exportData,
      user_id: user.id,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // Failed to create export record
      throw error;
    }

    return data;
  }

  /**
   * Update export record status and metadata
   */
  async updateExportRecord(
    id: string,
    updates: Partial<ExportHistoryUpdate>
  ): Promise<ExportHistoryRecord> {
    const updateData: ExportHistoryUpdate = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Set started_at if status is changing to processing
    if (updates.status === "processing" && !updates.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    // Set completed_at if status is changing to completed or failed
    if (
      (updates.status === "completed" || updates.status === "failed") &&
      !updates.completed_at
    ) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      // Failed to update export record
      throw error;
    }

    return data;
  }

  /**
   * Get user's export history with filtering and pagination
   */
  async getUserExportHistory(
    filters: ExportHistoryFilter = {},
    options: ExportHistoryOptions = {}
  ): Promise<{
    data: ExportHistoryRecord[];
    count: number;
    total: number;
  }> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in getUserExportHistory
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const {
      limit = 50,
      offset = 0,
      sort_by = "created_at",
      sort_order = "desc",
    } = options;

    let query = supabase
      .schema("beekon_data")
      .from("export_history")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    // Apply filters
    if (filters.export_type) {
      query = query.eq("export_type", filters.export_type);
    }

    if (filters.format) {
      query = query.eq("format", filters.format);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.date_range) {
      query = query
        .gte("created_at", filters.date_range.start)
        .lte("created_at", filters.date_range.end);
    }

    if (filters.search) {
      query = query.or(
        `filename.ilike.%${filters.search}%,error_message.ilike.%${filters.search}%`
      );
    }

    // Apply sorting and pagination
    query = query
      .order(sort_by, { ascending: sort_order === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      // Failed to get export history
      throw error;
    }

    return {
      data: data || [],
      count: data?.length || 0,
      total: count || 0,
    };
  }

  /**
   * Get export statistics for the user
   */
  async getExportStatistics(): Promise<ExportStatistics[]> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in getExportStatistics
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_statistics")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      // Failed to get export statistics
      throw error;
    }

    return data || [];
  }

  /**
   * Get user export summary
   */
  async getUserExportSummary(): Promise<UserExportSummary> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in getUserExportSummary
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      // Failed to get export summary
      throw error;
    }

    const exports = data || [];
    const successful = exports.filter((exp) => exp.status === "completed");
    const failed = exports.filter((exp) => exp.status === "failed");
    const totalSize = successful.reduce((sum, exp) => sum + (exp.file_size || 0), 0);

    // Calculate favorite format
    const formatCounts = exports.reduce((acc, exp) => {
      acc[exp.format] = (acc[exp.format] || 0) + 1;
      return acc;
    }, {} as Record<ExportFormat, number>);

    const favoriteFormat = Object.entries(formatCounts).reduce(
      (max, [format, count]) =>
        count > formatCounts[max as ExportFormat] ? format : max,
      "json"
    ) as ExportFormat;

    // Calculate most exported type
    const typeCounts = exports.reduce((acc, exp) => {
      acc[exp.export_type] = (acc[exp.export_type] || 0) + 1;
      return acc;
    }, {} as Record<ExportType, number>);

    const mostExportedType = Object.entries(typeCounts).reduce(
      (max, [type, count]) =>
        count > typeCounts[max as ExportType] ? type : max,
      "analysis"
    ) as ExportType;

    // Calculate export frequency (exports per day)
    const oldestExport = exports.reduce((oldest, exp) =>
      exp.created_at < oldest.created_at ? exp : oldest
    );

    const daysSinceFirstExport = oldestExport
      ? Math.max(
          1,
          Math.ceil(
            (Date.now() - new Date(oldestExport.created_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1;

    return {
      total_exports: exports.length,
      successful_exports: successful.length,
      failed_exports: failed.length,
      total_size: totalSize,
      avg_size: successful.length > 0 ? Math.round(totalSize / successful.length) : 0,
      last_export: exports.length > 0 ? exports[0].created_at : null,
      favorite_format: favoriteFormat,
      most_exported_type: mostExportedType,
      export_frequency: Math.round((exports.length / daysSinceFirstExport) * 100) / 100,
    };
  }

  /**
   * Delete export record
   */
  async deleteExportRecord(id: string): Promise<void> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in deleteExportRecord
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const { error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      // Failed to delete export record
      throw error;
    }
  }

  /**
   * Get export record by ID
   */
  async getExportRecord(id: string): Promise<ExportHistoryRecord | null> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in getExportRecord
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Record not found
      }
      // Failed to get export record
      throw error;
    }

    return data;
  }

  /**
   * Cleanup old export records (older than specified days)
   */
  async cleanupOldRecords(olderThanDays: number = 90): Promise<number> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in cleanupOldRecords
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .delete()
      .eq("user_id", user.id)
      .lt("created_at", cutoffDate.toISOString())
      .select("id");

    if (error) {
      // Failed to cleanup old export records
      throw error;
    }

    return data?.length || 0;
  }

  /**
   * Get recent export activity (last 7 days)
   */
  async getRecentActivity(): Promise<ExportHistoryRecord[]> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      // Authentication error in getRecentActivity
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!user) {
      throw new Error("User not authenticated");
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
      .schema("beekon_data")
      .from("export_history")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      // Failed to get recent export activity
      throw error;
    }

    return data || [];
  }

  /**
   * Retry a failed export by creating a new record with the same configuration
   */
  async retryExport(originalId: string): Promise<ExportHistoryRecord> {
    const originalRecord = await this.getExportRecord(originalId);
    if (!originalRecord) {
      throw new Error("Original export record not found");
    }

    if (originalRecord.status !== "failed") {
      throw new Error("Can only retry failed exports");
    }

    const retryData: Omit<ExportHistoryInsert, "id" | "created_at" | "updated_at"> = {
      user_id: originalRecord.user_id,
      export_type: originalRecord.export_type,
      format: originalRecord.format,
      filename: originalRecord.filename.replace(/(_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})?(\.\w+)$/, `_retry_${Date.now()}$2`),
      filters: originalRecord.filters,
      date_range: originalRecord.date_range,
      metadata: {
        ...originalRecord.metadata,
        retry_of: originalId,
        retry_count: (originalRecord.metadata?.retry_count || 0) + 1,
      },
    };

    return this.createExportRecord(retryData);
  }

  /**
   * Mark export as processing with progress tracking
   */
  async startExportProcessing(
    id: string,
    metadata?: Record<string, unknown>
  ): Promise<ExportHistoryRecord> {
    return this.updateExportRecord(id, {
      status: "processing",
      started_at: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Mark export as completed
   */
  async completeExport(
    id: string,
    file_size: number,
    metadata?: Record<string, unknown>
  ): Promise<ExportHistoryRecord> {
    return this.updateExportRecord(id, {
      status: "completed",
      file_size,
      completed_at: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Mark export as failed
   */
  async failExport(
    id: string,
    error_message: string,
    metadata?: Record<string, unknown>
  ): Promise<ExportHistoryRecord> {
    return this.updateExportRecord(id, {
      status: "failed",
      error_message,
      completed_at: new Date().toISOString(),
      metadata,
    });
  }
}

export const exportHistoryService = ExportHistoryService.getInstance();