import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  History, 
  RefreshCw, 
  Trash2, 
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  MoreHorizontal,
  Archive,
  TrendingUp,
  FileOutput,
} from "lucide-react";
import { Spinner } from "@/components/LoadingStates";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { 
  exportHistoryService, 
  ExportHistoryFilter, 
  ExportHistoryOptions 
} from "@/services/exportHistoryService";
import { 
  ExportHistoryRecord, 
  ExportStatus, 
  ExportType, 
  ExportFormat,
  UserExportSummary,
} from "@/types/database";

interface ExportHistoryModalProps {
  children?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ExportHistoryModal({ 
  children, 
  isOpen, 
  onOpenChange 
}: ExportHistoryModalProps) {
  const [exportHistory, setExportHistory] = useState<ExportHistoryRecord[]>([]);
  const [exportSummary, setExportSummary] = useState<UserExportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExportStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ExportType | "all">("all");
  const [formatFilter, setFormatFilter] = useState<ExportFormat | "all">("all");
  const [sortBy] = useState<"created_at" | "updated_at" | "file_size">("created_at");
  const [sortOrder] = useState<"asc" | "desc">("desc");

  const pageSize = 10;

  const handleOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (onOpenChange) onOpenChange(open);
  };

  const fetchExportHistory = useCallback(async (page = 0) => {
    setLoading(true);
    try {
      const filters: ExportHistoryFilter = {
        search: searchTerm || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        export_type: typeFilter !== "all" ? typeFilter : undefined,
        format: formatFilter !== "all" ? formatFilter : undefined,
      };

      const options: ExportHistoryOptions = {
        limit: pageSize,
        offset: page * pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      const [historyResult, summary] = await Promise.all([
        exportHistoryService.getUserExportHistory(filters, options),
        exportHistoryService.getUserExportSummary(),
      ]);

      setExportHistory(historyResult.data);
      setTotalRecords(historyResult.total);
      setExportSummary(summary);
      setCurrentPage(page);
    } catch (error) {
      // Failed to fetch export history
      toast({
        title: "Error",
        description: "Failed to load export history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, typeFilter, formatFilter, sortBy, sortOrder]);

  const handleRetryExport = async (id: string) => {
    setRetryingId(id);
    try {
      await exportHistoryService.retryExport(id);
      toast({
        title: "Export Retried",
        description: "Export has been queued for retry",
      });
      fetchExportHistory(currentPage);
    } catch (error) {
      // Failed to retry export
      toast({
        title: "Error",
        description: "Failed to retry export",
        variant: "destructive",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteExport = async (id: string) => {
    setDeletingId(id);
    try {
      await exportHistoryService.deleteExportRecord(id);
      toast({
        title: "Export Deleted",
        description: "Export record has been deleted",
      });
      fetchExportHistory(currentPage);
    } catch (error) {
      // Failed to delete export
      toast({
        title: "Error",
        description: "Failed to delete export record",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCleanupOldRecords = async () => {
    try {
      const deletedCount = await exportHistoryService.cleanupOldRecords(90);
      toast({
        title: "Cleanup Complete",
        description: `${deletedCount} old export records were deleted`,
      });
      fetchExportHistory(currentPage);
    } catch (error) {
      // Failed to cleanup old records
      toast({
        title: "Error",
        description: "Failed to cleanup old records",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: ExportStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "processing":
        return <Spinner size="sm" className="text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: ExportStatus) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getTypeIcon = (type: ExportType) => {
    switch (type) {
      case "analysis":
        return <FileText className="w-4 h-4" />;
      case "dashboard":
        return <TrendingUp className="w-4 h-4" />;
      case "website":
        return <FileOutput className="w-4 h-4" />;
      default:
        return <Archive className="w-4 h-4" />;
    }
  };

  useEffect(() => {
    if (modalOpen || isOpen) {
      fetchExportHistory(0);
    }
  }, [modalOpen, isOpen, searchTerm, statusFilter, typeFilter, formatFilter, sortBy, sortOrder, fetchExportHistory]);

  const ExportHistoryContent = () => (
    <div className="space-y-4">
      {/* Summary Cards */}
      {exportSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Total Exports</p>
                  <p className="text-2xl font-bold">{exportSummary.total_exports}</p>
                </div>
                <FileOutput className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Success Rate</p>
                  <p className="text-2xl font-bold">
                    {exportSummary.total_exports > 0 
                      ? Math.round((exportSummary.successful_exports / exportSummary.total_exports) * 100)
                      : 0}%
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Total Size</p>
                  <p className="text-2xl font-bold">{formatFileSize(exportSummary.total_size)}</p>
                </div>
                <Archive className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Avg. per Day</p>
                  <p className="text-2xl font-bold">{exportSummary.export_frequency}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search exports..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ExportStatus | "all")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ExportType | "all")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="analysis">Analysis</SelectItem>
            <SelectItem value="dashboard">Dashboard</SelectItem>
            <SelectItem value="website">Website</SelectItem>
            <SelectItem value="competitor">Competitor</SelectItem>
            <SelectItem value="configuration">Config</SelectItem>
          </SelectContent>
        </Select>
        <Select value={formatFilter} onValueChange={(value) => setFormatFilter(value as ExportFormat | "all")}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="word">Word</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => fetchExportHistory(currentPage)}
          disabled={loading}
          size="sm"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
        <Button
          onClick={handleCleanupOldRecords}
          variant="outline"
          size="sm"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Cleanup Old
        </Button>
      </div>

      {/* Export History List */}
      <ScrollArea className="h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner size="lg" />
          </div>
        ) : exportHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No export history found
          </div>
        ) : (
          <div className="space-y-2">
            {exportHistory.map((record) => (
              <Card key={record.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getTypeIcon(record.export_type)}
                      <h3 className="font-medium">{record.filename}</h3>
                      <Badge className={getStatusColor(record.status)}>
                        {getStatusIcon(record.status)}
                        <span className="ml-1 capitalize">{record.status}</span>
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {record.format.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-medium">Created:</span> {record.created_at ? formatDistanceToNow(new Date(record.created_at), { addSuffix: true }) : 'Unknown'}
                      </div>
                      <div>
                        <span className="font-medium">Size:</span> {formatFileSize(record.file_size)}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> {record.export_type}
                      </div>
                      {record.completed_at && (
                        <div>
                          <span className="font-medium">Completed:</span> {formatDistanceToNow(new Date(record.completed_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                    {record.error_message && (
                      <Alert className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{record.error_message}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {record.status === "failed" && (
                        <DropdownMenuItem
                          onClick={() => handleRetryExport(record.id)}
                          disabled={retryingId === record.id}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry Export
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDeleteExport(record.id)}
                        disabled={deletingId === record.id}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {totalRecords > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalRecords)} of {totalRecords} exports
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => fetchExportHistory(currentPage - 1)}
              disabled={currentPage === 0 || loading}
            >
              Previous
            </Button>
            <Button
              size="sm"
              onClick={() => fetchExportHistory(currentPage + 1)}
              disabled={(currentPage + 1) * pageSize >= totalRecords || loading}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Export History
            </DialogTitle>
          </DialogHeader>
          <ExportHistoryContent />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={modalOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-2" />
            Export History
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Export History
          </DialogTitle>
        </DialogHeader>
        <ExportHistoryContent />
      </DialogContent>
    </Dialog>
  );
}

export default ExportHistoryModal;