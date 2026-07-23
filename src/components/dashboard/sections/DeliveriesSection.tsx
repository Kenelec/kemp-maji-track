import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Upload, CheckCircle, Clock, AlertCircle, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DeliveryFormDialog } from "../forms/DeliveryFormDialog";
import { ExcelUploadDialog } from "../ExcelUploadDialog";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, format as formatDate } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeliveriesSection() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isMasterAdmin = userRole === 'MasterAdmin';
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deliveryToDelete, setDeliveryToDelete] = useState<string | null>(null);
  const [hasLinkedPayments, setHasLinkedPayments] = useState(false);
  
  // NEW: Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // NEW: Monthly navigation
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // NEW: Column widths state
  const [columnWidths, setColumnWidths] = useState({
    customer: 150,
    date: 120, // Increased width for full date
    driver: 120,
    note: 100,
    products: 120,
    qty: 80,
    rate: 100,
    total: 100,
    status: 100,
    actions: 120
  });

  // NEW: Resizing state
  const [isResizing, setIsResizing] = useState<{column: string, startX: number, startWidth: number} | null>(null);
  const [activeResizeColumn, setActiveResizeColumn] = useState<string | null>(null);

  // NEW: Calculate month range
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["deliveries", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          *,
          customers (customer_name),
          drivers (name, vehicle_number),
          delivery_items (
            product_id,
            product_name,
            quantity
          ),
          delivery_queries (id, status)
        `)
        .gte("delivery_date", monthStart.toISOString().split('T')[0])
        .lte("delivery_date", monthEnd.toISOString().split('T')[0])
        .order("delivery_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // NEW: Client-side sorting with proper numeric handling
  const sortedDeliveries = useMemo(() => {
    if (!deliveries) return [];
    
    return [...deliveries].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'customers.customer_name':
          aValue = (a.customers?.customer_name || "").toLowerCase();
          bValue = (b.customers?.customer_name || "").toLowerCase();
          break;
        case 'drivers.name':
          aValue = (a.drivers?.name || "").toLowerCase();
          bValue = (b.drivers?.name || "").toLowerCase();
          break;
        case 'delivery_note_no':
          // NEW: Handle numeric sorting for delivery note numbers
          const aNum = parseInt(a.delivery_note_no?.replace(/\D/g, '') || '0');
          const bNum = parseInt(b.delivery_note_no?.replace(/\D/g, '') || '0');
          return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
        case 'qty':
          aValue = a.qty || 0;
          bValue = b.qty || 0;
          break;
        case 'unit_rate':
          aValue = a.unit_rate || 0;
          bValue = b.unit_rate || 0;
          break;
        case 'total_amount':
          aValue = a.total_amount || 0;
          bValue = b.total_amount || 0;
          break;
        case 'payment_status':
          // NEW: Sort by confirmation status
          const getStatusValue = (delivery: any) => {
            if (delivery.payment_status === 'paid') return 1;
            if (delivery.payment_status === 'partial') return 2;
            if (delivery.discrepancy_flag || (delivery.delivery_queries && delivery.delivery_queries.length > 0)) return 3;
            if (delivery.customer_confirmed) return 4;
            if (delivery.auto_confirmed) return 5;
            return 6; // open
          };
          return sortOrder === 'asc' ? getStatusValue(a) - getStatusValue(b) : getStatusValue(b) - getStatusValue(a);
        case 'delivery_date':
        default:
          aValue = new Date(a.delivery_date || 0).getTime();
          bValue = new Date(b.delivery_date || 0).getTime();
          break;
      }
      
      // For string comparisons
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortOrder === 'asc' ? comparison : -comparison;
      }
      
      // For numeric comparisons
      if (sortField !== 'payment_status' && sortField !== 'delivery_note_no') {
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      }
      
      // Default case for dates
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [deliveries, sortField, sortOrder]);

  // NEW: Navigate to previous month
  const goToPreviousMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  // NEW: Navigate to next month
  const goToNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  // NEW: Handle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      // Toggle sort order if clicking same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new field in ascending order
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // NEW: Get sort indicator icon
  const getSortIcon = (field: string) => {
    if (sortField !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  // NEW: Handle column resize start
  const handleResizeStart = (column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = columnWidths[column as keyof typeof columnWidths];
    setIsResizing({ column, startX: e.clientX, startWidth: currentWidth });
    setActiveResizeColumn(column);
  };

  // NEW: Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - isResizing.startX;
        const newWidth = Math.max(80, isResizing.startWidth + deltaX); // Minimum width of 80px
        
        setColumnWidths(prev => ({
          ...prev,
          [isResizing.column]: newWidth
        }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      setActiveResizeColumn(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const getConfirmationStatus = (delivery: any) => {
    const hasQuery = delivery.delivery_queries && delivery.delivery_queries.length > 0;
    
    // Check payment status first - highest priority
    if (delivery.payment_status === 'paid') {
      return { label: "Paid", color: "bg-green-100 text-green-800", icon: CheckCircle };
    }
    if (delivery.payment_status === 'partial') {
      return { label: "Partial Payment", color: "bg-blue-100 text-blue-800", icon: CreditCard };
    }
    
    if (delivery.discrepancy_flag || hasQuery) {
      return { label: "Issue", color: "bg-red-100 text-red-800", icon: AlertCircle };
    }
    if (delivery.customer_confirmed) {
      return { label: "Confirmed", color: "bg-green-100 text-green-800", icon: CheckCircle };
    }
    if (delivery.auto_confirmed) {
      return { label: "Auto-Confirmed", color: "bg-gray-100 text-gray-800", icon: CheckCircle };
    }
    return { label: "Open", color: "bg-yellow-100 text-yellow-800", icon: Clock };
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("deliveries")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Delivery deleted",
        description: "Delivery has been removed successfully.",
      });
      setDeleteDialogOpen(false);
      setDeliveryToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete delivery: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (delivery: any) => {
    setEditingDelivery(delivery);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    // Check if any payments are linked to this delivery
    const { data: linkedPayments } = await supabase
      .from("payments")
      .select("id")
      .eq("delivery_id", id)
      .limit(1);
    
    setHasLinkedPayments(linkedPayments && linkedPayments.length > 0);
    setDeliveryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deliveryToDelete) {
      deleteMutation.mutate(deliveryToDelete);
    }
  };

  // NEW: Reference for table container to enable horizontal scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // NEW: Format month display
  const formattedMonth = formatDate(currentMonth, 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* COMPACT HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Deliveries</h2>
          <p className="text-xs text-muted-foreground">Manage water deliveries</p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
          <Button className="bg-gradient-primary" size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-3 h-3 mr-1" />
            New
          </Button>
        </div>
      </div>
      
      <Card>
        {/* COMPACT CARD HEADER */}
        <CardHeader className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">All Deliveries - {formattedMonth}</CardTitle>
              <CardDescription className="text-xs mt-1">
                Showing {sortedDeliveries?.length || 0} deliveries
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousMonth}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {formattedMonth}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextMonth}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
          ) : !sortedDeliveries || sortedDeliveries.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No deliveries found for {formattedMonth}.
            </div>
          ) : (
            <div 
              ref={tableContainerRef}
              className="overflow-x-auto"
            >
              {/* COMPACT SCROLLABLE CONTAINER */}
              <div className="h-[calc(100vh-280px)] overflow-y-auto">
                {/* FIXED HEADER WITH CUSTOM COLUMN WIDTHS */}
                <div className="sticky top-0 z-[1000] bg-background border-b">
                  <Table className="min-w-max">
                    <TableHeader className="bg-background">
                      <TableRow className="hover:bg-transparent">
                        {/* Customer Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 sticky left-0 bg-background z-[2000] !important text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.customer}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('customers.customer_name')}
                            >
                              Customer {getSortIcon('customers.customer_name')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('customer', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Date Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.date}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('delivery_date')}
                            >
                              Date {getSortIcon('delivery_date')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('date', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Driver Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.driver}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('drivers.name')}
                            >
                              Driver {getSortIcon('drivers.name')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('driver', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Note Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.note}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('delivery_note_no')}
                            >
                              Note No. {getSortIcon('delivery_note_no')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('note', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Products Column */}
                        <TableHead 
                          className="text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.products}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span className="flex-1 text-left">Products</span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('products', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Qty Column */}
                        <TableHead 
                          className="text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.qty}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span className="flex-1 text-left">Qty</span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('qty', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Rate Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.rate}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('unit_rate')}
                            >
                              Rate {getSortIcon('unit_rate')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('rate', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Total Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.total}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('total_amount')}
                            >
                              Total {getSortIcon('total_amount')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('total', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Status Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.status}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('payment_status')}
                            >
                              Status {getSortIcon('payment_status')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('status', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Actions Column - No resize handle for last column */}
                        <TableHead 
                          className="text-right sticky right-0 bg-background z-[2000] !important text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.actions}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span className="flex-1 text-left">Actions</span>
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                  </Table>
                </div>
                
                {/* COMPACT DATA ROWS WITH CUSTOM COLUMN WIDTHS */}
                <div className="relative z-[500]">
                  <Table className="min-w-max">
                    <TableBody>
                      {sortedDeliveries.map((delivery) => {
                        const confirmStatus = getConfirmationStatus(delivery);
                        const StatusIcon = confirmStatus.icon;
                        return (
                          <TableRow key={delivery.id} className="hover:bg-gray-50">
                            <TableCell 
                              className="font-medium sticky left-0 bg-background z-[1500] !important text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.customer}px` }}
                            >
                              {delivery.customers?.customer_name || "Unknown"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.date}px` }}
                            >
                              {format(new Date(delivery.delivery_date), "dd/MM/yyyy")} {/* FIXED: Full date format */}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.driver}px` }}
                            >
                              {(delivery as any).drivers?.name || "—"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.note}px` }}
                            >
                              {delivery.delivery_note_no || "—"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.products}px` }}
                            >
                              {delivery.delivery_items && delivery.delivery_items.length > 0 ? (
                                <div className="max-h-12 overflow-y-auto">
                                  {delivery.delivery_items.map((item, idx) => (
                                    <div key={idx} className="truncate text-xs">
                                      {item.product_name}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.qty}px` }}
                            >
                              {delivery.qty}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.rate}px` }}
                            >
                              {Number(delivery.unit_rate).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 font-semibold text-center align-middle"
                              style={{ width: `${columnWidths.total}px` }}
                            >
                              {Number(delivery.total_amount).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.status}px` }}
                            >
                              <Badge className={`${confirmStatus.color} text-[10px]`} variant="secondary">
                                {confirmStatus.label}
                              </Badge>
                            </TableCell>
                            <TableCell 
                              className="text-right sticky right-0 bg-background z-[1500] !important text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.actions}px` }}
                            >
                              {isMasterAdmin && (
                                <div className="flex justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="xs" 
                                    onClick={() => handleEdit(delivery)}
                                    className="z-[3000]" // Ensure high z-index for modal
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="xs" 
                                    onClick={() => handleDelete(delivery.id)}
                                    className="z-[3000]" // Ensure high z-index for modal
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ENHANCED MODAL FOR EDIT/CREATE FORM */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl max-h-[90vh] overflow-y-auto">
            <DeliveryFormDialog
              open={isFormOpen}
              onOpenChange={(open) => {
                setIsFormOpen(open);
                if (!open) setEditingDelivery(null);
              }}
              editData={editingDelivery}
            />
          </div>
        </div>
      )}

      <ExcelUploadDialog
        open={isExcelUploadOpen}
        onOpenChange={setIsExcelUploadOpen}
        type="deliveries"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["deliveries"] })}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasLinkedPayments ? "Cannot Delete Delivery" : "Delete Delivery"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasLinkedPayments 
                ? "This delivery has linked payment records. Please delete the associated payments first before deleting this delivery."
                : "Are you sure you want to delete this delivery? This action cannot be undone."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!hasLinkedPayments && (
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
