import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Upload, CheckCircle, Clock, AlertCircle, CreditCard, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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

export function PaymentsSection() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isMasterAdmin = userRole === 'MasterAdmin';
  const queryClient = useQueryClient();
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [addingPayment, setAddingPayment] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState<{deliveryId: string, payments: any[]} | null>(null); // NEW: State for payment history
  
  // NEW: Form state for editing
  const [editFormData, setEditFormData] = useState({
    id: '',
    customer_id: '',
    delivery_id: '',
    amount: 0, // Current amount to edit
    payment_method: 'cash',
    mpesa_code: '',
    status: 'pending'
  });

  // NEW: Form state for adding
  const [addFormData, setAddFormData] = useState({
    customer_id: '',
    delivery_id: '',
    amount: 0, // NEW amount to add
    credit_available: 0, // Available credit for customer
    use_credit: false, // Whether to use credit
    payment_method: 'cash',
    mpesa_code: '',
    status: 'pending'
  });

  // NEW: Loading states for dependent data
  const [customers, setCustomers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [customerCredits, setCustomerCredits] = useState<Record<string, number>>({}); // NEW: Store customer credits
  const [loadingData, setLoadingData] = useState(true);

  // NEW: Load dependent data including credits
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      try {
        const [{ data: customersData }, { data: deliveriesData }, { data: paymentsData }] = await Promise.all([
          supabase.from('customers').select('*'),
          supabase.from('deliveries').select(`
            id,
            delivery_note_no,
            delivery_date,
            total_amount,
            payment_status,
            customer_id
          `),
          supabase.from('payments').select(`
            id,
            customer_id,
            amount,
            status,
            delivery_id,
            due_date,
            created_at,
            payment_method,
            mpesa_code
          `)
        ]);
        
        setCustomers(customersData || []);
        setDeliveries(deliveriesData || []);
        
        // NEW: Calculate customer credits from all payments
        const credits: Record<string, number> = {};
        paymentsData?.forEach((payment: any) => {
          if (payment.status === 'credit') {
            const existing = credits[payment.customer_id] || 0;
            credits[payment.customer_id] = existing + Number(payment.amount || 0);
          }
        });
        setCustomerCredits(credits);
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

  // NEW: Calculate total paid for a delivery (excluding credit records)
  const calculateTotalPaid = (deliveryId: string) => {
    if (!payments) return 0;
    
    const deliveryPayments = payments.filter((p: any) => p.delivery_id === deliveryId && p.status !== 'credit');
    return deliveryPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  };

  // NEW: Get all payments for a delivery (for history, excluding credit records)
  const getDeliveryPayments = (deliveryId: string) => {
    if (!payments) return [];
    
    return payments.filter((p: any) => p.delivery_id === deliveryId && p.status !== 'credit');
  };

  // NEW: Calculate balance for a delivery
  const calculateBalance = (deliveryId: string) => {
    const delivery = deliveries.find((d: any) => d.id === deliveryId);
    if (!delivery) return 0;
    
    const totalAmount = Number(delivery.total_amount || 0);
    const totalPaid = calculateTotalPaid(deliveryId);
    return totalAmount - totalPaid;
  };

  // NEW: Get customer credit
  const getCustomerCredit = (customerId: string) => {
    return customerCredits[customerId] || 0;
  };

  // NEW: Handle edit form input changes
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setEditFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? Number(val) : val
    }));
  };

  // NEW: Handle add form input changes
  const handleAddInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setAddFormData(prev => ({
      ...prev,
      [name]: name === 'amount' || name === 'credit_available' ? Number(val) : val
    }));
  };

  // NEW: Handle delivery change in add form to update credit
  const handleAddDeliveryChange = (deliveryId: string) => {
    const delivery = deliveries.find((d: any) => d.id === deliveryId);
    if (delivery) {
      const customerCredit = getCustomerCredit(delivery.customer_id);
      setAddFormData(prev => ({
        ...prev,
        delivery_id: deliveryId,
        credit_available: customerCredit
      }));
    }
  };

  // NEW: Handle customer change in add form to update credit and filter deliveries
  const handleAddCustomerChange = (customerId: string) => {
    const customerCredit = getCustomerCredit(customerId);
    setAddFormData(prev => ({
      ...prev,
      customer_id: customerId,
      delivery_id: '', // Reset delivery when customer changes
      credit_available: customerCredit
    }));
  };

  // NEW: Handle payment history click
  const handlePaymentHistoryClick = (deliveryId: string) => {
    const deliveryPayments = getDeliveryPayments(deliveryId);
    setShowPaymentHistory({ deliveryId, payments: deliveryPayments });
  };

  // NEW: Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // NEW: Monthly navigation
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // NEW: Column widths state
  const [columnWidths, setColumnWidths] = useState({
    delivery_date: 100,
    customer: 150,
    delivery: 100,
    products: 120,
    qty: 80,
    rate: 100,
    total: 100,
    amount: 100,
    balance: 100,
    payments: 80, // NEW: Width for payment count
    method: 100,
    code: 100,
    status: 100,
    actions: 140 // Increased for two buttons
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
            delivery_note_no,
            total_amount,
            payment_status,
            delivery_date,
            delivery_items (
              product_name,
              quantity
            ),
            customers (customer_name)
          )
        `)
        .gte("created_at", monthStart.toISOString().split('T')[0])
        .lte("created_at", monthEnd.toISOString().split('T')[0])
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // NEW: Client-side sorting with proper numeric handling
  const sortedPayments = useMemo(() => {
    if (!payments) return [];
    
    // Filter out credit records and overpayment records for display
    const filteredPayments = payments.filter(payment => {
      // Skip credit records
      if (payment.status === 'credit') return false;
      // Skip overpayment helper records
      if (payment.payment_method && payment.payment_method.startsWith('OVERPAY:')) return false;
      return true;
    });
    
    return [...filteredPayments].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'deliveries.delivery_date':
          aValue = new Date(a.deliveries?.delivery_date || 0).getTime();
          bValue = new Date(b.deliveries?.delivery_date || 0).getTime();
          break;
        case 'customers.customer_name':
          aValue = (a.customers?.customer_name || "").toLowerCase();
          bValue = (b.customers?.customer_name || "").toLowerCase();
          break;
        case 'deliveries.delivery_note_no':
          // NEW: Handle numeric sorting for delivery note numbers
          const aNum = parseInt(a.deliveries?.delivery_note_no?.replace(/\D/g, '') || '0');
          const bNum = parseInt(b.deliveries?.delivery_note_no?.replace(/\D/g, '') || '0');
          return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
        case 'amount':
          aValue = a.amount || 0;
          bValue = b.amount || 0;
          break;
        case 'deliveries.total_amount':
          aValue = a.deliveries?.total_amount || 0;
          bValue = b.deliveries?.total_amount || 0;
          break;
        case 'due_date':
          aValue = new Date(a.due_date || 0).getTime();
          bValue = new Date(b.due_date || 0).getTime();
          break;
        case 'payment_method':
          aValue = (a.payment_method || "").toLowerCase();
          bValue = (b.payment_method || "").toLowerCase();
          break;
        case 'status':
          aValue = (a.status || "").toLowerCase();
          bValue = (b.status || "").toLowerCase();
          break;
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

  const getStatusColor = (status: string) => {
    if (status === 'paid' || status === 'completed') return "bg-green-100 text-green-800 border border-green-300";
    if (status === 'overdue') return "bg-red-100 text-red-800 border border-red-300";
    if (status === 'pending') return "bg-blue-100 text-blue-800 border border-blue-300";
    if (status === 'pending_verification') return "bg-orange-100 text-orange-800 border border-orange-300";
    if (status === 'rejected' || status === 'failed') return "bg-red-100 text-red-800 border border-red-300";
    if (status === 'credit') return "bg-violet-100 text-violet-800 border border-violet-300";
    return "bg-gray-500/10 text-gray-500";
  };

  // NEW: Update payment mutation - modifies existing payment record
  const updatePaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      // Calculate new total for delivery after updating this payment
      const delivery = deliveries.find((d: any) => d.id === paymentData.delivery_id);
      const deliveryTotal = Number(delivery?.total_amount || 0);
      
      // Get all payments for this delivery except the one being updated (excluding credit)
      const otherPayments = payments?.filter((p: any) => 
        p.delivery_id === paymentData.delivery_id && p.id !== paymentData.id && p.status !== 'credit'
      ) || [];
      const otherTotal = otherPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      
      // New total after this payment update
      const newTotalPaid = otherTotal + Number(paymentData.amount || 0);
      
      // Determine new status based on total
      let finalStatusCalculated = 'pending';
      if (newTotalPaid >= deliveryTotal) {
        finalStatusCalculated = 'paid';
      } else if (newTotalPaid === 0) {
        finalStatusCalculated = 'pending';
      } else if (newTotalPaid < deliveryTotal) {
        finalStatusCalculated = 'pending'; // Use 'pending' instead of 'partial'
      }
      
      // Update the existing payment record
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .update({
          amount: paymentData.amount,
          payment_method: paymentData.payment_method,
          mpesa_code: paymentData.mpesa_code,
          status: finalStatusCalculated
        })
        .eq('id', paymentData.id)
        .select()
        .single();

      if (paymentError) throw paymentError;
      
      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({ payment_status: finalStatusCalculated })
        .eq('id', paymentData.delivery_id);

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Payment updated",
        description: "Payment has been updated successfully.",
      });
      setIsEditFormOpen(false);
      setEditingPayment(null);
      setEditFormData({
        id: '',
        customer_id: '',
        delivery_id: '',
        amount: 0,
        payment_method: 'cash',
        mpesa_code: '',
        status: 'pending'
      });
    },
    onError: (error: any) => {
      console.error('Update error:', error);
      toast({
        title: "Error",
        description: `Failed to update payment: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // NEW: Add payment mutation - creates ONLY ONE payment record for same delivery
  const addPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      // Validate that delivery_id is provided
      if (!paymentData.delivery_id) {
        throw new Error('Please select a delivery');
      }
      
      // Create ONLY ONE payment record - let your system handle overpayment logic
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          customer_id: paymentData.customer_id,
          delivery_id: paymentData.delivery_id,
          amount: paymentData.amount, // This is the NEW amount to add
          due_date: new Date().toISOString().split('T')[0], // Use today's date to satisfy not-null constraint
          payment_method: paymentData.payment_method,
          mpesa_code: paymentData.mpesa_code,
          status: 'pending' // Will be updated by your system's overpayment logic
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Payment added",
        description: "New payment has been added successfully.",
      });
      setIsAddFormOpen(false);
      setAddingPayment(null);
      setAddFormData({
        customer_id: '',
        delivery_id: '',
        amount: 0,
        credit_available: 0,
        use_credit: false,
        payment_method: 'cash',
        mpesa_code: '',
        status: 'pending'
      });
    },
    onError: (error: any) => {
      console.error('Add error:', error);
      toast({
        title: "Error",
        description: `Failed to add payment: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

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

  const handleEdit = (payment: any) => {
    // Only allow editing non-credit payments
    if (payment.status === 'credit') {
      toast({
        title: "Cannot Edit",
        description: "Credit records cannot be edited.",
        variant: "destructive",
      });
      return;
    }
    
    // Populate edit form data with payment details
    setEditFormData({
      id: payment.id,
      customer_id: payment.customer_id || '',
      delivery_id: payment.delivery_id || '',
      amount: payment.amount || 0,
      payment_method: payment.payment_method || 'cash',
      mpesa_code: payment.mpesa_code || '',
      status: payment.status || 'pending'
    });
    setEditingPayment(payment);
    setIsEditFormOpen(true);
  };

  const handleAddPayment = (payment: any) => {
    const customerCredit = getCustomerCredit(payment.customer_id);
    // Populate add form data with delivery info
    setAddFormData({
      customer_id: payment.customer_id || '',
      delivery_id: payment.delivery_id || '',
      amount: 0, // Start with 0 for new payment
      credit_available: customerCredit, // Show available credit
      use_credit: customerCredit > 0, // Auto-enable if credit available
      payment_method: 'cash',
      mpesa_code: '',
      status: 'pending'
    });
    setAddingPayment(payment);
    setIsAddFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setPaymentToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (paymentToDelete) {
      deleteMutation.mutate(paymentToDelete);
    }
  };

  // NEW: Handle edit form submission
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingPayment && editFormData.id) {
      // Update existing payment (modifies specific record)
      updatePaymentMutation.mutate(editFormData);
    }
  };

  // NEW: Handle add form submission
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (addingPayment) {
      // Add new payment to delivery (creates ONLY ONE record)
      addPaymentMutation.mutate(addFormData);
    }
  };

  // NEW: Reference for table container
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // NEW: Format month display
  const formattedMonth = formatDate(currentMonth, 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* COMPACT HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Payments</h2>
          <p className="text-xs text-muted-foreground">Manage customer payments</p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
          <Button className="bg-gradient-primary" size="sm" onClick={() => {
            setAddingPayment(null);
            setAddFormData({
              customer_id: '',
              delivery_id: '',
              amount: 0,
              credit_available: 0,
              use_credit: false,
              payment_method: 'cash',
              mpesa_code: '',
              status: 'pending'
            });
            setIsAddFormOpen(true);
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
              <CardTitle className="text-sm">Payment Records - {formattedMonth}</CardTitle>
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
          {isLoading || loadingData ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
          ) : !sortedPayments || sortedPayments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No payments found for {formattedMonth}.
            </div>
          ) : (
            <div 
              ref={tableContainerRef}
              className="overflow-x-auto"
            >
              {/* COMPACT SCROLLABLE CONTAINER */}
              <div className="h-[calc(100vh-280px)] overflow-y-auto">
                {/* FIXED HEADER */}
                <div className="sticky top-0 z-[1000] bg-background border-b">
                  <Table className="min-w-max">
                    <TableHeader className="bg-background">
                      <TableRow className="hover:bg-transparent">
                        {/* Delivery Date Column - FIRST COLUMN */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.delivery_date}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('deliveries.delivery_date')}
                            >
                              Delivery Date {getSortIcon('deliveries.delivery_date')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('delivery_date', e)}
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
                        
                        {/* Delivery Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.delivery}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('deliveries.delivery_note_no')}
                            >
                              Delivery {getSortIcon('deliveries.delivery_note_no')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('delivery', e)}
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
                              onClick={() => handleSort('deliveries.total_amount')}
                            >
                              Rate {getSortIcon('deliveries.total_amount')}
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
                        
                        {/* Amount Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.amount}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('amount')}
                            >
                              Paid Amount {getSortIcon('amount')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('amount', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Balance Column */}
                        <TableHead 
                          className="text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.balance}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span className="flex-1 text-left">Balance</span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('balance', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Payment Count Column - NEW */}
                        <TableHead 
                          className="text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.payments}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span className="flex-1 text-left">Payments</span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('payments', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Method Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.method}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('payment_method')}
                            >
                              Payment Mode {getSortIcon('payment_method')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('method', e)}
                              style={{ cursor: 'col-resize' }}
                            >
                              <div className="w-px h-full bg-gray-300 hover:bg-blue-500"></div>
                            </div>
                          </div>
                        </TableHead>
                        
                        {/* Code Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.code}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('mpesa_code')}
                            >
                              M-Pesa Code {getSortIcon('mpesa_code')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('code', e)}
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
                
                {/* DATA ROWS */}
                <div className="relative z-[500]">
                  <Table className="min-w-max">
                    <TableBody>
                      {sortedPayments.map((payment) => {
                        const deliveryTotal = payment.deliveries?.total_amount || 0;
                        const totalPaid = calculateTotalPaid(payment.delivery_id);
                        const balance = deliveryTotal - totalPaid;
                        const deliveryPayments = getDeliveryPayments(payment.delivery_id);
                        const statusColor = getStatusColor(payment.status);
                        
                        return (
                          <TableRow key={payment.id} className="hover:bg-gray-50">
                            {/* Delivery Date - FIRST COLUMN */}
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.delivery_date}px` }}
                            >
                              {payment.deliveries?.delivery_date ? format(new Date(payment.deliveries.delivery_date), "dd/MM/yyyy") : "—"}
                            </TableCell>
                            
                            <TableCell 
                              className="font-medium sticky left-0 bg-background z-[1500] !important text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.customer}px` }}
                            >
                              {payment.customers?.customer_name || "Unknown"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.delivery}px` }}
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
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.rate}px` }}
                            >
                              {Number(payment.deliveries?.total_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 font-semibold text-center align-middle"
                              style={{ width: `${columnWidths.total}px` }}
                            >
                              KSh {Number(payment.deliveries?.total_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.amount}px` }}
                            >
                              KSh {Number(totalPaid).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.balance}px` }}
                            >
                              {balance > 0 ? (
                                <span className="text-red-600">
                                  KSh {balance.toLocaleString()}
                                </span>
                              ) : balance < 0 ? (
                                <span className="text-blue-600">
                                  Credit KSh {Math.abs(balance).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-green-600">
                                  KSh {balance.toLocaleString()}
                                </span>
                              )}
                            </TableCell>
                            {/* Payment Count Column - NEW with clickable badge */}
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.payments}px` }}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePaymentHistoryClick(payment.delivery_id)}
                                className="text-[10px] h-6 px-2"
                              >
                                {deliveryPayments.length} payment{deliveryPayments.length !== 1 ? 's' : ''}
                              </Button>
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.method}px` }}
                            >
                              {payment.payment_method}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.code}px` }}
                            >
                              {payment.mpesa_code || "—"}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.status}px` }}
                            >
                              <Badge className={statusColor} variant="secondary">
                                {balance < 0 ? 'Credit' : payment.status}
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
                                    size="sm" 
                                    onClick={() => handleEdit(payment)}
                                    className="z-[3000]"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleAddPayment(payment)}
                                    className="z-[3000]"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleDelete(payment.id)}
                                    className="z-[3000]"
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

      {/* EDIT PAYMENT MODAL - FOR MODIFYING EXISTING PAYMENT */}
      {isEditFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Edit Payment
                </h3>
                <button 
                  onClick={() => {
                    setIsEditFormOpen(false);
                    setEditingPayment(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {loadingData ? (
                <div className="text-center py-8">Loading data...</div>
              ) : (
                <form onSubmit={handleEditSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Customer *</label>
                      <select
                        name="customer_id"
                        value={editFormData.customer_id}
                        onChange={(e) => setEditFormData(prev => ({...prev, customer_id: e.target.value}))}
                        required
                        className="w-full p-2 border rounded"
                        disabled={true} // Disable during edit
                      >
                        <option value="">Select Customer</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.customer_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Delivery</label>
                      <input
                        type="text"
                        value={deliveries.find(d => d.id === editFormData.delivery_id)?.delivery_note_no || "Unknown"}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">New Amount *</label>
                      <input
                        type="number"
                        name="amount"
                        value={editFormData.amount}
                        onChange={handleEditInputChange}
                        min="0"
                        required
                        className="w-full p-2 border rounded"
                        placeholder="Enter new payment amount"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Mode</label>
                      <select
                        name="payment_method"
                        value={editFormData.payment_method}
                        onChange={handleEditInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="cash">Cash</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="card">Card</option>
                        <option value="bank">Bank</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">M-Pesa Code</label>
                      <input
                        type="text"
                        name="mpesa_code"
                        value={editFormData.mpesa_code}
                        onChange={handleEditInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        name="status"
                        value={editFormData.status}
                        onChange={handleEditInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="pending_verification">Pending Verification</option>
                        <option value="rejected">Rejected</option>
                        <option value="failed">Failed</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => {
                        setIsEditFormOpen(false);
                        setEditingPayment(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={updatePaymentMutation.isPending}
                    >
                      {updatePaymentMutation.isPending ? 'Updating...' : 'Update Payment'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD PAYMENT MODAL - FOR CREATING NEW PAYMENT FOR SAME DELIVERY */}
      {isAddFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Add New Payment
                </h3>
                <button 
                  onClick={() => {
                    setIsAddFormOpen(false);
                    setAddingPayment(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {loadingData ? (
                <div className="text-center py-8">Loading data...</div>
              ) : (
                <form onSubmit={handleAddSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Customer *</label>
                      <select
                        name="customer_id"
                        value={addFormData.customer_id}
                        onChange={(e) => handleAddCustomerChange(e.target.value)}
                        required
                        className="w-full p-2 border rounded"
                        disabled={!!addingPayment} // Disable if pre-filled
                      >
                        <option value="">Select Customer</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.customer_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Delivery</label>
                      <select
                        name="delivery_id"
                        value={addFormData.delivery_id}
                        onChange={(e) => handleAddDeliveryChange(e.target.value)}
                        required
                        className="w-full p-2 border rounded"
                        disabled={!addFormData.customer_id} // Only enable when customer is selected
                      >
                        <option value="">Select Delivery</option>
                        {deliveries.filter(d => !addFormData.customer_id || d.customer_id === addFormData.customer_id).map(delivery => {
                          const totalPaid = calculateTotalPaid(delivery.id);
                          const balance = delivery.total_amount - totalPaid;
                          const paymentCount = getDeliveryPayments(delivery.id).length;
                          return (
                            <option key={delivery.id} value={delivery.id}>
                              {delivery.delivery_note_no} - Total: KSh {Number(delivery.total_amount).toLocaleString()}, Paid: KSh {Number(totalPaid).toLocaleString()}, Balance: KSh {Number(balance).toLocaleString()} ({paymentCount} payment{paymentCount !== 1 ? 's' : ''})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Amount to Add *</label>
                      <input
                        type="number"
                        name="amount"
                        value={addFormData.amount}
                        onChange={handleAddInputChange}
                        min="0"
                        required
                        className="w-full p-2 border rounded"
                        placeholder="Enter payment amount"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Available Credit</label>
                      <input
                        type="number"
                        value={addFormData.credit_available}
                        readOnly
                        className="w-full p-2 border rounded bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Use Credit?</label>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="use_credit"
                          checked={addFormData.use_credit}
                          onChange={handleAddInputChange}
                          className="mr-2"
                        />
                        <span>Apply credit to this payment</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Mode</label>
                      <select
                        name="payment_method"
                        value={addFormData.payment_method}
                        onChange={handleAddInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="cash">Cash</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="card">Card</option>
                        <option value="bank">Bank</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">M-Pesa Code</label>
                      <input
                        type="text"
                        name="mpesa_code"
                        value={addFormData.mpesa_code}
                        onChange={handleAddInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        name="status"
                        value={addFormData.status}
                        onChange={handleAddInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="pending_verification">Pending Verification</option>
                        <option value="rejected">Rejected</option>
                        <option value="failed">Failed</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => {
                        setIsAddFormOpen(false);
                        setAddingPayment(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={addPaymentMutation.isPending || !addFormData.delivery_id}
                    >
                      {addPaymentMutation.isPending ? 'Adding...' : 'Add Payment'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT HISTORY MODAL - NEW */}
      {showPaymentHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Payment History for Delivery {showPaymentHistory.payments[0]?.deliveries?.delivery_note_no || 'Unknown'}
                </h3>
                <button 
                  onClick={() => setShowPaymentHistory(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-2">
                {showPaymentHistory.payments.map((payment: any) => (
                  <div key={payment.id} className="border p-3 rounded">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><strong>Date:</strong> {format(new Date(payment.created_at), "dd/MM/yyyy HH:mm")}</div>
                      <div><strong>Amount:</strong> KSh {Number(payment.amount).toLocaleString()}</div>
                      <div><strong>Method:</strong> {payment.payment_method}</div>
                      <div><strong>Status:</strong> {payment.status}</div>
                      {payment.mpesa_code && (
                        <div className="col-span-2"><strong>M-Pesa Code:</strong> {payment.mpesa_code}</div>
                      )}
                    </div>
                  </div>
                ))}
                
                {showPaymentHistory.payments.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    No payment history found for this delivery.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE DIALOG - MATCHING DELIVERIES STYLE */}
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
    </div>
  );
}
