import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Users, Truck, DollarSign, AlertCircle, CreditCard } from "lucide-react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, format } from "date-fns";

export function DashboardSection() {
  const [deliveryPeriod, setDeliveryPeriod] = useState("today");
  const [paymentPeriod, setPaymentPeriod] = useState("today");

  const getDateRange = (period: string) => {
    const now = new Date();
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "this-week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "last-week":
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek), end: endOfWeek(lastWeek) };
      case "this-month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last-month":
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const { data: customersCount } = useQuery({
    queryKey: ["customers-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: deliveriesData } = useQuery({
    queryKey: ["deliveries-stats", deliveryPeriod],
    queryFn: async () => {
      const { start, end } = getDateRange(deliveryPeriod);
      const { data, error } = await supabase
        .from("deliveries")
        .select("*")
        .gte("delivery_date", format(start, "yyyy-MM-dd"))
        .lte("delivery_date", format(end, "yyyy-MM-dd"));
      if (error) throw error;
      return data || [];
    },
  });

  const { data: paymentsData } = useQuery({
    queryKey: ["payments-stats", paymentPeriod],
    queryFn: async () => {
      const { start, end } = getDateRange(paymentPeriod);
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  const { data: overduePayments } = useQuery({
    queryKey: ["overdue-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("status", "overdue");
      if (error) throw error;
      return data || [];
    },
  });

  const cashPayments = paymentsData?.filter(p => p.payment_method === "cash" && p.status === "paid").length || 0;
  const mpesaPayments = paymentsData?.filter(p => p.payment_method === "mpesa" && p.status === "paid").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your business metrics</p>
      </div>

      {/* Customer Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Total Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-primary">{customersCount}</div>
        </CardContent>
      </Card>

      {/* Deliveries Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-secondary" />
            Deliveries
          </CardTitle>
          <CardDescription>
            <Select value={deliveryPeriod} onValueChange={setDeliveryPeriod}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this-week">This Week</SelectItem>
                <SelectItem value="last-week">Last Week</SelectItem>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
              </SelectContent>
            </Select>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-secondary">{deliveriesData?.length || 0}</div>
          <p className="text-sm text-muted-foreground mt-2">deliveries completed</p>
        </CardContent>
      </Card>

      {/* Payments Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-accent" />
              Payments
            </CardTitle>
            <CardDescription>
              <Select value={paymentPeriod} onValueChange={setPaymentPeriod}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this-week">This Week</SelectItem>
                  <SelectItem value="last-week">Last Week</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CreditCard className="w-4 h-4" />
                Cash Payments
              </div>
              <div className="text-3xl font-bold text-secondary">{cashPayments}</div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CreditCard className="w-4 h-4" />
                M-Pesa Payments
              </div>
              <div className="text-3xl font-bold text-accent">{mpesaPayments}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Overdue Payments
            </CardTitle>
            <CardDescription>Payments requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-destructive">{overduePayments?.length || 0}</div>
            <p className="text-sm text-muted-foreground mt-2">payments overdue</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
