import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle, Pencil, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PaymentFormDialog } from "../forms/PaymentFormDialog";
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

  // NEW: Sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          customers (customer_name),
          deliveries (
            total_amount,
            delivery_date,
            delivery_items (
              product_name,
              quantity
            )
          )
        `)
        // NEW: Remove ordering from query since we'll sort client-side
        // .order(sortField || "created_at", { ascending: sortOrder === 'asc' });
      
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
          aValue = (a.status || "").toLowerCase();
          bValue = (b.status || "").toLowerCase();
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

  const getStatusColor = (status: string) => {
    if (status.includes('credit')) return "bg-blue-500/10 text-blue-500";
    if (status.includes('pending')) return "bg-yellow-500/10 text-yellow-500";
    if (status === 'paid') return "bg-green-500/10 text-green-500";
    if (status === 'overdue') return "bg-red-500/10 text-red-500";
    return "bg-gray-500/10 text-gray-500";
  };

  const derivedStatusById = useMemo(() => {
    const map = new Map<string, { type: 'paid' | 'pending' | 'credit'; label: string }>();
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
        let type: 'paid' | 'pending' | 'credit';
        let label: string;
        if (deliveryTotal === 0) {
          // Fallback to stored status when no delivery is linked
          type = (p.status === 'credit' || p.status === 'paid' || p.status === 'pending') ? p.status : 'paid';
          label = type;
        } else if (diff > 0) {
          type = 'credit';
          label = `${Math.abs(diff)} credit`;
        } else if (diff < 0) {
          type = 'pending';
          label = `${Math.abs(diff)} pending`;
        } else {
          type = 'paid';
          label = 'paid';
        }
        map.set(p.id, { type, label });
      });
    });

    return map;
  }, [payments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Payments</h2>
          <p className="text-muted-foreground">Track customer payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Excel
          </Button>
          <Button className="bg-gradient-primary" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Payment
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Payment Records</CardTitle>
          <CardDescription>Manage payment status and history</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !sortedPayments || sortedPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payments found. Add your first payment to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('delivery_date')}
                  >
                    Delivery Date {getSortIcon('delivery_date')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('customers.customer_name')}
                  >
                    Customer {getSortIcon('customers.customer_name')}
                  </TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('deliveries.total_amount')}
                  >
                    Delivery Total {getSortIcon('deliveries.total_amount')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('amount')}
                  >
                    Paid Amount {getSortIcon('amount')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('balance')} // NEW: Added sorting to balance column
                  >
                    Balance {getSortIcon('balance')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('payment_method')}
                  >
                    Payment Mode {getSortIcon('payment_method')} {/* CHANGED: Payment Method to Payment Mode */}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('mpesa_code')}
                  >
                    M-Pesa Code {getSortIcon('mpesa_code')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    Status {getSortIcon('status')}
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((payment) => {
                  const derived = derivedStatusById.get(payment.id);
                  const type = derived?.type || payment.status;
                  const label = derived?.label || payment.status;
                  
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>{format(new Date(payment.deliveries?.delivery_date || payment.created_at), "MMM dd, yyyy")}</TableCell> {/* NEW: Delivery Date moved to first column */}
                      <TableCell className="font-medium">
                        {payment.customers?.customer_name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        {payment.deliveries?.delivery_items && payment.deliveries.delivery_items.length > 0 ? (
                          payment.deliveries.delivery_items.map((item: any, idx: number) => (
                            <div key={idx}>{item.product_name}</div>
                          ))
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {payment.deliveries?.delivery_items && payment.deliveries.delivery_items.length > 0 ? (
                          payment.deliveries.delivery_items.map((item: any, idx: number) => (
                            <div key={idx}>{item.quantity}</div>
                          ))
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {payment.deliveries?.total_amount 
                          ? `KSh ${Number(payment.deliveries.total_amount).toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell className="font-semibold text-green-600">
                        KSh {Number(payment.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {payment.deliveries?.total_amount ? (
                          <span className={Number(payment.deliveries.total_amount) - Number(payment.amount) > 0 
                            ? "text-red-600" 
                            : "text-green-600"
                          }>
                            KSh {(Number(payment.deliveries.total_amount) - Number(payment.amount)).toLocaleString()}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="capitalize">{payment.payment_method}</TableCell> {/* CHANGED: Column name changed to Payment Mode */}
                      <TableCell>{payment.mpesa_code || "—"}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(type)}>
                          {label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {/* Only show Mark Paid button for pending payments - MasterAdmin only */}
                          {isMasterAdmin && payment.status === "pending" && !label.includes('pending') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updatePaymentStatus.mutate({ 
                                id: payment.id, 
                                status: "paid", 
                                deliveryId: payment.delivery_id 
                              })}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Mark Paid
                            </Button>
                          )}
                          {isMasterAdmin && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(payment)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(payment.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaymentFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingPayment(null);
        }}
        editData={editingPayment}
      />

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
