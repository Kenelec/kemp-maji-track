import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, startOfYear, isBefore, differenceInDays } from "date-fns";
import { CheckCircle, AlertCircle, Clock, Truck, Package, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CustomerDeliveryDiscrepancyDialog } from "./CustomerDeliveryDiscrepancyDialog";

interface DeliveryWithItems {
  id: string;
  delivery_date: string;
  total_amount: number;
  qty: number;
  delivery_status: string;
  payment_status: string;
  customer_confirmed: boolean;
  confirmed_at: string | null;
  confirmation_deadline: string | null;
  auto_confirmed: boolean;
  discrepancy_flag: boolean | null;
  created_at: string;
  driver_id: string | null;
  drivers?: { id: string; name: string; phone: string | null } | null;
  driverInfo?: { id: string; name: string; phone: string | null } | null;
  delivery_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_id: string | null;
    description?: string | null;
  }>;
  hasOpenQuery?: boolean;
  latestQuery?: {
    id: string;
    status: string;
    resolution_note: string | null;
    query_type: string;
  } | null;
}

const getDateRange = (period: string) => {
  const now = new Date();
  switch (period) {
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
    case "last_week":
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      return { start: lastWeekStart, end: lastWeekEnd };
    case "this_month":
      return { start: startOfMonth(now), end: now };
    case "this_year":
      return { start: startOfYear(now), end: now };
    case "all":
    default:
      return null;
  }
};

export function CustomerDeliveriesSection() {
  const [period, setPeriod] = useState("this_week");
  const [discrepancyDelivery, setDiscrepancyDelivery] = useState<DeliveryWithItems | null>(null);
  const queryClient = useQueryClient();

  const { data: deliveries, isLoading, refetch } = useQuery({
    queryKey: ["customer-deliveries", period],
    queryFn: async () => {
      const dateRange = getDateRange(period);
      
      let query = supabase
        .from("deliveries")
        .select(`
          *,
          drivers (id, name, phone)
        `)
        .order("delivery_date", { ascending: false });

      if (dateRange) {
        query = query
          .gte("delivery_date", dateRange.start.toISOString())
          .lte("delivery_date", dateRange.end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // ✅ Fetch delivery items for each delivery
      const deliveriesWithItems = await Promise.all(
        (data || []).map(async (delivery) => {
          // ✅ Fetch delivery items with ALL fields
          const { data: items, error: itemsError } = await supabase
            .from("delivery_items")
            .select("*")
            .eq("delivery_id", delivery.id);
          
          if (itemsError) {
            console.error('[CustomerDeliveries] Error fetching items:', itemsError);
          }

          // ✅ DEBUG: Log what we got
          console.log('🔍 Delivery ID:', delivery.id, 'Items found:', items?.length || 0);
          console.log('📦 Items data:', items);
          
          // ✅ Fetch product descriptions for each item
          const itemsWithDescriptions = await Promise.all(
            (items || []).map(async (item) => {
              if (item.product_id) {
                const { data: product, error: productError } = await supabase
                  .from("products")
                  .select("description")
                  .eq("id", item.product_id)
                  .maybeSingle();
                if (productError) {
                  console.error('[CustomerDeliveries] Error fetching product description:', productError);
                }
                return { ...item, description: product?.description || null };
              }
              return { ...item, description: null };
            })
          );

          // Always fetch driver separately since FK join may not work
          let driverInfo = null;
          if (delivery.driver_id) {
            const { data: driver, error: driverError } = await supabase
              .from("drivers")
              .select("id, name, phone")
              .eq("id", delivery.driver_id)
              .maybeSingle();
            if (driverError) {
              console.error('[CustomerDeliveries] Error fetching driver:', driverError);
            }
            driverInfo = driver;
          }
          
          // Check for queries and get latest status
          const { data: queries } = await supabase
            .from("delivery_queries")
            .select("id, status, resolution_note, query_type")
            .eq("delivery_id", delivery.id)
            .order('created_at', { ascending: false })
            .limit(1);
          
          const latestQuery = queries?.[0] || null;
          
          return { 
            ...delivery, 
            drivers: driverInfo,
            driverInfo: driverInfo,
            delivery_items: itemsWithDescriptions,
            hasOpenQuery: latestQuery && (latestQuery.status === 'pending' || latestQuery.status === 'open'),
            latestQuery
          } as DeliveryWithItems;
        })
      );

      return deliveriesWithItems;
    },
    refetchOnMount: 'always',
    staleTime: 0,
    refetchInterval: 5000,
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: async (deliveryId: string) => {
      const { error } = await supabase
        .from("deliveries")
        .update({
          customer_confirmed: true,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Delivery Confirmed",
        description: "Thank you for confirming your delivery.",
      });
      queryClient.invalidateQueries({ queryKey: ["customer-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["last-delivery"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to confirm delivery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canConfirmDelivery = (delivery: DeliveryWithItems) => {
    if (delivery.customer_confirmed || delivery.auto_confirmed) return false;
    if (delivery.discrepancy_flag || delivery.hasOpenQuery) return false;
    if (!delivery.confirmation_deadline) return true;
    return isBefore(new Date(), new Date(delivery.confirmation_deadline));
  };

  const getConfirmationStatus = (delivery: DeliveryWithItems) => {
    // ✅ Check payment status FIRST - highest priority
    if (delivery.payment_status === 'paid') {
      return { status: "paid", label: "Paid", icon: CheckCircle, color: "text-green-600" };
    }
    if (delivery.payment_status === 'partial') {
      return { status: "partial", label: "Partial Payment", icon: CreditCard, color: "text-blue-600" };
    }
    
    // Then check confirmation status
    if (delivery.customer_confirmed) {
      return { status: "confirmed", label: "Confirmed (Unpaid)", icon: CheckCircle, color: "text-yellow-600" };
    }
    if (delivery.auto_confirmed) {
      return { status: "auto", label: "Auto-confirmed (Unpaid)", icon: Clock, color: "text-muted-foreground" };
    }
    if (delivery.confirmation_deadline) {
      const daysLeft = differenceInDays(new Date(delivery.confirmation_deadline), new Date());
      if (daysLeft < 0) {
        return { status: "expired", label: "Expired", icon: AlertCircle, color: "text-destructive" };
      }
      return { status: "pending", label: `${daysLeft + 1}d left`, icon: Clock, color: "text-yellow-600" };
    }
    return { status: "pending", label: "Pending", icon: Clock, color: "text-yellow-600" };
  };

  const totalDeliveries = deliveries?.length || 0;
  const totalAmount = deliveries?.reduce((sum, d) => sum + Number(d.total_amount || 0), 0) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">Loading deliveries...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Truck className="w-4 h-4" />
              Deliveries
            </div>
            <div className="text-2xl font-bold">{totalDeliveries}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {period === "all" ? "All time" : period.replace("_", " ")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Package className="w-4 h-4" />
              Total Value
            </div>
            <div className="text-2xl font-bold">KSh {totalAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {period === "all" ? "All time" : period.replace("_", " ")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Deliveries Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>My Deliveries</CardTitle>
              <CardDescription>View and confirm your deliveries</CardDescription>
            </div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="last_week">Last Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {deliveries && deliveries.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => {
                    const confirmStatus = getConfirmationStatus(delivery);
                    const ConfirmIcon = confirmStatus.icon;
                    
                    return (
                      <TableRow key={delivery.id}>
                        <TableCell>
                          {format(new Date(delivery.delivery_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {delivery.delivery_items && delivery.delivery_items.length > 0 ? (
                              delivery.delivery_items.map((item, idx) => (
                                <div key={idx} className="text-sm">
                                  <span className="font-medium">{item.product_name || 'Unknown Product'}</span>
                                  {item.description && (
                                    <span className="text-xs text-muted-foreground block">{item.description}</span>
                                  )}
                                  <span className="text-muted-foreground text-xs">@ KSh {Number(item.unit_price || 0).toLocaleString()}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">No products</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {delivery.delivery_items && delivery.delivery_items.length > 0 ? (
                              delivery.delivery_items.map((item, idx) => (
                                <div key={idx} className="text-sm">{item.quantity}</div>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">{delivery.qty}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          KSh {Number(delivery.total_amount).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {delivery.driverInfo?.name || delivery.drivers?.name || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <ConfirmIcon className={`w-4 h-4 ${confirmStatus.color}`} />
                              <span className={`text-sm ${confirmStatus.color}`}>
                                {confirmStatus.label}
                              </span>
                            </div>
                            {delivery.latestQuery && (
                              <div>
                                <Badge 
                                  variant="secondary"
                                  className={
                                    delivery.latestQuery.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                    delivery.latestQuery.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                  }
                                >
                                  Query: {delivery.latestQuery.status}
                                </Badge>
                                {delivery.latestQuery.resolution_note && (
                                  <p className="text-xs text-muted-foreground mt-1 max-w-[150px] truncate" title={delivery.latestQuery.resolution_note}>
                                    {delivery.latestQuery.resolution_note}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canConfirmDelivery(delivery) && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-600 hover:bg-green-50"
                                onClick={() => confirmDeliveryMutation.mutate(delivery.id)}
                                disabled={confirmDeliveryMutation.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive hover:bg-red-50"
                                onClick={() => setDiscrepancyDelivery(delivery)}
                              >
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Issue
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No deliveries found for the selected period.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discrepancy Dialog */}
      <CustomerDeliveryDiscrepancyDialog
        delivery={discrepancyDelivery}
        onClose={() => setDiscrepancyDelivery(null)}
        onSuccess={() => {
          setDiscrepancyDelivery(null);
          queryClient.invalidateQueries({ queryKey: ["customer-deliveries"] });
        }}
      />
    </div>
  );
}
