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
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
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
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("payments")
        .update({ status })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
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
          ) : !payments || payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No payments found. Add your first payment to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Delivery Total</TableHead>
                  <TableHead>Paid Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>M-Pesa Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const derived = derivedStatusById.get(payment.id);
                  const type = derived?.type || payment.status;
                  const label = derived?.label || payment.status;
                  
                  return (
                    <TableRow key={payment.id}>
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
                      <TableCell>{format(new Date(payment.due_date), "MMM dd, yyyy")}</TableCell>
                      <TableCell className="capitalize">{payment.payment_method}</TableCell>
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
                              onClick={() => updatePaymentStatus.mutate({ id: payment.id, status: "paid" })}
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
