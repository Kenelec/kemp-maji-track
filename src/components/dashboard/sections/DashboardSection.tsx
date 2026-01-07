import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Users, Truck, AlertCircle, CreditCard } from "lucide-react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format } from "date-fns";
import { OverduePaymentsDialog } from "./OverduePaymentsDialog";

interface DashboardSectionProps {
  onNavigateToTab?: (tabId: string) => void;
}

export function DashboardSection({ onNavigateToTab }: DashboardSectionProps) {
  const [deliveryPeriod, setDeliveryPeriod] = useState("today");
  const [paymentPeriod, setPaymentPeriod] = useState("today");
  const [mpesaPeriod, setMpesaPeriod] = useState("today");
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);

  const getDateRange = (period: string) => {
    const now = new Date();
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "this-week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "this-month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "this-year":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "all":
        return null;
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
    refetchInterval: 10000,
  });

  const { data: deliveriesData } = useQuery({
    queryKey: ["deliveries-stats", deliveryPeriod],
    queryFn: async () => {
      const dateRange = getDateRange(deliveryPeriod);
      let query = supabase.from("deliveries").select("*");
      
      if (dateRange) {
        const { start, end } = dateRange;
        query = query
          .gte("delivery_date", format(start, "yyyy-MM-dd"))
          .lte("delivery_date", format(end, "yyyy-MM-dd"));
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: paymentsData } = useQuery({
    queryKey: ["payments-stats", paymentPeriod],
    queryFn: async () => {
      const dateRange = getDateRange(paymentPeriod);
      let query = supabase.from("payments").select("*").gt("amount", 0); // Only payments with actual amounts
      
      if (dateRange) {
        const { start, end } = dateRange;
        query = query
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: mpesaPaymentsData } = useQuery({
    queryKey: ["mpesa-payments-stats", mpesaPeriod],
    queryFn: async () => {
      const dateRange = getDateRange(mpesaPeriod);
      let query = supabase.from("payments")
        .select("*")
        .eq("payment_method", "mpesa")
        .gt("amount", 0); // Count any M-Pesa payment received
      
      if (dateRange) {
        query = query
          .gte("created_at", dateRange.start.toISOString())
          .lte("created_at", dateRange.end.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: outstandingPayments } = useQuery({
    queryKey: ["outstanding-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, customers(customer_name), deliveries(total_amount)")
        .in("status", ["overdue", "pending"]);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  // Count all cash payments regardless of status (any cash received)
  const cashPayments = paymentsData?.filter(p => p.payment_method === "cash" && Number(p.amount || 0) > 0) || [];
  const cashTotal = cashPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const mpesaTotal = mpesaPaymentsData?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
  
  // Calculate outstanding total (delivery amount - paid amount)
  const outstandingTotal = outstandingPayments?.reduce((sum, p) => {
    const deliveryTotal = Number(p.deliveries?.total_amount || 0);
    const paidAmount = Number(p.amount || 0);
    const balance = deliveryTotal - paidAmount;
    return sum + (balance > 0 ? balance : 0);
  }, 0) || 0;
  const uniqueOutstandingCustomers = new Set(outstandingPayments?.map(p => p.customer_id) || []).size;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your business metrics</p>
      </div>

      {/* Compact Grid Layout for Laptop Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Customer Stats */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onNavigateToTab?.("customers")}
        >
          <CardHeader className="p-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-primary" />
              Customers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-primary">{customersCount || 0}</div>
          </CardContent>
        </Card>

        {/* Deliveries Stats */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onNavigateToTab?.("deliveries")}
        >
          <CardHeader className="p-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4 text-secondary" />
              Deliveries
            </CardTitle>
            <CardDescription className="mt-1">
              <Select value={deliveryPeriod} onValueChange={setDeliveryPeriod}>
                <SelectTrigger className="w-full h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this-week">This Week</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="this-year">This Year</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-secondary">{deliveriesData?.length || 0}</div>
          </CardContent>
        </Card>

        {/* Cash Payments */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onNavigateToTab?.("payments")}
        >
          <CardHeader className="p-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="w-4 h-4 text-accent" />
              Cash
            </CardTitle>
            <CardDescription className="mt-1">
              <Select value={paymentPeriod} onValueChange={setPaymentPeriod}>
                <SelectTrigger className="w-full h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this-week">This Week</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="this-year">This Year</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-secondary">KSh {cashTotal.toLocaleString()}</div>
          </CardContent>
        </Card>

        {/* M-Pesa Payments */}
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onNavigateToTab?.("payments")}
        >
          <CardHeader className="p-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="w-4 h-4 text-accent" />
              M-Pesa
            </CardTitle>
            <CardDescription className="mt-1">
              <Select value={mpesaPeriod} onValueChange={setMpesaPeriod}>
                <SelectTrigger className="w-full h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this-week">This Week</SelectItem>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="this-year">This Year</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-accent">KSh {mpesaTotal.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Payments - Full Width */}
      <Card 
        className="cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => setOverdueDialogOpen(true)}
      >
        <CardHeader className="p-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Outstanding Payments • Click to view details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-destructive">KSh {outstandingTotal.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">
              {outstandingPayments?.length || 0} payments • {uniqueOutstandingCustomers} customers
            </div>
          </div>
        </CardContent>
      </Card>

      <OverduePaymentsDialog 
        open={overdueDialogOpen}
        onOpenChange={setOverdueDialogOpen}
      />
    </div>
  );
}
