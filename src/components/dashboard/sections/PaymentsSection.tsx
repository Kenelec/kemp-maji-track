import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PaymentFormDialog } from "../forms/PaymentFormDialog";
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
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
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
          customers (customer_name)
        `)
        .order("due_date", { ascending: false });
      
      if (error) throw error;
      return data;
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
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-500";
      case "paid":
        return "bg-green-500/10 text-green-500";
      case "overdue":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Payments</h2>
          <p className="text-muted-foreground">Track customer payments</p>
        </div>
        <Button className="bg-gradient-primary" onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Payment
        </Button>
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
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>M-Pesa Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {payment.customers?.customer_name || "Unknown"}
                    </TableCell>
                    <TableCell className="font-semibold">KES {Number(payment.amount).toLocaleString()}</TableCell>
                    <TableCell>{format(new Date(payment.due_date), "MMM dd, yyyy")}</TableCell>
                    <TableCell className="capitalize">{payment.payment_method}</TableCell>
                    <TableCell>{payment.mpesa_code || "—"}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(payment.status)}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {payment.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updatePaymentStatus.mutate({ id: payment.id, status: "paid" })}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Mark Paid
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(payment)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(payment.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
