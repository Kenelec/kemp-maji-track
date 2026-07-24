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
import { NotificationService } from "@/services/notificationService";
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
  const { userRole, user } = useAuth();
  const isMasterAdmin = userRole === 'MasterAdmin';
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deliveryToDelete, setDeliveryToDelete] = useState<string | null>(null);
  const [hasLinkedPayments, setHasLinkedPayments] = useState(false);
  
  // NEW: Form state for editing
  const [formData, setFormData] = useState({
    id: '',
    customer_id: '',
    delivery_date: '',
    delivery_note_no: '',
    qty: 0,
    unit_rate: 0,
    total_amount: 0,
    delivery_items: [] as any[],
    driver_id: ''
  });

  // NEW: Loading states for dependent data
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // NEW: Load dependent data
  useEffect(() => {
    const loadData = async () => {
      setLoadingProducts(true);
      try {
        const [{ data: customersData }, { data: productsData }, { data: driversData }, { data: recentItemPrices }] = await Promise.all([
          supabase.from('customers').select('*'),
          supabase.from('products').select('*').order('name'),
          supabase.from('drivers').select('*').order('name'),
          supabase.from('delivery_items').select('product_id, unit_price').gt('unit_price', 0)
        ]);

        const fallbackPrices = new Map<string, number>();
        (recentItemPrices || []).forEach((item: any) => {
          const price = Number(item.unit_price || 0);
          if (item.product_id && price > 0 && !fallbackPrices.has(item.product_id)) {
            fallbackPrices.set(item.product_id, price);
          }
        });

        const productsWithPrices = (productsData || []).map((product: any) => {
          const productPrice = Number(product.unit_price || 0);
          return {
            ...product,
            effective_unit_price: productPrice > 0 ? productPrice : fallbackPrices.get(product.id) || 0,
          };
        });
        
        
        setProducts(productsWithPrices);
        setDrivers(driversData || []);
        setCustomers((customersData || []).slice().sort((a: any, b: any) =>
          (a.customer_name || '').localeCompare(b.customer_name || '', undefined, { sensitivity: 'base' })
        ));
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: "Error",
          description: "Failed to load required data",
          variant: "destructive",
        });
      } finally {
        setLoadingProducts(false);
      }
    };
    
    loadData();
  }, [toast]);

  // NEW: Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'qty' || name === 'unit_rate' || name === 'total_amount' ? Number(value) : value
    }));
  };

  // NEW: Handle delivery item changes
  const handleDeliveryItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const newItems = [...prev.delivery_items];
      const nextItem = { ...newItems[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const quantity = Number(nextItem.quantity || 0);
        const unitPrice = Number(nextItem.unit_price || 0);
        nextItem.total_price = calculateItemTotal(quantity, unitPrice);
      }
      newItems[index] = nextItem;
      return { ...prev, delivery_items: newItems };
    });
  };

  // NEW: Add new delivery item
  const addDeliveryItem = () => {
    setFormData(prev => ({
      ...prev,
      delivery_items: [
        ...prev.delivery_items,
        { 
          id: Date.now(), // Temporary ID for tracking
          product_id: '', 
          product_name: '', 
          quantity: 1, 
          unit_price: 0, 
          total_price: 0 
        }
      ]
    }));
  };

  const getEmptyFormData = () => ({
    id: '',
    customer_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_note_no: '',
    qty: 0,
    unit_rate: 0,
    total_amount: 0,
    delivery_items: [{
      id: Date.now(),
      product_id: '',
      product_name: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
    }],
    driver_id: ''
  });

  const buildValidItems = (deliveryItems: any[]) => deliveryItems
    .filter((item: any) => item.product_id)
    .map((item: any) => {
      const selectedProduct = products.find((product: any) => product.id === item.product_id);
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      return {
        ...item,
        product_name: selectedProduct?.name || item.product_name || '',
        quantity,
        unit_price: unitPrice,
        total_price: calculateItemTotal(quantity, unitPrice),
      };
    });

  const buildDeliveryItemsPayload = (deliveryId: string, customerId: string, items: any[]) => items.map((item: any) => ({
    delivery_id: deliveryId,
    customer_id: customerId,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  }));

  const validateDeliveryItems = (items: any[]) => {
    if (items.length === 0) {
      throw new Error('Please select at least one product before saving the delivery.');
    }

    const totals = getFormTotals(items);
    if (totals.totalQty <= 0 || totals.totalAmount <= 0) {
      throw new Error('Please enter quantity and rate for each product before saving.');
    }

    return totals;
  };

  // NEW: Remove delivery item
  const removeDeliveryItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      delivery_items: prev.delivery_items.filter((_, i) => i !== index)
    }));
  };

  // NEW: Calculate total amount based on items
  useEffect(() => {
    const validItems = formData.delivery_items.filter((item: any) => item.product_id);
    const totalQty = validItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const totalAmount = validItems.reduce((sum: number, item: any) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      return sum + calculateItemTotal(quantity, unitPrice);
    }, 0);
    const firstUnitRate = Number(validItems[0]?.unit_price || 0);

    setFormData(prev => ({
      ...prev,
      qty: totalQty,
      unit_rate: firstUnitRate,
      total_amount: totalAmount,
    }));
  }, [formData.delivery_items]);

  // NEW: Calculate individual item total when quantity or price changes
  const calculateItemTotal = (quantity: number, unit_price: number) => {
    return quantity * unit_price;
  };

  const getProductLabel = (product: any) => {
    const description = product.description ? ` - ${product.description}` : '';
    return `${product.name}${description}`;
  };

  const getProductPrice = (product: any) => {
    const savedPrice = Number(product?.unit_price || 0);
    const fallbackPrice = Number(product?.effective_unit_price || 0);
    return savedPrice > 0 ? savedPrice : fallbackPrice;
  };

  const getFormTotals = (items = formData.delivery_items) => {
    const validItems = items.filter((item: any) => item.product_id);
    const totalQty = validItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
    const totalAmount = validItems.reduce((sum: number, item: any) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      return sum + calculateItemTotal(quantity, unitPrice);
    }, 0);
    const firstUnitRate = Number(validItems[0]?.unit_price || 0);
    return { totalQty, totalAmount, firstUnitRate };
  };

  const normalizeDeliveryItems = (delivery: any) => {
    const sourceItems = Array.isArray(delivery.delivery_items) ? delivery.delivery_items : [];

    if (sourceItems.length === 0) {
      return [{
        id: `fallback-${delivery.id}`,
        product_id: '',
        product_name: '',
        quantity: Number(delivery.qty || 1),
        unit_price: Number(delivery.unit_rate || 0),
        total_price: Number(delivery.total_amount || 0),
      }];
    }

    return sourceItems.map((item: any) => {
      const matchedProduct = products.find((product: any) => (
        product.id === item.product_id ||
        product.name?.trim().toLowerCase() === item.product_name?.trim().toLowerCase()
      ));
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      return {
        ...item,
        product_id: matchedProduct?.id || item.product_id || '',
        product_name: matchedProduct?.name || item.product_name || '',
        quantity,
        unit_price: unitPrice,
        total_price: Number(item.total_price || calculateItemTotal(quantity, unitPrice)),
      };
    });
  };

  // NEW: Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // NEW: Monthly navigation
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // NEW: Column widths state
  const [columnWidths, setColumnWidths] = useState({
    customer: 150,
    date: 120,
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
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price
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

  // NEW: Create delivery mutation with proper item/payment handling
  const createDeliveryMutation = useMutation({
    mutationFn: async (deliveryData: any) => {
      if (!user?.id) {
        throw new Error('You must be logged in to create a delivery.');
      }

      const validItems = buildValidItems(deliveryData.delivery_items || []);
      const totals = validateDeliveryItems(validItems);

      const { data: newDelivery, error: deliveryError } = await supabase
        .from('deliveries')
        .insert([{
          customer_id: deliveryData.customer_id,
          delivery_date: deliveryData.delivery_date,
          delivery_note_no: deliveryData.delivery_note_no,
          qty: totals.totalQty,
          unit_rate: totals.firstUnitRate,
          total_amount: totals.totalAmount,
          driver_id: deliveryData.driver_id || null,
          delivery_status: 'delivered',
          created_by_user: user.id,
        }])
        .select()
        .single();

      if (deliveryError) throw deliveryError;

      const { error: itemError } = await supabase
        .from('delivery_items')
        .insert(buildDeliveryItemsPayload(newDelivery.id, deliveryData.customer_id, validItems));

      if (itemError) throw itemError;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      await supabase
        .from('payments')
        .insert([{
          customer_id: deliveryData.customer_id,
          delivery_id: newDelivery.id,
          amount: 0,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
        }]);

      try {
        await NotificationService.sendDeliveryNotification(newDelivery.id);
      } catch (notificationError) {
        console.error('Failed to send delivery notification:', notificationError);
      }

      return newDelivery;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({
        title: "Delivery created",
        description: "Delivery has been created successfully.",
      });
      setIsFormOpen(false);
      setEditingDelivery(null);
      setFormData(getEmptyFormData());
    },
    onError: (error: any) => {
      console.error('Create error:', error);
      toast({
        title: "Error",
        description: `Failed to create delivery: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // NEW: Update delivery mutation with proper error handling
  const updateDeliveryMutation = useMutation({
    mutationFn: async (deliveryData: any) => {
      const validItems = buildValidItems(deliveryData.delivery_items || []);
      const totals = validateDeliveryItems(validItems);

      // Update delivery record
      const { data: deliveryDataResult, error: deliveryError } = await supabase
        .from('deliveries')
        .update({
          customer_id: deliveryData.customer_id,
          delivery_date: deliveryData.delivery_date,
          delivery_note_no: deliveryData.delivery_note_no,
          qty: totals.totalQty,
          unit_rate: totals.firstUnitRate,
          total_amount: totals.totalAmount,
          driver_id: deliveryData.driver_id || null,
          customer_confirmed: false,
          confirmed_at: null,
          auto_confirmed: false,
          discrepancy_flag: false,
          discrepancy_notes: null,
          confirmation_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', deliveryData.id);

      if (deliveryError) throw deliveryError;

      // Handle delivery items
      if (deliveryData.delivery_items) {
        // First, delete existing items for this delivery
        const { error: deleteError } = await supabase
          .from('delivery_items')
          .delete()
          .eq('delivery_id', deliveryData.id);
        
        if (deleteError) throw deleteError;
        
        // Then insert new items if any exist
        if (validItems.length > 0) {
          const { error: itemError } = await supabase
            .from('delivery_items')
            .insert(buildDeliveryItemsPayload(deliveryData.id, deliveryData.customer_id, validItems));
            
          if (itemError) throw itemError;
        }
      }

      try {
        await NotificationService.sendDeliveryNotification(deliveryData.id);
      } catch (notificationError) {
        console.error('Failed to send delivery update notification:', notificationError);
      }
      
      return deliveryDataResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Delivery updated",
        description: "Delivery has been updated successfully.",
      });
      setIsFormOpen(false);
      setEditingDelivery(null);
      setFormData(getEmptyFormData());
    },
    onError: (error: any) => {
      console.error('Update error:', error);
      toast({
        title: "Error",
        description: `Failed to update delivery: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

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
    const deliveryItems = normalizeDeliveryItems(delivery);
    const totals = getFormTotals(deliveryItems);

    // Populate form data with delivery details including existing items
    setFormData({
      id: delivery.id,
      customer_id: delivery.customer_id || '',
      delivery_date: delivery.delivery_date || '',
      delivery_note_no: delivery.delivery_note_no || '',
      qty: totals.totalQty || Number(delivery.qty || 0),
      unit_rate: totals.firstUnitRate || Number(delivery.unit_rate || 0),
      total_amount: totals.totalAmount || Number(delivery.total_amount || 0),
      delivery_items: deliveryItems,
      driver_id: delivery.driver_id || ''
    });
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

  // NEW: Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totals = getFormTotals();
    const payload = {
      ...formData,
      qty: totals.totalQty,
      unit_rate: totals.firstUnitRate,
      total_amount: totals.totalAmount,
    };

    if (editingDelivery && formData.id) {
      updateDeliveryMutation.mutate(payload);
    } else {
      createDeliveryMutation.mutate(payload);
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
          <h2 className="text-xl font-bold text-foreground">Deliveries</h2>
          <p className="text-xs text-muted-foreground">Manage water deliveries</p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-3 h-3 mr-1" />
            Import
          </Button>
          <Button className="bg-gradient-primary" size="sm" onClick={() => {
            setEditingDelivery(null);
            setFormData(getEmptyFormData());
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
                              {format(new Date(delivery.delivery_date), "dd/MM/yyyy")}
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
                                    size="sm" 
                                    onClick={() => handleEdit(delivery)}
                                    className="z-[3000]"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleDelete(delivery.id)}
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

      {/* EDIT FORM MODAL - COMPLETELY FIXED */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {editingDelivery ? "Edit Delivery" : "Create New Delivery"}
                </h3>
                <button 
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingDelivery(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {loadingProducts ? (
                <div className="text-center py-8">Loading products...</div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Customer *</label>
                      <select
                        name="customer_id"
                        value={formData.customer_id}
                        onChange={handleInputChange}
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
                      <label className="block text-sm font-medium mb-1">Delivery Date *</label>
                      <input
                        type="date"
                        name="delivery_date"
                        value={formData.delivery_date}
                        onChange={handleInputChange}
                        required
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Delivery Note No.</label>
                      <input
                        type="text"
                        name="delivery_note_no"
                        value={formData.delivery_note_no}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Driver</label>
                      <select
                        name="driver_id"
                        value={formData.driver_id}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Driver</option>
                        {drivers.map(driver => (
                          <option key={driver.id} value={driver.id}>
                            {driver.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Products</label>
                    <div className="space-y-3">
                      {formData.delivery_items.map((item, index) => (
                        <div key={item.id || index} className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_90px_120px_120px_32px] gap-2 border p-2 rounded items-end">
                          <div>
                            <label className="block text-xs mb-1">Product</label>
                            <select
                              value={item.product_id || ''}
                              onChange={(e) => {
                                const selectedProduct = products.find(p => p.id === e.target.value);
                                const newPrice = getProductPrice(selectedProduct);
                                const newQty = item.quantity || 1;
                                setFormData(prev => {
                                  const newItems = [...prev.delivery_items];
                                  newItems[index] = {
                                    ...newItems[index],
                                    product_id: e.target.value,
                                    product_name: selectedProduct?.name || '',
                                    unit_price: newPrice,
                                    quantity: newQty,
                                    total_price: newQty * newPrice,
                                  };
                                  return { ...prev, delivery_items: newItems };
                                });
                              }}
                              className="w-full p-2 border rounded text-sm"
                            >
                                <option value="">
                                  {item.product_name ? `Unmatched: ${item.product_name}` : 'Select Product'}
                                </option>
                              {products.map(product => (
                                <option key={product.id} value={product.id}>
                                  {getProductLabel(product)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs mb-1">Qty</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQuantity = Number(e.target.value);
                                handleDeliveryItemChange(index, 'quantity', newQuantity);
                              }}
                              min="1"
                              className="w-full p-2 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1">Price</label>
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => {
                                const newPrice = Number(e.target.value);
                                handleDeliveryItemChange(index, 'unit_price', newPrice);
                              }}
                              min="0"
                              step="0.01"
                              className="w-full p-2 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1">Total</label>
                            <input
                              type="number"
                              value={Number(item.total_price || 0)}
                              readOnly
                              className="w-full p-2 border rounded text-sm bg-gray-100"
                            />
                          </div>
                          <div className="flex items-center justify-center pb-2">
                            <button
                              type="button"
                              onClick={() => removeDeliveryItem(index)}
                              className="text-red-600 hover:text-red-800"
                              aria-label="Remove product"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border bg-gray-50 p-3">
                    <label className="block text-sm font-medium mb-1">Total Amount</label>
                    <input
                      type="number"
                      value={formData.total_amount}
                      readOnly
                      className="w-full p-2 border rounded bg-white"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={addDeliveryItem}
                      className="text-sm bg-blue-600 text-white px-3 py-1 rounded"
                    >
                      Add Item
                    </button>
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => {
                        setIsFormOpen(false);
                        setEditingDelivery(null);
                        setFormData(getEmptyFormData());
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={updateDeliveryMutation.isPending || createDeliveryMutation.isPending}
                    >
                      {updateDeliveryMutation.isPending || createDeliveryMutation.isPending 
                        ? (editingDelivery ? 'Updating...' : 'Creating...') 
                        : editingDelivery ? 'Update Delivery' : 'Create Delivery'}
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
                <h3 className="text-lg font-semibold">Delete Delivery</h3>
                <button 
                  onClick={() => setDeleteDialogOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <p>
                  {hasLinkedPayments 
                    ? "This delivery has linked payment records. Please delete the associated payments first before deleting this delivery." 
                    : "Are you sure you want to delete this delivery? This action cannot be undone."}
                </p>
                
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setDeleteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  {!hasLinkedPayments && (
                    <Button 
                      onClick={confirmDelete} 
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExcelUploadDialog
        open={isExcelUploadOpen}
        onOpenChange={setIsExcelUploadOpen}
        type="deliveries"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["deliveries"] })}
      />
    </div>
  );
}
