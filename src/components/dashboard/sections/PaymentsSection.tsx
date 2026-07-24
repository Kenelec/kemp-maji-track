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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  
  // NEW: Form state for editing
  const [formData, setFormData] = useState({
    id: '',
    customer_id: '',
    delivery_id: '',
    amount: 0,
    due_date: '',
    payment_method: 'cash',
    mpesa_code: '',
    status: 'pending',
    use_credit: false // NEW: Flag to use credit
  });

  // NEW: Loading states for dependent data
  const [customers, setCustomers] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]); // NEW: Store credits
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
            customers (customer_name)
          `),
          supabase.from('payments').select(`
            *,
            customers (customer_name),
            deliveries (total_amount)
          `)
        ]);
        
        setCustomers(customersData || []);
        setDeliveries(deliveriesData || []);
        
        // NEW: Calculate credits for each customer
        const customerCredits = new Map();
        paymentsData?.forEach((payment: any) => {
          if (payment.status === 'credit') {
            const existing = customerCredits.get(payment.customer_id) || 0;
            customerCredits.set(payment.customer_id, existing + Number(payment.amount || 0));
          }
        });
        
        setCredits(Array.from(customerCredits.entries()).map(([customerId, amount]) => ({
          customer_id: customerId,
          amount: Number(amount)
        })));
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

  // NEW: Calculate balance for a delivery
  const calculateBalance = (delivery: any) => {
    if (!delivery) return 0;
    
    const totalAmount = Number(delivery.total_amount || 0);
    const paidAmount = Number(delivery.paid_amount || 0);
    return totalAmount - paidAmount;
  };

  // NEW: Calculate credit for a customer
  const getCustomerCredit = (customerId: string) => {
    const credit = credits.find(c => c.customer_id === customerId);
    return credit ? Number(credit.amount) : 0;
  };

  // NEW: Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? Number(val) : val
    }));
  };

  // NEW: Handle delivery change to update amount based on balance
  const handleDeliveryChange = (deliveryId: string) => {
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (delivery) {
      const balance = calculateBalance(delivery);
      setFormData(prev => ({
        ...prev,
        delivery_id: deliveryId,
        amount: Math.min(balance, prev.amount) // Don't exceed balance
      }));
    }
  };

  // NEW: Handle customer change to update credit option
  const handleCustomerChange = (customerId: string) => {
    const customerCredit = getCustomerCredit(customerId);
    setFormData(prev => ({
      ...prev,
      customer_id: customerId,
      use_credit: customerCredit > 0
    }));
  };

  // NEW: Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // NEW: Monthly navigation
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // NEW: Column widths state
  const [columnWidths, setColumnWidths] = useState({
    customer: 150,
    delivery: 100,
    products: 120,
    qty: 80,
    rate: 100,
    total: 100,
    amount: 100,
    balance: 100,
    due: 100,
    method: 100,
    code: 100,
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
            delivery_note_no,
            total_amount,
            payment_status,
            delivery_date,
            delivery_items (
              product_name,
              quantity
            )
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
    
    return [...payments].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
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
    if (status === 'credit') return "bg-blue-500/10 text-blue-500";
    if (status === 'pending') return "bg-yellow-500/10 text-yellow-500";
    if (status === 'paid') return "bg-green-500/10 text-green-500";
    if (status === 'overdue') return "bg-red-500/10 text-red-500";
    if (status === 'partial') return "bg-orange-500/10 text-orange-500";
    return "bg-gray-500/10 text-gray-500";
  };

  // NEW: Create payment mutation with correct status values
  const createPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      const delivery = deliveries.find(d => d.id === paymentData.delivery_id);
      const customerCredit = getCustomerCredit(paymentData.customer_id);
      
      let finalAmount = Number(paymentData.amount || 0);
      let finalStatus = paymentData.status;
      let creditToUse = 0;
      
      // NEW: Handle credit usage
      if (paymentData.use_credit && customerCredit > 0) {
        creditToUse = Math.min(customerCredit, finalAmount);
        finalAmount -= creditToUse;
      }
      
      // NEW: Calculate balance and determine status
      const deliveryTotal = Number(delivery?.total_amount || 0);
      const existingPayments = payments?.filter(p => p.delivery_id === paymentData.delivery_id) || [];
      const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const remainingBalance = deliveryTotal - totalPaid;
      
      // NEW: Determine payment status based on amount (using correct values)
      if (finalAmount >= remainingBalance) {
        finalStatus = 'paid';
      } else if (finalAmount === 0 && creditToUse >= remainingBalance) {
        finalStatus = 'paid';
      } else if (finalAmount > 0) {
        finalStatus = 'partial';
      }
      
      // NEW: Process payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([{
          customer_id: paymentData.customer_id,
          delivery_id: paymentData.delivery_id,
          amount: finalAmount,
          due_date: paymentData.due_date,
          payment_method: paymentData.payment_method,
          mpesa_code: paymentData.mpesa_code,
          status: finalStatus
        }])
        .select()
        .single();

      if (paymentError) throw paymentError;
      
      // NEW: Handle credit creation if overpayment occurs
      if (finalAmount > remainingBalance) {
        const overpayment = finalAmount - remainingBalance;
        const creditAmount = overpayment + creditToUse;
        
        await supabase
          .from('payments')
          .insert([{
            customer_id: paymentData.customer_id,
            amount: creditAmount,
            due_date: new Date().toISOString().split('T')[0],
            payment_method: paymentData.payment_method,
            status: 'credit'
          }]);
      }
      
      // NEW: Update delivery payment status
      await supabase
        .from('deliveries')
        .update({ payment_status: finalStatus })
        .eq('id', paymentData.delivery_id);

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Payment created",
        description: "Payment has been created successfully.",
      });
      setIsFormOpen(false);
      setEditingPayment(null);
      setFormData({
        id: '',
        customer_id: '',
        delivery_id: '',
        amount: 0,
        due_date: '',
        payment_method: 'cash',
        mpesa_code: '',
        status: 'pending',
        use_credit: false
      });
    },
    onError: (error: any) => {
      console.error('Create error:', error);
      toast({
        title: "Error",
        description: `Failed to create payment: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // NEW: Update payment mutation with correct status values
  const updatePaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      const delivery = deliveries.find(d => d.id === paymentData.delivery_id);
      const customerCredit = getCustomerCredit(paymentData.customer_id);
      
      let finalAmount = Number(paymentData.amount || 0);
      let finalStatus = paymentData.status;
      let creditToUse = 0;
      
      // NEW: Handle credit usage
      if (paymentData.use_credit && customerCredit > 0) {
        creditToUse = Math.min(customerCredit, finalAmount);
        finalAmount -= creditToUse;
      }
      
      // NEW: Calculate balance and determine status
      const deliveryTotal = Number(delivery?.total_amount || 0);
      const existingPayments = payments?.filter(p => p.delivery_id === paymentData.delivery_id && p.id !== paymentData.id) || [];
      const totalPaid = existingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const remainingBalance = deliveryTotal - totalPaid;
      
      // NEW: Determine payment status based on amount (using correct values)
      if (finalAmount >= remainingBalance) {
        finalStatus = 'paid';
      } else if (finalAmount === 0 && creditToUse >= remainingBalance) {
        finalStatus = 'paid';
      } else if (finalAmount > 0) {
        finalStatus = 'partial';
      }
      
      // NEW: Update payment
      const { data: updatedPayment, error: paymentError } = await supabase
        .from('payments')
        .update({
          customer_id: paymentData.customer_id,
          delivery_id: paymentData.delivery_id,
          amount: finalAmount,
          due_date: paymentData.due_date,
          payment_method: paymentData.payment_method,
          mpesa_code: paymentData.mpesa_code,
          status: finalStatus
        })
        .eq('id', paymentData.id)
        .select()
        .single();

      if (paymentError) throw paymentError;
      
      // NEW: Handle credit creation if overpayment occurs
      if (finalAmount > remainingBalance) {
        const overpayment = finalAmount - remainingBalance;
        const creditAmount = overpayment + creditToUse;
        
        await supabase
          .from('payments')
          .insert([{
            customer_id: paymentData.customer_id,
            amount: creditAmount,
            due_date: new Date().toISOString().split('T')[0],
            payment_method: paymentData.payment_method,
            status: 'credit'
          }]);
      }
      
      // NEW: Update delivery payment status
      await supabase
        .from('deliveries')
        .update({ payment_status: finalStatus })
        .eq('id', paymentData.delivery_id);

      return updatedPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Payment updated",
        description: "Payment has been updated successfully.",
      });
      setIsFormOpen(false);
      setEditingPayment(null);
      setFormData({
        id: '',
        customer_id: '',
        delivery_id: '',
        amount: 0,
        due_date: '',
        payment_method: 'cash',
        mpesa_code: '',
        status: 'pending',
        use_credit: false
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
    // Populate form data with payment details
    setFormData({
      id: payment.id,
      customer_id: payment.customer_id || '',
      delivery_id: payment.delivery_id || '',
      amount: payment.amount || 0,
      due_date: payment.due_date || '',
      payment_method: payment.payment_method || 'cash',
      mpesa_code: payment.mpesa_code || '',
      status: payment.status || 'pending',
      use_credit: getCustomerCredit(payment.customer_id) > 0
    });
    setEditingPayment(payment);
    setIsFormOpen(true);
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

  // NEW: Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingPayment && formData.id) {
      updatePaymentMutation.mutate(formData);
    } else {
      createPaymentMutation.mutate(formData);
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
            setEditingPayment(null);
            setFormData({
              id: '',
              customer_id: '',
              delivery_id: '',
              amount: 0,
              due_date: '',
              payment_method: 'cash',
              mpesa_code: '',
              status: 'pending',
              use_credit: false
            });
            setIsFormOpen(true);
          }}>
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
                        
                        {/* Due Date Column */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 text-xs py-1 px-2 text-center"
                          style={{ width: `${columnWidths.due}px` }}
                        >
                          <div className="flex items-center justify-between w-full h-full">
                            <span 
                              className="flex-1 text-left"
                              onClick={() => handleSort('due_date')}
                            >
                              Due Date {getSortIcon('due_date')}
                            </span>
                            <div
                              className="resize-handle w-2 h-full bg-transparent hover:bg-blue-200 cursor-col-resize flex items-center justify-center"
                              onMouseDown={(e) => handleResizeStart('due', e)}
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
                        const paidAmount = payment.amount || 0;
                        const balance = deliveryTotal - paidAmount;
                        const statusColor = getStatusColor(payment.status);
                        
                        return (
                          <TableRow key={payment.id} className="hover:bg-gray-50">
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
                              KSh {Number(paidAmount).toLocaleString()}
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.balance}px` }}
                            >
                              <span className={balance > 0 ? "text-red-600" : "text-green-600"}>
                                KSh {balance.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell 
                              className="text-xs py-1 px-2 text-center align-middle"
                              style={{ width: `${columnWidths.due}px` }}
                            >
                              {payment.due_date ? format(new Date(payment.due_date), "dd/MM/yyyy") : "—"}
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
                                {payment.status}
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

      {/* EDIT FORM MODAL - WITH CREDIT SYSTEM */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingPayment ? "Edit Payment" : "Create New Payment"}
                </h3>
                <button 
                  onClick={() => {
                    setIsFormOpen(false);
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
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Customer *</label>
                      <select
                        name="customer_id"
                        value={formData.customer_id}
                        onChange={(e) => handleCustomerChange(e.target.value)}
                        required
                        className="w-full p-2 border rounded"
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
                        value={formData.delivery_id}
                        onChange={(e) => handleDeliveryChange(e.target.value)}
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Delivery</option>
                        {deliveries.filter(d => d.customer_id === formData.customer_id).map(delivery => (
                          <option key={delivery.id} value={delivery.id}>
                            {delivery.delivery_note_no} - KSh {Number(delivery.total_amount).toLocaleString()}
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
                        required
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
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Mode</label>
                      <select
                        name="payment_method"
                        value={formData.payment_method}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="cash">Cash</option>
                        <option value="mpesa">M-Pesa</option>
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
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="partial">Partial</option>
                        <option value="overdue">Overdue</option>
                        <option value="credit">Credit</option>
                      </select>
                    </div>
                    {getCustomerCredit(formData.customer_id) > 0 && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="use_credit"
                          checked={formData.use_credit}
                          onChange={handleInputChange}
                          className="mr-2"
                        />
                        <label className="text-sm font-medium">
                          Use Credit (KSh {getCustomerCredit(formData.customer_id).toLocaleString()})
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => {
                        setIsFormOpen(false);
                        setEditingPayment(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={updatePaymentMutation.isPending || createPaymentMutation.isPending}
                    >
                      {updatePaymentMutation.isPending || createPaymentMutation.isPending 
                        ? (editingPayment ? 'Updating...' : 'Creating...') 
                        : editingPayment ? 'Update Payment' : 'Create Payment'}
                    </Button>
                  </div>
                </form>
              )}
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
