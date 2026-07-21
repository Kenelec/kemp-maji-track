import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Inbox, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface PendingPayment {
  id: string;
  amount: number;
  mpesa_code: string | null;
  created_at: string | null;
  delivery_id: string | null;
  customer_id: string | null;
  status: string;
  customers?: { customer_name: string; phone: string | null } | null;
  deliveries?: { delivery_date: string; total_amount: number } | null;
}

interface SmsRow {
  id: string;
  mpesa_code: string;
  amount: number;
  sender_name: string | null;
  sender_phone: string | null;
  received_at: string;
  matched_payment_id: string | null;
}

export function MpesaVerificationsSection({ canAct }: { canAct: boolean }) {
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ mpesa_code: "", amount: "", sender_name: "", sender_phone: "", message_text: "" });
  const [saving, setSaving] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: pays }, { data: smsRows }] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, mpesa_code, created_at, delivery_id, customer_id, status, customers(customer_name, phone), deliveries(delivery_date, total_amount)")
        .eq("status", "pending_verification")
        .order("created_at", { ascending: false }) as any,
      (supabase.from as any)("mpesa_sms_inbox")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(50),
    ]);
    setPending((pays as any) || []);
    setSms((smsRows as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const smsFor = (code: string | null) =>
    code ? sms.find(s => s.mpesa_code.toUpperCase() === code.toUpperCase()) : undefined;

  const confirmPayment = async (p: PendingPayment) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("payments")
      .update({ status: "paid", verified_by: user?.id, verified_at: new Date().toISOString() } as any)
      .eq("id", p.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });

    if (p.delivery_id) {
      await supabase
        .from("deliveries")
        .update({ payment_status: "paid", customer_confirmed: true, confirmed_at: new Date().toISOString() })
        .eq("id", p.delivery_id);
    }

    // Notify customer
    const customer = (p as any).customers;
    if (p.customer_id) {
      const { data: cust } = await supabase.from("customers").select("user_id").eq("id", p.customer_id).maybeSingle();
      if (cust?.user_id) {
        await supabase.from("in_app_notifications").insert({
          user_id: cust.user_id,
          type: "payment_verified",
          title: "Payment Verified",
          message: `Your M-Pesa payment of KSh ${Number(p.amount).toLocaleString()} (code ${p.mpesa_code}) has been verified.`,
          metadata: { payment_id: p.id },
        });
      }
    }

    toast({ title: "Payment Confirmed", description: `Marked as paid.` });
    load();
  };

  const rejectPayment = async (p: PendingPayment) => {
    if (!rejectReason.trim()) return toast({ title: "Reason required", variant: "destructive" });
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("payments")
      .update({ status: "rejected", verified_by: user?.id, verified_at: new Date().toISOString(), rejection_reason: rejectReason } as any)
      .eq("id", p.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });

    if (p.customer_id) {
      const { data: cust } = await supabase.from("customers").select("user_id").eq("id", p.customer_id).maybeSingle();
      if (cust?.user_id) {
        await supabase.from("in_app_notifications").insert({
          user_id: cust.user_id,
          type: "payment_rejected",
          title: "Payment Rejected",
          message: `Your M-Pesa submission (code ${p.mpesa_code}) was rejected: ${rejectReason}. Please resubmit with the correct code.`,
          metadata: { payment_id: p.id },
        });
      }
    }

    setRejectingId(null);
    setRejectReason("");
    toast({ title: "Payment Rejected" });
    load();
  };

  const addSms = async () => {
    if (!form.mpesa_code.trim() || !form.amount) {
      return toast({ title: "Code and amount required", variant: "destructive" });
    }
    setSaving(true);
    const { error } = await (supabase.from as any)("mpesa_sms_inbox").insert({
      mpesa_code: form.mpesa_code.trim().toUpperCase(),
      amount: Number(form.amount),
      sender_name: form.sender_name || null,
      sender_phone: form.sender_phone || null,
      message_text: form.message_text || null,
    });
    setSaving(false);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "SMS added", description: "Auto-matched if a pending submission was found." });
    setForm({ mpesa_code: "", amount: "", sender_name: "", sender_phone: "", message_text: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> M-Pesa Payments Awaiting Verification</CardTitle>
          <CardDescription>Confirm each entry against the Safaricom SMS you received. Matching entries auto-verify.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : pending.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">No pending M-Pesa submissions</p>
          ) : (
            <div className="space-y-3">
              {pending.map(p => {
                const match = smsFor(p.mpesa_code);
                return (
                  <Card key={p.id} className="p-4">
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div>
                        <p className="font-medium">{p.customers?.customer_name || "Customer"}</p>
                        <p className="text-sm text-muted-foreground">
                          Delivery: {p.deliveries?.delivery_date ? format(new Date(p.deliveries.delivery_date), "MMM d, yyyy") : "-"}
                        </p>
                        <p className="text-sm">Code: <span className="font-mono font-bold">{p.mpesa_code}</span></p>
                        <p className="text-sm">Amount: <strong>KSh {Number(p.amount).toLocaleString()}</strong></p>
                        <p className="text-xs text-muted-foreground">Submitted {p.created_at ? format(new Date(p.created_at), "MMM d, HH:mm") : ""}</p>
                      </div>
                      <div className="text-right">
                        {match ? (
                          <Badge className="bg-green-100 text-green-800">SMS matched: KSh {Number(match.amount).toLocaleString()}</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">No SMS match yet</Badge>
                        )}
                      </div>
                    </div>
                    {canAct && (
                      <div className="mt-3 space-y-2">
                        {rejectingId === p.id ? (
                          <div className="space-y-2">
                            <Textarea placeholder="Rejection reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                            <div className="flex gap-2">
                              <Button size="sm" variant="destructive" onClick={() => rejectPayment(p)}>Confirm Reject</Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => confirmPayment(p)}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Paid
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectingId(p.id)}>
                              <XCircle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canAct && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Inbox className="w-5 h-5" /> Safaricom SMS Inbox</CardTitle>
            <CardDescription>Add an SMS entry to auto-match customer submissions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>M-Pesa Code *</Label>
                <Input value={form.mpesa_code} onChange={e => setForm({ ...form, mpesa_code: e.target.value.toUpperCase() })} maxLength={10} />
              </div>
              <div>
                <Label>Amount (KSh) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Sender Name</Label>
                <Input value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} />
              </div>
              <div>
                <Label>Sender Phone</Label>
                <Input value={form.sender_phone} onChange={e => setForm({ ...form, sender_phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>SMS Message (optional)</Label>
              <Textarea value={form.message_text} onChange={e => setForm({ ...form, message_text: e.target.value })} rows={2} />
            </div>
            <Button onClick={addSms} disabled={saving}>
              <Send className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Add SMS"}
            </Button>

            <div className="pt-4">
              <p className="text-sm font-medium mb-2">Recent SMS entries</p>
              {sms.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {sms.map(s => (
                    <div key={s.id} className="text-xs flex justify-between border rounded p-2">
                      <span className="font-mono">{s.mpesa_code}</span>
                      <span>KSh {Number(s.amount).toLocaleString()}</span>
                      <span className="text-muted-foreground">{format(new Date(s.received_at), "MMM d, HH:mm")}</span>
                      <span>{s.matched_payment_id ? <Badge className="bg-green-100 text-green-800">matched</Badge> : <Badge variant="secondary">unmatched</Badge>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
