import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationService } from "@/services/notificationService";
import { StatusBadge } from "@/components/ui/status-badge";

interface Customer {
  id: string;
  customer_name: string;
}

interface Delivery {
  id: string;
  delivery_date: string;
  total_amount: number;
  qty: number;
  unit_rate: number;
  customer_id: string;
  payment_status: string;
}

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: any;
}

export function PaymentFormDialog({ open, onOpenChange, editData }: PaymentFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([]);
  const [paidByDelivery, setPaidByDelivery] = useState<Record<string, number>>({});
  const [creditBalance, setCreditBalance] = useState(0);
  const [formData, setFormData] = useState({
    customer_id: "",
    delivery_id: "",
    amount: "",
    payment_method: "cash",
    mpesa_code: "",
    apply_credit: false,
  });
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      setDataLoaded(false);
      fetchFormData().then(() => setDataLoaded(true));
    }
  }, [open]);

  useEffect(() => {
    if (open && dataLoaded && editData?.id) {
      setFormData({
        customer_id: editData.customer_id || "",
        delivery_id: editData.delivery_id || "",
        amount: editData.amount?.toString() || "",
        payment_method: editData.payment_method || "cash",
        mpesa_code: editData.mpesa_code || "",
        apply_credit: false,
      });
    } else if (open && dataLoaded && !editData?.id) {
      resetForm();
      // Preselect customer/delivery when opened from a delivery context
      if (editData?.customer_id || editData?.delivery_id) {
        setFormData((f) => ({
          ...f,
          customer_id: editData.customer_id || "",
          delivery_id: editData.delivery_id || "",
        }));
      }
    }
  }, [open, dataLoaded, editData]);


  // Refresh credit balance when customer changes
  useEffect(() => {
    if (formData.customer_id) {
      fetchCreditBalance(formData.customer_id);
    } else {
      setCreditBalance(0);
    }
  }, [formData.customer_id]);

  const fetchFormData = async () => {
    try {
      const { data: customersData } = await supabase
        .from("customers")
        .select("id, customer_name")
        .order("customer_name", { ascending: true });

      const { data: deliveriesData } = await supabase
        .from("deliveries")
        .select("id, delivery_date, total_amount, qty, unit_rate, customer_id, payment_status")
        .order("delivery_date", { ascending: false });

      // Sum successful payments per delivery to compute remaining balances
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("delivery_id, amount, status")
        .in("status", ["paid", "completed"]);

      const totals: Record<string, number> = {};
      (paymentsData || []).forEach((p: any) => {
        if (!p.delivery_id) return;
        totals[p.delivery_id] = (totals[p.delivery_id] || 0) + Number(p.amount || 0);
      });

      setCustomers(customersData || []);
      setAllDeliveries(deliveriesData || []);
      setPaidByDelivery(totals);
    } catch (error) {
      console.error("Error fetching form data", error);
    }
  };

  const fetchCreditBalance = async (customerId: string) => {
    const { data, error } = await supabase
      .from("customer_credits")
      .select("amount")
      .eq("customer_id", customerId);
    if (error) {
      console.error("credit fetch error", error);
      setCreditBalance(0);
      return;
    }
    const bal = (data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    setCreditBalance(bal);
  };

  const resetForm = () => {
    setFormData({
      customer_id: "",
      delivery_id: "",
      amount: "",
      payment_method: "cash",
      mpesa_code: "",
      apply_credit: false,
    });
  };

  const selectedDelivery = allDeliveries.find((d) => d.id === formData.delivery_id);
  const alreadyPaid = selectedDelivery ? paidByDelivery[selectedDelivery.id] || 0 : 0;
  const remaining = selectedDelivery
    ? Math.max(0, Number(selectedDelivery.total_amount) - alreadyPaid - (editData ? 0 : 0))
    : 0;

  // Deliveries available for the selected customer with remaining balance > 0
  const filteredDeliveries = useMemo(() => {
    return allDeliveries.filter((d) => {
      if (d.customer_id !== formData.customer_id) return false;
      if (editData?.id && d.id === editData.delivery_id) return true;
      const paid = paidByDelivery[d.id] || 0;
      return Number(d.total_amount) - paid > 0.0001;
    });
  }, [allDeliveries, paidByDelivery, formData.customer_id, editData]);

  const handleApplyCreditToggle = (checked: boolean) => {
    if (checked && selectedDelivery) {
      // Prefill amount with min(remaining, creditBalance)
      const auto = Math.min(remaining || 0, creditBalance);
      setFormData((f) => ({
        ...f,
        apply_credit: true,
        payment_method: "credit",
        amount: auto > 0 ? auto.toString() : f.amount,
      }));
    } else {
      setFormData((f) => ({
        ...f,
        apply_credit: false,
        payment_method: f.payment_method === "credit" ? "cash" : f.payment_method,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const paymentAmount = Number(formData.amount);
      if (!paymentAmount || paymentAmount <= 0) throw new Error("Enter a valid amount");
      if (!selectedDelivery) throw new Error("Select a delivery");

      const today = new Date().toISOString().split("T")[0];

      const isEdit = !!editData?.id;

      // Applied credit path (only when not editing an existing row)
      if (formData.apply_credit && !isEdit) {
        if (paymentAmount > creditBalance + 0.0001) {
          throw new Error(`Only KSh ${creditBalance.toLocaleString()} credit available`);
        }
      }

      if (isEdit) {
        // Update the specific existing payment row only
        const { error } = await supabase
          .from("payments")
          .update({
            customer_id: formData.customer_id,
            delivery_id: formData.delivery_id,
            amount: paymentAmount,
            due_date: today,
            payment_method: formData.payment_method,
            mpesa_code: formData.payment_method === "mpesa" ? formData.mpesa_code : null,
            status: "paid",
            updated_at: new Date().toISOString(),
          })
          .eq("id", editData.id);
        if (error) throw error;

        // Reconcile credit ledger for this payment: recompute overpayment
        // vs delivery total after this edit.
        // 1) Remove any prior credit rows tied to this payment (positive overpayment rows).
        await supabase
          .from("customer_credits")
          .delete()
          .eq("source_payment_id", editData.id)
          .gt("amount", 0);

        // 2) If there's still an overpayment, insert a fresh credit row.
        const { data: paidRows } = await supabase
          .from("payments")
          .select("amount, status")
          .eq("delivery_id", formData.delivery_id)
          .in("status", ["paid", "completed"]);
        const totalPaid = (paidRows || []).reduce(
          (s: number, r: any) => s + Number(r.amount || 0),
          0,
        );
        const overpay = totalPaid - Number(selectedDelivery.total_amount);
        if (overpay > 0.0001) {
          await supabase.from("customer_credits").insert({
            customer_id: formData.customer_id,
            amount: overpay,
            source_payment_id: editData.id,
            source_delivery_id: formData.delivery_id,
            note: "Overpayment (edited) - added to customer credit",
          });
        }

        toast({ title: "Payment updated" });
      } else {
        // Always create a NEW row per payment (additive)
        const { data: paymentRow, error } = await supabase
          .from("payments")
          .insert([
            {
              customer_id: formData.customer_id,
              delivery_id: formData.delivery_id,
              amount: paymentAmount,
              due_date: today,
              payment_method: formData.payment_method,
              mpesa_code: formData.payment_method === "mpesa" ? formData.mpesa_code : null,
              status: "paid",
              created_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();
        if (error) throw error;

        // If credit was applied, deduct from customer_credits ledger
        if (formData.apply_credit) {
          await supabase.from("customer_credits").insert({
            customer_id: formData.customer_id,
            amount: -paymentAmount,
            source_payment_id: paymentRow.id,
            source_delivery_id: formData.delivery_id,
            note: "Credit applied to delivery payment",
          });
        }

        // If overpaid vs remaining, park excess as credit
        const totalNowPaid = alreadyPaid + paymentAmount;
        const overpay = totalNowPaid - Number(selectedDelivery.total_amount);
        if (overpay > 0.0001) {
          await supabase.from("customer_credits").insert({
            customer_id: formData.customer_id,
            amount: overpay,
            source_payment_id: paymentRow.id,
            source_delivery_id: formData.delivery_id,
            note: "Overpayment - added to customer credit",
          });
        }

        try {
          await NotificationService.sendPaymentNotification(paymentRow.id);
        } catch (err) {
          console.error("notification failed", err);
        }

        toast({ title: "Payment recorded" });
      }


      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving payment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save payment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const remainingAfter =
    selectedDelivery && formData.amount
      ? Number(selectedDelivery.total_amount) - alreadyPaid - Number(formData.amount || 0)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData?.id ? "Edit Payment" : "Add Payment"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="customer">Customer *</Label>
            <Select
              value={formData.customer_id}
              onValueChange={(value) =>
                setFormData({ ...formData, customer_id: value, delivery_id: "", apply_credit: false })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.customer_id && creditBalance > 0 && (
            <div className="p-2 rounded-md border border-violet-300 bg-violet-50 text-sm flex items-center justify-between">
              <span className="text-violet-800 font-medium">
                Credit available: KSh {creditBalance.toLocaleString()}
              </span>
              {!editData?.id && (
                <label className="flex items-center gap-2 text-violet-800">
                  <Checkbox
                    checked={formData.apply_credit}
                    onCheckedChange={(v) => handleApplyCreditToggle(!!v)}
                  />
                  Apply credit
                </label>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="delivery">Delivery *</Label>
            <Select
              value={formData.delivery_id}
              onValueChange={(value) => setFormData({ ...formData, delivery_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select delivery" />
              </SelectTrigger>
              <SelectContent>
                {filteredDeliveries.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No deliveries with balance
                  </div>
                ) : (
                  filteredDeliveries.map((d) => {
                    const paid = paidByDelivery[d.id] || 0;
                    const rem = Number(d.total_amount) - paid;
                    return (
                      <SelectItem key={d.id} value={d.id}>
                        {d.delivery_date} — Total KSh {Number(d.total_amount).toLocaleString()}, Balance KSh{" "}
                        {rem.toLocaleString()}
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedDelivery && (
            <div className="p-2 bg-muted rounded-md text-xs space-y-0.5">
              <div>Delivery Total: <b>KSh {Number(selectedDelivery.total_amount).toLocaleString()}</b></div>
              <div>Already Paid: KSh {alreadyPaid.toLocaleString()}</div>
              <div>
                Remaining: <b>KSh {(Number(selectedDelivery.total_amount) - alreadyPaid).toLocaleString()}</b>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Enter payment amount"
              required
            />
          </div>

          <div>
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select
              value={formData.payment_method}
              onValueChange={(value) =>
                setFormData({ ...formData, payment_method: value, apply_credit: value === "credit" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                {creditBalance > 0 && <SelectItem value="credit">Customer Credit</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {formData.payment_method === "mpesa" && (
            <div>
              <Label htmlFor="mpesaCode">M-Pesa Code</Label>
              <Input
                id="mpesaCode"
                value={formData.mpesa_code}
                onChange={(e) => setFormData({ ...formData, mpesa_code: e.target.value })}
                placeholder="Enter M-Pesa code"
              />
            </div>
          )}

          {selectedDelivery && formData.amount && remainingAfter !== null && (
            <div className="p-2 rounded-md border flex items-center gap-2 text-xs">
              <StatusBadge
                status={
                  remainingAfter <= 0
                    ? remainingAfter < 0
                      ? "credit"
                      : "paid"
                    : "partial"
                }
              />
              <span>
                {remainingAfter > 0
                  ? `Balance after: KSh ${remainingAfter.toLocaleString()}`
                  : remainingAfter === 0
                  ? "Delivery fully paid"
                  : `Overpayment credit: KSh ${Math.abs(remainingAfter).toLocaleString()}`}
              </span>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : editData ? "Update" : "Add Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
