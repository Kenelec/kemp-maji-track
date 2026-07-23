import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Upload, CheckCircle, Clock, AlertCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DeliveryFormDialog } from "../forms/DeliveryFormDialog";
import { ExcelUploadDialog } from "../ExcelUploadDialog";
import { format } from "date-fns";
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

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["deliveries"],
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
        // NEW: Remove ordering from query since we'll sort client-side
        // .order(sortField || "delivery_date", { ascending: sortOrder === 'asc' });
      
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deliveries</h2>
          <p className="text-muted-foreground">Manage water deliveries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Excel
          </Button>
          <Button className="bg-gradient-primary" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Delivery
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>Track and manage all water deliveries</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !sortedDeliveries || sortedDeliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No deliveries found. Create your first delivery to get started.
            </div>
          ) : (
            <div 
              ref={tableContainerRef}
              className="overflow-x-auto"
            >
              {/* NEW: Scrollable container with fixed height */}
              <div className="h-[60vh] overflow-y-auto">
                {/* NEW: Fixed header container with highest z-index */}
                <div className="sticky top-0 z-[1000] bg-background">
                  <Table className="min-w-[1200px]">
                    <TableHeader className="bg-background">
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 sticky left-0 bg-background z-[2000] !important"
                          onClick={() => handleSort('customers.customer_name')}
                        >
                          Customer {getSortIcon('customers.customer_name')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort('delivery_date')}
                        >
                          Delivery Date {getSortIcon('delivery_date')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort('drivers.name')}
                        >
                          Driver {getSortIcon('drivers.name')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort('delivery_note_no')}
                        >
                          Delivery Note No. {getSortIcon('delivery_note_no')}
                        </TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead>Quantity</TableHead> {/* REMOVED SORTING */}
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort('unit_rate')}
                        >
                          Unit Rate {getSortIcon('unit_rate')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort('total_amount')}
                        >
                          Total Amount {getSortIcon('total_amount')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100"
                          onClick={() => handleSort('payment_status')} // FIXED: Added sorting to confirmation column
                        >
                          Confirmation {getSortIcon('payment_status')}
                        </TableHead>
                        <TableHead className="text-right sticky right-0 bg-background z-[2000] !important">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  </Table>
                </div>
                
                {/* NEW: Data rows with lower z-index to prevent overlapping */}
                <div className="relative z-[500]">
                  <Table className="min-w-[1200px]">
                    <TableBody>
                      {sortedDeliveries.map((delivery) => {
                        const confirmStatus = getConfirmationStatus(delivery);
                        const StatusIcon = confirmStatus.icon;
                        return (
                          <TableRow key={delivery.id}>
                            <TableCell className="font-medium sticky left-0 bg-background z-[1500] !important">
                              {delivery.customers?.customer_name || "Unknown"}
                            </TableCell>
                            <TableCell>{format(new Date(delivery.delivery_date), "MMM dd, yyyy")}</TableCell>
                            <TableCell>
                              {(delivery as any).drivers?.name || "—"}
                            </TableCell>
                            <TableCell>{delivery.delivery_note_no || "—"}</TableCell>
                            <TableCell>
                              {delivery.delivery_items && delivery.delivery_items.length > 0 ? (
                                delivery.delivery_items.map((item: any, idx: number) => (
                                  <div key={idx}>{item.product_name}</div>
                                ))
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>{delivery.qty}</TableCell> {/* NO SORTING */}
                            <TableCell>KSh {Number(delivery.unit_rate).toLocaleString()}</TableCell>
                            <TableCell className="font-semibold">KSh {Number(delivery.total_amount).toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge className={confirmStatus.color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {confirmStatus.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right sticky right-0 bg-background z-[1500] !important">
                              {isMasterAdmin && (
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => handleEdit(delivery)}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(delivery.id)}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
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

      <DeliveryFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingDelivery(null);
        }}
        editData={editingDelivery}
      />

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
