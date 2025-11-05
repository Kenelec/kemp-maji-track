import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useState } from "react";
import { AlertCircle, CreditCard } from "lucide-react";

interface OverduePaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PaymentWithDetails {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  payment_method: string;
  mpesa_code: string | null;
  customer_id: string;
  delivery_id: string | null;
  customers: {
    customer_name: string;
    email: string | null;
    phone: string | null;
  };
  deliveries?: {
    id: string;
    delivery_date: string;
    total_amount: number;
    qty: number;
  };
  delivery_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

export function OverduePaymentsDialog({ open, onOpenChange }: OverduePaymentsDialogProps) {
  const [filter, setFilter] = useState<"all" | "overdue" | "credit">("all");

  // Fetch payments with customer and delivery details
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["overdue-credit-payments"],
    queryFn: async () => {
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select(`
          *,
          customers (
            customer_name,
            email,
            phone
          ),
          deliveries (
            id,
            delivery_date,
            total_amount,
            qty
          )
        `)
        .in("status", ["overdue", "pending"]);

      if (paymentsError) throw paymentsError;

      // Fetch delivery items for each payment that has a delivery
      const paymentsWithItems = await Promise.all(
        (payments || []).map(async (payment) => {
          if (payment.delivery_id) {
            const { data: items } = await supabase
              .from("delivery_items")
              .select("product_name, quantity, unit_price, total_price")
              .eq("delivery_id", payment.delivery_id);
            return { ...payment, delivery_items: items || [] };
          }
          return { ...payment, delivery_items: [] };
        })
      );

      return paymentsWithItems as PaymentWithDetails[];
    },
    enabled: open,
  });

  // Calculate derived status (overdue vs credit)
  const processedPayments = (paymentsData || []).map((payment) => {
    const deliveryTotal = payment.deliveries?.total_amount || 0;
    const paidAmount = payment.amount || 0;
    const difference = deliveryTotal - paidAmount;

    let derivedStatus = payment.status;
    if (payment.status === "pending" && difference < 0) {
      derivedStatus = "credit"; // Overpayment
    }

    return {
      ...payment,
      derivedStatus,
      difference,
      deliveryTotal,
    };
  });

  // Filter payments based on selected filter
  const filteredPayments = processedPayments.filter((payment) => {
    if (filter === "all") return true;
    if (filter === "overdue") return payment.status === "overdue";
    if (filter === "credit") return payment.derivedStatus === "credit";
    return true;
  });

  // Calculate totals
  const totalOverdue = filteredPayments
    .filter((p) => p.status === "overdue")
    .reduce((sum, p) => sum + Math.abs(p.difference), 0);
  const totalCredit = filteredPayments
    .filter((p) => p.derivedStatus === "credit")
    .reduce((sum, p) => sum + Math.abs(p.difference), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            Overdue & Credit Payments Details
          </DialogTitle>
          <DialogDescription>
            Detailed view of all overdue payments and customer credits
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Overdue</div>
                <div className="text-2xl font-bold text-destructive">
                  KSh {totalOverdue.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Credits</div>
                <div className="text-2xl font-bold text-accent">
                  KSh {totalCredit.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Payments</div>
                <div className="text-2xl font-bold text-primary">
                  {filteredPayments.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            <Select value={filter} onValueChange={(value: any) => setFilter(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="overdue">Overdue Only</SelectItem>
                <SelectItem value="credit">Credits Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payments Table */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading payments...</div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {filter !== "all" ? filter : ""} payments found
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className="text-right">Delivery Total</TableHead>
                    <TableHead className="text-right">Amount Paid</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{payment.customers.customer_name}</div>
                          {payment.customers.phone && (
                            <div className="text-xs text-muted-foreground">
                              {payment.customers.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {payment.deliveries?.delivery_date
                          ? format(new Date(payment.deliveries.delivery_date), "MMM d, yyyy")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {payment.delivery_items && payment.delivery_items.length > 0 ? (
                            payment.delivery_items.map((item, idx) => (
                              <div key={idx} className="text-sm">
                                {item.product_name} ({item.quantity})
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">No items</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        KSh {payment.deliveryTotal.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        KSh {payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            payment.difference > 0
                              ? "text-destructive font-semibold"
                              : payment.difference < 0
                              ? "text-accent font-semibold"
                              : "text-muted-foreground"
                          }
                        >
                          {payment.difference > 0 && "+"}
                          KSh {Math.abs(payment.difference).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {payment.status === "overdue" ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Overdue
                          </Badge>
                        ) : payment.derivedStatus === "credit" ? (
                          <Badge variant="secondary" className="gap-1 bg-accent/10 text-accent">
                            <CreditCard className="w-3 h-3" />
                            Credit
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(payment.due_date), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
