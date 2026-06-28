import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { AlertCircle, CheckCircle, Clock, CreditCard } from "lucide-react";

interface PaymentWithDetails {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  payment_method: string;
  mpesa_code: string | null;
  created_at: string;
  delivery_id: string | null;
  deliveries?: {
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

export function CustomerPaymentsSection() {
  // Fetch customer's payments with delivery details
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["customer-payments"],
    queryFn: async () => {
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select(`
          *,
          deliveries (
            delivery_date,
            total_amount,
            qty
          )
        `)
        .order("due_date", { ascending: false });

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
  });

  // Process payments to determine derived status
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

  // ✅ FIXED: Categorize payments correctly
const pendingPayments = processedPayments.filter(
  (p) => (p.status === "pending" || p.status === "overdue") && p.amount > 0
);
const creditPayments = processedPayments.filter((p) => p.derivedStatus === "credit");
const paidPayments = processedPayments.filter((p) => p.status === "paid" && p.amount > 0);

  // Calculate totals
  const totalPending = pendingPayments.reduce((sum, p) => sum + Math.abs(p.difference), 0);
  const totalCredit = creditPayments.reduce((sum, p) => sum + Math.abs(p.difference), 0);

  const renderPaymentRow = (payment: typeof processedPayments[0]) => (
    <TableRow key={payment.id}>
      <TableCell>
        {payment.deliveries?.delivery_date
          ? format(new Date(payment.deliveries.delivery_date), "MMM d, yyyy")
          : format(new Date(payment.created_at), "MMM d, yyyy")}
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          {payment.delivery_items && payment.delivery_items.length > 0 ? (
            payment.delivery_items.map((item, idx) => (
              <div key={idx} className="text-sm">
                {item.product_name} <span className="text-muted-foreground">({item.quantity})</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground text-sm">No items</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="space-y-1">
          <div className="font-medium">KSh {payment.amount.toLocaleString()}</div>
          {payment.deliveryTotal > 0 && (
            <div className="text-xs text-muted-foreground">
              of KSh {payment.deliveryTotal.toLocaleString()}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {payment.difference !== 0 && (
          <span
            className={
              payment.difference > 0
                ? "text-destructive font-semibold"
                : "text-accent font-semibold"
            }
          >
            {payment.difference > 0 ? "Pending: " : "Credit: "}
            KSh {Math.abs(payment.difference).toLocaleString()}
          </span>
        )}
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
        ) : payment.status === "paid" ? (
          <Badge variant="secondary" className="gap-1 bg-secondary/10 text-secondary">
            <CheckCircle className="w-3 h-3" />
            Paid
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {format(new Date(payment.due_date), "MMM d, yyyy")}
      </TableCell>
    </TableRow>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">Loading payments...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertCircle className="w-4 h-4" />
              Pending/Overdue
            </div>
            <div className="text-2xl font-bold text-destructive">
              KSh {totalPending.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingPayments.length} payment{pendingPayments.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CreditCard className="w-4 h-4" />
              Credits
            </div>
            <div className="text-2xl font-bold text-accent">
              KSh {totalCredit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {creditPayments.length} credit{creditPayments.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="w-4 h-4" />
              Completed
            </div>
            <div className="text-2xl font-bold text-secondary">
              {paidPayments.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              payment{paidPayments.length !== 1 ? "s" : ""} paid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>View and track all your payments</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">
                Pending/Overdue ({pendingPayments.length})
              </TabsTrigger>
              <TabsTrigger value="credits">Credits ({creditPayments.length})</TabsTrigger>
              <TabsTrigger value="paid">Paid ({paidPayments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {pendingPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending payments
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Delivery Date</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead className="text-right">Amount Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{pendingPayments.map(renderPaymentRow)}</TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="credits">
              {creditPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No credits found</div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Delivery Date</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead className="text-right">Amount Paid</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{creditPayments.map(renderPaymentRow)}</TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="paid">
              {paidPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No completed payments
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Delivery Date</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead className="text-right">Amount Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>{paidPayments.map(renderPaymentRow)}</TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
