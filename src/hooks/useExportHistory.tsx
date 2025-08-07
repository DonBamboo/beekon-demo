import { useState, useEffect, useCallback } from "react";
import { 
  exportHistoryService, 
  ExportHistoryFilter, 
  ExportHistoryOptions 
} from "@/services/exportHistoryService";
import { 
  ExportHistoryRecord, 
  UserExportSummary,
  ExportStatistics,
} from "@/types/database";
import { toast } from "@/hooks/use-toast";

export function useExportHistory() {
  const [exportHistory, setExportHistory] = useState<ExportHistoryRecord[]>([]);
  const [exportSummary, setExportSummary] = useState<UserExportSummary | null>(null);
  const [exportStats, setExportStats] = useState<ExportStatistics[]>([]);
  const [recentActivity, setRecentActivity] = useState<ExportHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExportHistory = async (
    filters: ExportHistoryFilter = {},
    options: ExportHistoryOptions = {}
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await exportHistoryService.getUserExportHistory(filters, options);
      setExportHistory(result.data);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch export history";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      return { data: [], count: 0, total: 0 };
    } finally {
      setLoading(false);
    }
  };

  const fetchExportSummary = async () => {
    try {
      const summary = await exportHistoryService.getUserExportSummary();
      setExportSummary(summary);
      return summary;
    } catch (err) {
      // Failed to fetch export summary
      return null;
    }
  };

  const fetchExportStatistics = async () => {
    try {
      const stats = await exportHistoryService.getExportStatistics();
      setExportStats(stats);
      return stats;
    } catch (err) {
      // Failed to fetch export statistics
      return [];
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const activity = await exportHistoryService.getRecentActivity();
      setRecentActivity(activity);
      return activity;
    } catch (err) {
      // Failed to fetch recent activity
      return [];
    }
  };

  const retryExport = async (id: string) => {
    try {
      const newRecord = await exportHistoryService.retryExport(id);
      toast({
        title: "Export Retried",
        description: "Export has been queued for retry",
      });
      return newRecord;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to retry export";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteExport = async (id: string) => {
    try {
      await exportHistoryService.deleteExportRecord(id);
      toast({
        title: "Export Deleted",
        description: "Export record has been deleted",
      });
      // Refresh the current data
      await fetchExportHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete export";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const cleanupOldRecords = async (olderThanDays: number = 90) => {
    try {
      const deletedCount = await exportHistoryService.cleanupOldRecords(olderThanDays);
      toast({
        title: "Cleanup Complete",
        description: `${deletedCount} old export records were deleted`,
      });
      // Refresh the current data
      await Promise.all([
        fetchExportHistory(),
        fetchExportSummary(),
        fetchExportStatistics(),
      ]);
      return deletedCount;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cleanup old records";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchExportHistory(),
      fetchExportSummary(),
      fetchExportStatistics(),
      fetchRecentActivity(),
    ]);
  }, []);

  // Initialize data on first load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    exportHistory,
    exportSummary,
    exportStats,
    recentActivity,
    loading,
    error,
    fetchExportHistory,
    fetchExportSummary,
    fetchExportStatistics,
    fetchRecentActivity,
    retryExport,
    deleteExport,
    cleanupOldRecords,
    refreshAll,
  };
}

export default useExportHistory;