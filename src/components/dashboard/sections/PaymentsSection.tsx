import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle, Trash2, Upload, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ExcelUploadDialog } from "../ExcelUploadDialog";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
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

export function PaymentsSection() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isMasterAdmin = userRole === 'MasterAdmin';
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  
  // NEW: Form state for adding payment
  const [formData, setFormData] = useState({
    delivery_id: '',
    customer_id: '',
    amount: 0,
    payment_method: 'mpesa',
    mpesa_code: '',
    due_date: '',
    status: 'paid', // NEW: Default to paid
  });

  // NEW: Loading states for dependent data
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // NEW: Load dependent data
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      try {
        const [{ data: deliveriesData }, { data: customersData }] = await Promise.all([
          supabase.from('deliveries').select('id, delivery_note_no, total_amount, delivery_date, customer_id'),
          supabase.from('customers').select('id, customer_name')
        ]);
        
        setDeliveries(deliveriesData || []);
        setCustomers(customersData || []);
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: "Error",
          description: "Failed to load required data",
          variant: "destructive",
        });
      } finally {
        setLoadingData(false);
      }
    };
    
    loadData();
  }, [toast]);

  // NEW: Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? Number(value) : value
    }));
  };

  // NEW: Handle delivery selection change
  const handleDeliveryChange = (deliveryId: string) => {
    const selectedDelivery = deliveries.find(d => d.id === deliveryId);
    if (selectedDelivery) {
      setFormData(prev => ({
        ...prev,
        delivery_id: deliveryId,
        customer_id: selectedDelivery.customer_id,
        amount: selectedDelivery.total_amount,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days from now
      }));
    }
  };

  // NEW: Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // NEW: Calculate if there's a credit
      const selectedDelivery = deliveries.find(d => d.id === formData.delivery_id);
      const totalAmount = selectedDelivery?.total_amount || 0;
      const amountPaid = formData.amount;
      const creditAmount = Math.max(0, amountPaid - totalAmount);
      
      // NEW: Determine status based on payment
      let status = 'paid';
      if (creditAmount > 0) {
        status = `credit ${creditAmount}`;
      } else if (amountPaid < totalAmount) {
        status = `partial ${totalAmount - amountPaid}`;
      }
      
      const paymentData = {
        ...formData,
        status: status,
      };
      
      const { error } = await supabase
        .from('payments')
        .insert([paymentData]);
      
      if (error) throw error;
      
      // NEW: Update delivery payment status if fully paid
      if (amountPaid >= totalAmount) {
        await supabase
          .from('deliveries')
          .update({ payment_status: 'paid' })
          .eq('id', formData.delivery_id);
      }
      
      toast({
        title: "Payment created",
        description: "Payment has been created successfully.",
      });
      
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save payment",
        variant: "destructive",
      });
    }
  };

  // NEW: Monthly navigation state
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  
  // NEW: Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // NEW: Column widths state
  const [columnWidths, setColumnWidths] = useState({
    date: 120,
    customer: 150,
    note: 100,
    products: 120,
    qty: 80,
    total: 100,
    paid: 100,
    balance: 100,
    mode: 100,
    mpesa: 100,
    status: 100,
    actions: 120
  });

  // NEW: Resizing state
  const [isResizing, setIsResizing] = useState<{column: string, startX: number, startWidth: number} | null>(null);
  const [activeResizeColumn, setActiveResizeColumn] = useState<string | null>(null);

  // NEW: Calculate month range
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          customers (customer_name),
          deliveries (
            total_amount,
            delivery_date,
            delivery_note_no,
            delivery_items (
              product_name,
              quantity
            )
          )
        `)
        .gte("created_at", monthStart.toISOString().split('T')[0])
        .lte("created_at", monthEnd.toISOString().split('T')[0]);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // NEW: Client-side sorting with proper handling
  const sortedPayments = useMemo(() => {
    if (!payments) return [];
    
    return [...payments].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'delivery_date':
          // NEW: Sort by delivery date from deliveries
          aValue = new Date(a.deliveries?.delivery_date || 0).getTime();
          bValue = new Date(b.deliveries?.delivery_date || 0).getTime();
          break;
        case 'customers.customer_name':
          aValue = (a.customers?.customer_name || "").toLowerCase();
          bValue = (b.customers?.customer_name || "").toLowerCase();
          break;
        case 'deliveries.total_amount':
          aValue = a.deliveries?.total_amount || 0;
          bValue = b.deliveries?.total_amount || 0;
          break;
        case 'amount':
          aValue = a.amount || 0;
          bValue = b.amount || 0;
          break;
        case 'balance':
          // NEW: Sort by calculated balance
          const balanceA = (a.deliveries?.total_amount || 0) - (a.amount || 0);
          const balanceB = (b.deliveries?.total_amount || 0) - (b.amount || 0);
          aValue = balanceA;
          bValue = balanceB;
          break;
        case 'payment_method':
          aValue = (a.payment_method || "").toLowerCase();
          bValue = (b.payment_method || "").toLowerCase();
          break;
        case 'mpesa_code':
          aValue = (a.mpesa_code || "").toLowerCase();
          bValue = (b.mpesa_code || "").toLowerCase();
          break;
        case 'status':
          // NEW: Sort by status with special handling for credit/partial
          if (a.status.startsWith('credit')) aValue = 0;
          else if (a.status.startsWith('partial')) aValue = 1;
          else if (a.status === 'paid') aValue = 2;
          else if (a.status === 'overdue') aValue = 3;
          else aValue = 4;
          
          if (b.status.startsWith('credit')) bValue = 0;
          else if (b.status.startsWith('partial')) bValue = 1;
          else if (b.status === 'paid') bValue = 2;
          else if (b.status === 'overdue') bValue = 3;
          else bValue = 4;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at || 0).getTime();
          bValue = new Date(b.created_at || 0).getTime();
          break;
      }
      
      // For string comparisons
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortOrder === 'asc' ? comparison : -comparison;
      }
      
      // For numeric comparisons
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [payments, sortField, sortOrder]);

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

  // NEW: Navigation functions
  const goToPreviousMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
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

  const getMonthYearString = (date: Date) => {
    return format(date, 'MMMM yyyy');
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({
        title: "Payment deleted",
        description: "Payment has been removed successfully.",
      });
      setDeleteDialogOpen(false);
      setPaymentToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete payment: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    setPaymentToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (paymentToDelete) {
      deleteMutation.mutate(paymentToDelete);
    }
  };

  const updatePaymentStatus = useMutation({
    mutationFn: async ({ id, status, deliveryId }: { id: string; status: string; deliveryId?: string | null }) => {
      const { error } = await supabase
        .from("payments")
        .update({ status })
        .eq("id", id);
      
      if (error) throw error;
      
      // Sync delivery payment_status when payment is marked as paid
      if (status === 'paid' && deliveryId) {
        const { error: deliveryError } = await supabase
          .from("deliveries")
          .update({ payment_status: 'paid' })
          .eq("id", deliveryId);
        
        if (deliveryError) {
          console.error('Failed to sync delivery payment status:', deliveryError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Payment updated",
        description: "Payment status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update payment: " + error.message,
        variant: "destructive",
      });
    },
  });

  // NEW: Enhanced status color function with credit handling
  const getStatusColor = (status: string) => {
    if (status.startsWith('credit')) return "bg-blue-500/10 text-blue-500";
    if (status.startsWith('partial')) return "bg-yellow-500/10 text-yellow-500";
    if (status === 'paid') return "bg-green-500/10 text-green-500";
    if (status === 'overdue') return "bg-red-500/10 text-red-500";
    return "bg-gray-500/10 text-gray-500";
  };

  // NEW: Enhanced status display function
  const getStatusDisplay = (status: string) => {
    if (status.startsWith('credit')) return status;
    if (status.startsWith('partial')) return status;
    if (status === 'paid') return 'Paid';
    if (status === 'overdue') return 'Overdue';
    return status;
  };

  const derivedStatusById = useMemo(() => {
    const map = new Map<string, { type: 'paid' | 'overdue' | 'credit' | 'partial'; label: string }>();
    if (!payments) return map;

    const groups = new Map<string, any[]>();
    payments.forEach((p: any) => {
      const key = p.delivery_id || `no-delivery-${p.id}`;
      const arr = groups.get(key) || [];
      arr.push(p);
      groups.set(key, arr);
    });

    groups.forEach((arr) => {
      arr.sort((a: any, b: any) => {
        const at = new Date(a.created_at || a.due_date || 0).getTime();
        const bt = new Date(b.created_at || b.due_date || 0).getTime();
        if (at !== bt) return at - bt;
        return String(a.id).localeCompare(String(b.id));
      });

      const deliveryTotal = arr[0]?.deliveries?.total_amount ? Number(arr[0].deliveries.total_amount) : 0;
      let running = 0;
      arr.forEach((p: any) => {
        running += Number(p.amount || 0);
        const diff = running - deliveryTotal;
        let type: 'paid' | 'overdue' | 'credit' | 'partial';
        let label: string;
        
        if (deliveryTotal === 0) {
          // Fallback to stored status when no delivery is linked
          if (p.status.startsWith('credit')) {
            type = 'credit';
            label = p.status;
          } else if (p.status.startsWith('partial')) {
            type = 'partial';
            label = p.status;
          } else if (p.status === 'paid') {
            type = 'paid';
            label = 'Paid';
          } else if (p.status === 'overdue' || p.status === 'pending') {
            type = 'overdue';
            label = 'Overdue';
          } else {
            type = 'paid';
            label = p.status;
          }
        } else if (diff > 0) {
          type = 'credit';
          label = `credit ${Math.abs(diff)}`;
        } else if (diff < 0) {
          type = 'partial';
          label = `partial ${Math.abs(diff)}`;
        } else {
          type = 'paid';
          label = 'paid';
        }
        map.set(p.id, { type, label });
      });
    });

    return map;
  }, [payments]);

  // NEW: Reference for table container to enable horizontal scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4">
      {/* COMPACT HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Payments</h2>
          <p className="text-xs text-muted-foreground">Track customer payments</p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
          {/* NEW: Add Payment Button */}
          <Button className="bg-gradient-primary" size="sm" onClick={() => {
            setFormData({
              delivery_id: '',
              customer_id: '',
              amount: 0,
              payment_method: 'mpesa',
              mpesa_code: '',
              due_date: new Date().toISOString().split('T')[0],
              status: 'paid',
            });
            setIsFormOpen(true);
          }}>
            <Plus className="w-3 h-3 mr-1" />
            Add Payment
          </Button>
        </div>
      </div>
      
      <Card>
        {/* COMPACT CARD HEADER */}
        <CardHeader className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">All Payments - {getMonthYearString(currentMonth)}</CardTitle>
              <CardDescription className="text-xs mt-1">
                Showing {sortedPayments?.length || 0} payments
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
                {getMonthYearString(currentMonth)}
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
          ) : !sortedPayments || sortedPayments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No payments found for {getMonthYearString(currentMonth)}.
            </div>
          ) : (
            <div 
              ref={tableContainerRef}
              className="overflow-x-auto"
            >
              {/* COMPACT SCROLLABLE CONTAINER - SINGLE SCROLLBAR */}
              <div className="h-[calc(100vh-280px)] overflow-y-auto">
                {/* FIXED HEADER - NO SCROLLBAR HERE */}
                <div className="sticky top-0 z-[1000] bg-background border-b">
                  <Table className="min-w-max">
                    <TableHeader className="bg-background">
                      <TableRow className="hover:bg-transparent">
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
                        
                        {/* Note No. Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.note}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('deliveries.delivery_note_no')}
                            >
                              Note No. {getSortIcon('deliveries.delivery_note_no')}
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
                        
                        {/* Total Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.total}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('deliveries.total_amount')}
                            >
                              Total {getSortIcon('deliveries.total_amount')}
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
                        
                        {/* Paid Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.paid}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('amount')}
                            >
                              Paid {getSortIcon('amount')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('paid', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Balance Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.balance}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('balance')}
                            >
                              Balance {getSortIcon('balance')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('balance', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Mode Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.mode}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('payment_method')}
                            >
                              Mode {getSortIcon('payment_method')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('mode', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* M-Pesa Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.mpesa}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('mpesa_code')}
                            >
                              M-Pesa {getSortIcon('mpesa_code')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('mpesa', e)}
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
                              onClick={() => handleSort('status')}
                            >
                              Status {getSortIcon('status')}
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
                        
                        {/* Actions Column */}
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
                
                {/* DATA ROWS - SCROLLABLE CONTENT */}
                <div className="relative z-[500]">
                  <Table className="min-w-max">
                    <TableBody>
                      {sortedPayments.map((payment) => {
                        const derived = derivedStatusById.get(payment.id);
                        const type = derived?.type || (payment.status === 'pending' ? 'overdue' : payment.status);
                        const label = derived?.label || (payment.status === 'pending' ? 'Overdue' : payment.status);
                        
                        return (
                          <TableRow key={payment.id} className="hover:bg-gray-50">
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.date}px` }}
                            >
                              {format(new Date(payment.deliveries?.delivery_date || payment.created_at), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell 
                              className="font-medium sticky left-0 bg-background z-[1500] !important text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.customer}px` }}
                            >
                              {payment.customers?.customer_name || "Unknown"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.note}px` }}
                            >
                              {payment.deliveries?.delivery_note_no || "—"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.products}px` }}
                            >
                              {payment.deliveries?.delivery_items && payment.deliveries.delivery_items.length > 0 ? (
                                <div className="max-h-12 overflow-y-auto">
                                  {payment.deliveries.delivery_items.map((item: any, idx: number) => (
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
                              {payment.deliveries?.delivery_items && payment.deliveries.delivery_items.length > 0 ? (
                                <div className="max-h-12 overflow-y-auto">
                                  {payment.deliveries.delivery_items.map((item: any, idx: number) => (
                                    <div key={idx} className="text-xs">
                                      {item.quantity}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell 
                              className="font-semibold text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.total}px` }}
                            >
                              {payment.deliveries?.total_amount 
                                ? `KSh ${Number(payment.deliveries.total_amount).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell 
                              className="font-semibold text-green-600 text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.paid}px` }}
                            >
                              KSh {Number(payment.amount).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="font-semibold text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.balance}px` }}
                            >
                              {payment.deliveries?.total_amount ? (
                                <span className={Number(payment.deliveries.total_amount) - Number(payment.amount) > 0 
                                  ? "text-red-600" 
                                  : "text-green-600"
                                }>
                                  KSh {(Number(payment.deliveries.total_amount) - Number(payment.amount)).toLocaleString()}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell 
                              className="capitalize text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.mode}px` }}
                            >
                              {payment.payment_method}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.mpesa}px` }}
                            >
                              {payment.mpesa_code || "—"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.status}px` }}
                            >
                              <Badge className={getStatusColor(type)} variant="secondary">
                                {getStatusDisplay(label)}
                              </Badge>
                            </TableCell>
                            <TableCell 
                              className="text-right sticky right-0 bg-background z-[1500] !important text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.actions}px` }}
                            >
                              <div className="flex justify-center gap-1">
                                {/* Only show Mark Paid button for overdue payments - MasterAdmin only */}
                                {isMasterAdmin && (payment.status === "overdue" || payment.status === "pending") && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-green-600 border-green-600 hover:bg-green-50"
                                    onClick={() => updatePaymentStatus.mutate({ 
                                      id: payment.id, 
                                      status: "paid", 
                                      deliveryId: payment.delivery_id 
                                    })}
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                  </Button>
                                )}
                                {isMasterAdmin && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDelete(payment.id)}>
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
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

      {/* ADD PAYMENT FORM MODAL - COMPLETELY FIXED */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Add New Payment
                </h3>
                <button 
                  onClick={() => {
                    setIsFormOpen(false);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {loadingData ? (
                <div className="text-center py-8">Loading form data...</div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Delivery *</label>
                      <select
                        name="delivery_id"
                        value={formData.delivery_id}
                        onChange={(e) => handleDeliveryChange(e.target.value)}
                        required
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Delivery</option>
                        {deliveries.map(delivery => (
                          <option key={delivery.id} value={delivery.id}>
                            {delivery.delivery_note_no || delivery.id} - {delivery.total_amount}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Amount *</label>
                      <input
                        type="number"
                        name="amount"
                        value={formData.amount}
                        onChange={handleInputChange}
                        min="0"
                        step="0.01"
                        required
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Method</label>
                      <select
                        name="payment_method"
                        value={formData.payment_method}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">M-Pesa Code</label>
                      <input
                        type="text"
                        name="mpesa_code"
                        value={formData.mpesa_code}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Due Date</label>
                      <input
                        type="date"
                        name="due_date"
                        value={formData.due_date}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => {
                        setIsFormOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create Payment
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE DIALOG - SOLID BACKGROUND */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Delete Payment</h3>
                <button 
                  onClick={() => setDeleteDialogOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <p>
                  Are you sure you want to delete this payment? This action cannot be undone.
                </p>
                
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={confirmDelete} 
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExcelUploadDialog
        open={isExcelUploadOpen}
        onOpenChange={setIsExcelUploadOpen}
        type="payments"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["payments"] })}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
