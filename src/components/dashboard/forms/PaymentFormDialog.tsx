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

  const isEdit = !!editData?.id;

  useEffect(() => {
    if (open) {
      setDataLoaded(false);
      fetchFormData().then(() => setDataLoaded(true));
    }
  }, [open]);

  useEffect(() => {
    if (!open || !dataLoaded) return;
    if (isEdit) {
      setFormData({
        customer_id: editData.customer_id || "",
        delivery_id: editData.delivery_id || "",
        amount: editData.amount?.toString() || "",
        payment_method: editData.payment_method || "cash",
        mpesa_code: editData.mpesa_code || "",
        apply_credit: false,
      });
    } else {
      resetForm();
      if (editData?.customer_id || editData?.delivery_id) {
        setFormData((f) => ({
          ...f,
          customer_id: editData.customer_id || "",
          delivery_id: editData.delivery_id || "",
        }));
      }
    }
  }, [open, dataLoaded, editData, isEdit]);

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

  // Credit balance = SUM(amount) of payments where status='credit'
  const fetchCreditBalance = async (customerId: string) => {
    const { data, error } = await supabase
      .from("payments")
      .select("amount")
      .eq("customer_id", customerId)
      .eq("status", "credit");
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
  // In edit mode, "already paid" excludes the row being edited so the balance math is honest
  const alreadyPaidExcludingSelf = isEdit
    ? Math.max(0, alreadyPaid - Number(editData?.amount || 0))
    : alreadyPaid;
  const remaining = selectedDelivery
    ? Math.max(0, Number(selectedDelivery.total_amount) - alreadyPaidExcludingSelf)
    : 0;

  const filteredDeliveries = useMemo(() => {
    return allDeliveries.filter((d) => {
      if (d.customer_id !== formData.customer_id) return false;
      if (isEdit && d.id === editData.delivery_id) return true;
      const paid = paidByDelivery[d.id] || 0;
      return Number(d.total_amount) - paid > 0.0001;
    });
  }, [allDeliveries, paidByDelivery, formData.customer_id, editData, isEdit]);

  const handleApplyCreditToggle = (checked: boolean) => {
    if (checked && selectedDelivery) {
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

  // After any add/edit, ensure a single overpayment credit row exists for that source payment
  const reconcileOverpayment = async (paymentId: string, deliveryId: string, customerId: string) => {
    const { data: delivery } = await supabase
      .from("deliveries")
      .select("total_amount")
      .eq("id", deliveryId)
      .single();
    const total = Number(delivery?.total_amount || 0);

    const { data: paidRows } = await supabase
      .from("payments")
      .select("amount")
      .eq("delivery_id", deliveryId)
      .in("status", ["paid", "completed"]);
    const totalPaid = (paidRows || []).reduce((s, r: any) => s + Number(r.amount || 0), 0);

    // Remove any existing overpayment-credit row tied to THIS payment (delivery_id + customer + status=credit + note=overpayment)
    await supabase
      .from("payments")
      .delete()
      .eq("status", "credit")
      .eq("delivery_id", deliveryId)
      .eq("customer_id", customerId)
      .eq("payment_method", "credit")
      .gt("amount", 0)
      .like("mpesa_code", `OVERPAY:${paymentId}%`);

    const overpay = totalPaid - total;
    if (overpay > 0.0001) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("payments").insert({
        customer_id: customerId,
        delivery_id: deliveryId,
        amount: overpay,
        due_date: today,
        payment_method: "credit",
        status: "credit",
        mpesa_code: `OVERPAY:${paymentId}`,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const paymentAmount = Number(formData.amount);
      if (!paymentAmount || paymentAmount <= 0) throw new Error("Enter a valid amount");
      if (!selectedDelivery) throw new Error("Select a delivery");
      if (isEdit && !editData?.id) throw new Error("Missing payment id for edit");

      const today = new Date().toISOString().split("T")[0];

      if (formData.apply_credit && !isEdit) {
        if (paymentAmount > creditBalance + 0.0001) {
          throw new Error(`Only KSh ${creditBalance.toLocaleString()} credit available`);
        }
      }

      if (isEdit) {
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

        await reconcileOverpayment(editData.id, formData.delivery_id, formData.customer_id);
        toast({ title: "Payment updated" });
      } else {
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

        // If credit was applied, deduct from credit balance by inserting a negative credit row
        if (formData.apply_credit) {
          await supabase.from("payments").insert({
            customer_id: formData.customer_id,
            delivery_id: formData.delivery_id,
            amount: -paymentAmount,
            due_date: today,
            payment_method: "credit",
            status: "credit",
            mpesa_code: `USE:${paymentRow.id}`,
          });
        }

        await reconcileOverpayment(paymentRow.id, formData.delivery_id, formData.customer_id);

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
      ? Number(selectedDelivery.total_amount) - alreadyPaidExcludingSelf - Number(formData.amount || 0)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Payment` : "Add Payment"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="customer">Customer *</Label>
            <Select
              value={formData.customer_id}
              onValueChange={(value) =>
                setFormData({ ...formData, customer_id: value, delivery_id: "", apply_credit: false })
              }
              disabled={isEdit}
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
                Available Credit: KSh {creditBalance.toLocaleString()}
              </span>
              {!isEdit && (
                <label className="flex items-center gap-2 text-violet-800">
                  <Checkbox
                    checked={formData.apply_credit}
                    onCheckedChange={(v) => handleApplyCreditToggle(!!v)}
                  />
                  Use Credit
                </label>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="delivery">Delivery *</Label>
            <Select
              value={formData.delivery_id}
              onValueChange={(value) => setFormData({ ...formData, delivery_id: value })}
              disabled={isEdit}
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
              <div>
                Current Amount Paid: KSh {alreadyPaidExcludingSelf.toLocaleString()}
                {isEdit && (
                  <span className="text-muted-foreground"> (excludes this record)</span>
                )}
              </div>
              <div>
                Balance: <b>KSh {(Number(selectedDelivery.total_amount) - alreadyPaidExcludingSelf).toLocaleString()}</b>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="amount">{isEdit ? "New Amount *" : "Amount to Add *"}</Label>
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
                {!isEdit && creditBalance > 0 && <SelectItem value="credit">Customer Credit</SelectItem>}
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
              {loading ? "Saving..." : isEdit ? "Update Payment" : "Add Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
