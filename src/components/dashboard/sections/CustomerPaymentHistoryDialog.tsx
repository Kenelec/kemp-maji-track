import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Scale, Phone, Mail, MapPin } from "lucide-react";

interface CustomerPaymentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: {
    id: string;
    customer_name: string;
    phone?: string | null;
    email?: string | null;
    area?: string | null;
  } | null;
}

interface Transaction {
  date: string;
  type: "delivery" | "payment";
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export function CustomerPaymentHistoryDialog({
  open,
  onOpenChange,
  customer,
}: CustomerPaymentHistoryDialogProps) {
  // Fetch deliveries for this customer
  const { data: deliveries } = useQuery({
    queryKey: ["customer-deliveries", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          id,
          delivery_date,
          total_amount,
          delivery_items (
            product_name,
            quantity
          )
        `)
        .eq("customer_id", customer.id)
        .order("delivery_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customer?.id,
  });

  // Fetch payments for this customer
  const { data: payments } = useQuery({
    queryKey: ["customer-payments", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customer?.id,
  });

  // Calculate running balance and build transaction history
  const { transactions, totalDelivered, totalPaid, currentBalance } = useMemo(() => {
    if (!deliveries || !payments) {
      return { transactions: [], totalDelivered: 0, totalPaid: 0, currentBalance: 0 };
    }

    // Combine deliveries and payments into a unified list
    const allTransactions: (Transaction & { sortDate: Date })[] = [
      ...deliveries.map((d) => ({
        date: d.delivery_date,
        sortDate: new Date(d.delivery_date),
        type: "delivery" as const,
        description: d.delivery_items?.map((i: any) => `${i.product_name} x${i.quantity}`).join(", ") || "Delivery",
        debit: Number(d.total_amount),
        credit: 0,
        balance: 0,
      })),
      ...payments.map((p) => ({
        date: p.created_at || p.due_date,
        sortDate: new Date(p.created_at || p.due_date),
        type: "payment" as const,
        description: p.mpesa_code ? `M-Pesa: ${p.mpesa_code}` : `${p.payment_method || "Cash"} Payment`,
        debit: 0,
        credit: Number(p.amount),
        balance: 0,
      })),
    ];

    // Sort by date
    allTransactions.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    // Calculate running balance
    let runningBalance = 0;
    const transactionsWithBalance = allTransactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    const totalDelivered = deliveries.reduce((sum, d) => sum + Number(d.total_amount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      transactions: transactionsWithBalance,
      totalDelivered,
      totalPaid,
      currentBalance: totalDelivered - totalPaid,
    };
  }, [deliveries, payments]);

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Payment History - {customer.customer_name}</DialogTitle>
        </DialogHeader>

        {/* Customer Info */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
          {customer.phone && (
            <div className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              {customer.phone}
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-1">
              <Mail className="w-4 h-4" />
              {customer.email}
            </div>
          )}
          {customer.area && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {customer.area}
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-destructive" />
                Total Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KSh {totalDelivered.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-600" />
                Total Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">KSh {totalPaid.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Scale className="w-4 h-4" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${
                currentBalance > 0 ? "text-destructive" : 
                currentBalance < 0 ? "text-green-600" : "text-muted-foreground"
              }`}>
                KSh {Math.abs(currentBalance).toLocaleString()}
                {currentBalance < 0 && " (Credit)"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t, index) => (
                    <TableRow key={index}>
                      <TableCell>{format(new Date(t.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "delivery" ? "outline" : "secondary"}>
                          {t.type === "delivery" ? "Delivery" : "Payment"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{t.description}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {t.debit > 0 ? `KSh ${t.debit.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {t.credit > 0 ? `KSh ${t.credit.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        t.balance > 0 ? "text-destructive" : 
                        t.balance < 0 ? "text-green-600" : "text-muted-foreground"
                      }`}>
                        KSh {Math.abs(t.balance).toLocaleString()}
                        {t.balance < 0 && " CR"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
