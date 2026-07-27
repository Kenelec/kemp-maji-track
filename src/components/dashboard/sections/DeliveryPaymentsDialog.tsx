import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentFormDialog } from "@/components/dashboard/forms/PaymentFormDialog";
import { Pencil, Trash2, Plus } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: any | null;
}

export function DeliveryPaymentsDialog({ open, onOpenChange, delivery }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const isMasterAdmin = userRole === "MasterAdmin";

  const [payments, setPayments] = useState<any[]>([]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = async () => {
    if (!delivery?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("delivery_id", delivery.id)
      .order("created_at", { ascending: true });
    setPayments(data || []);

    if (delivery.customer_id) {
      const { data: credits } = await supabase
        .from("payments")
        .select("amount")
        .eq("customer_id", delivery.customer_id)
        .eq("status", "credit");
      const bal = (credits || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      setCreditBalance(bal);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && delivery?.id) refresh();
    if (!open) {
      setEditingPayment(null);
      setPaymentFormOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, delivery?.id]);

  // Hide credit rows from the payment list (they're a balance ledger, not a delivery payment)
  const validPayments = payments.filter(
    (p) =>
      p.status !== "credit" &&
      Number(p.amount || 0) > 0 &&
      ["paid", "completed", "pending_verification"].includes(p.status),
  );
  const totalPaid = validPayments
    .filter((p) => ["paid", "completed"].includes(p.status))
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = Math.max(0, Number(delivery?.total_amount || 0) - totalPaid);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      // Remove any credit rows tied to this payment (overpayment credit + credit usage rows)
      await supabase
        .from("payments")
        .delete()
        .eq("status", "credit")
        .or(`mpesa_code.eq.OVERPAY:${deleteId},mpesa_code.eq.USE:${deleteId}`);
      const { error } = await supabase.from("payments").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "Payment deleted" });
      setDeleteId(null);
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleFormChange = (o: boolean) => {
    setPaymentFormOpen(o);
    if (!o) {
      setEditingPayment(null);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    }
  };

  if (!delivery) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Payments · {delivery.customers?.customer_name || "Customer"} ·{" "}
              {delivery.delivery_date ? format(new Date(delivery.delivery_date), "dd/MM/yyyy") : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
            <div className="rounded border p-2">
              <div className="text-muted-foreground">Total</div>
              <div className="font-semibold">KSh {Number(delivery.total_amount || 0).toLocaleString()}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">Paid</div>
              <div className="font-semibold text-green-700">KSh {totalPaid.toLocaleString()}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">Remaining</div>
              <div className="font-semibold text-amber-700">KSh {remaining.toLocaleString()}</div>
            </div>
            <div className="rounded border p-2">
              <div className="text-muted-foreground">Credit</div>
              <div className="font-semibold text-violet-700">KSh {creditBalance.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex justify-end mb-2">
            <Button
              size="sm"
              onClick={() => {
                setEditingPayment(null);
                setPaymentFormOpen(true);
              }}
            >
              <Plus className="w-3 h-3 mr-1" /> Add Payment
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">Loading…</div>
          ) : validPayments.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Method</th>
                    <th className="text-left p-2">M-Pesa</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {validPayments.map((p, i) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">
                        {p.created_at ? format(new Date(p.created_at), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="p-2 capitalize">{p.payment_method || "—"}</td>
                      <td className="p-2">{p.mpesa_code || "—"}</td>
                      <td className="p-2 text-right font-medium">
                        KSh {Number(p.amount || 0).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="p-2 text-right">
                        {isMasterAdmin && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingPayment(p);
                                setPaymentFormOpen(true);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteId(p.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaymentFormDialog
        open={paymentFormOpen}
        onOpenChange={handleFormChange}
        editData={
          editingPayment ||
          (delivery
            ? { customer_id: delivery.customer_id, delivery_id: delivery.id }
            : undefined)
        }
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the payment and any credit created by it. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
