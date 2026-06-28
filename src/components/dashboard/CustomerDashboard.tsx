const kempLogo = "/kemp-logo.png";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  LogOut, 
  Truck, 
  CreditCard, 
  Eye,
  DollarSign,
  Calendar,
  Menu,
  X,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CustomerPaymentsSection } from "./sections/CustomerPaymentsSection";
import { CustomerStatementsSection } from "./sections/CustomerStatementsSection";
import { CustomerDeliveriesSection } from "./sections/CustomerDeliveriesSection";
import { CustomerMpesaPaymentForm } from "./sections/CustomerMpesaPaymentForm";
import { CustomerDeliveryDiscrepancyDialog } from "./sections/CustomerDeliveryDiscrepancyDialog";
import { NotificationCenter } from "./NotificationCenter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, isBefore } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface CustomerDashboardProps {
  onLogout: () => void;
}

interface LastDeliveryData {
  id: string;
  delivery_date: string;
  total_amount: number;
  qty: number;
  customer_confirmed: boolean;
  confirmed_at: string | null;
  confirmation_deadline: string | null;
  auto_confirmed: boolean;
  delivery_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

const CustomerDashboard = ({ onLogout }: CustomerDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [discrepancyDelivery, setDiscrepancyDelivery] = useState<LastDeliveryData | null>(null);
  const queryClient = useQueryClient();

  // ✅ PERMANENT FIX: Fetch last delivery AND check the actual payments table
  const { data: lastDelivery } = useQuery({
    queryKey: ["last-delivery"],
    queryFn: async () => {
      // 1. Get the last delivery details
      const { data: deliveryData, error: deliveryError } = await supabase
        .from("deliveries")
        .select("id, delivery_date, total_amount, qty, customer_confirmed, confirmed_at, confirmation_deadline, auto_confirmed")
        .order("delivery_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (deliveryError) throw deliveryError;
      if (!deliveryData) return null;

      // 2. Check the payments table to see if this specific delivery is actually paid
      const { data: paymentData } = await supabase
        .from("payments")
        .select("status, amount")
        .eq("delivery_id", deliveryData.id)
        .in("status", ["paid", "completed"])
        .maybeSingle();

      // 3. Determine if it is paid based on the payment record
      const isPaid = paymentData && (paymentData.status === 'paid' || paymentData.status === 'completed');

      // 4. Get delivery items
      const { data: items } = await supabase
        .from("delivery_items")
        .select("product_name, quantity, unit_price, total_price")
        .eq("delivery_id", deliveryData.id);

      return { 
        ...deliveryData, 
        delivery_items: items || [],
        is_paid: isPaid // ✅ Add this flag
      } as LastDeliveryData & { is_paid: boolean };
    },
  });

  // Fetch customer stats
  const { data: deliveriesCount } = useQuery({
    queryKey: ["customer-deliveries-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ["customer-pending-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, deliveries(total_amount)")
        .in("status", ["pending", "overdue"]);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: paidPaymentsCount } = useQuery({
    queryKey: ["customer-paid-payments-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .in("status", ["paid", "completed"]);
      if (error) throw error;
      return count || 0;
    },
  });

  // Calculate outstanding balance properly
  const totalOutstanding = pendingPayments?.reduce((sum, p) => {
    const deliveryTotal = (p.deliveries as any)?.total_amount || 0;
    const paidAmount = p.amount || 0;
    const balance = deliveryTotal - paidAmount;
    return sum + (balance > 0 ? balance : 0);
  }, 0) || 0;

  // Confirm delivery mutation
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
      queryClient.invalidateQueries({ queryKey: ["last-delivery"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to confirm delivery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const canConfirmDelivery = (delivery: LastDeliveryData) => {
    if (delivery.customer_confirmed || delivery.auto_confirmed) return false;
    if (!delivery.confirmation_deadline) return true;
    return isBefore(new Date(), new Date(delivery.confirmation_deadline));
  };

  // ✅ PERMANENT FIX: Use the is_paid flag we created
  const getConfirmationStatus = (delivery: LastDeliveryData & { is_paid: boolean }) => {
    // Check payment status FIRST - highest priority
    if (delivery.is_paid) {
      return { label: "Paid", icon: CheckCircle, color: "text-green-600" };
    }
    
    // Then check confirmation status
    if (delivery.customer_confirmed) {
      return { label: "Confirmed (Payment Due)", icon: CheckCircle, color: "text-yellow-600" };
    }
    if (delivery.auto_confirmed) {
      return { label: "Auto-confirmed (Payment Due)", icon: Clock, color: "text-muted-foreground" };
    }
    if (delivery.confirmation_deadline) {
      const daysLeft = differenceInDays(new Date(delivery.confirmation_deadline), new Date());
      if (daysLeft < 0) {
        return { label: "Expired - Auto-confirmed", icon: AlertCircle, color: "text-destructive" };
      }
      return { label: `${daysLeft + 1}d left to confirm`, icon: Clock, color: "text-yellow-600" };
    }
    return { label: "Pending", icon: Clock, color: "text-yellow-600" };
  };

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  const menuItems = [
    { id: "overview", label: "Overview", icon: Eye },
    { id: "deliveries", label: "My Deliveries", icon: Truck },
    { id: "payments", label: "My Payments", icon: CreditCard },
    { id: "statements", label: "My Statements", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button 
          variant="outline" 
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-primary text-primary-foreground"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Header */}
      <header className="border-b bg-card md:ml-64">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center space-x-3">
            <img 
              src={kempLogo} 
              alt="KEMP Logo" 
              className="w-8 h-8 md:w-10 md:h-10 object-contain"
            />
            <div>
              <h1 className="text-lg md:text-xl font-bold text-primary">KEMP Maji Track</h1>
              <Badge variant="secondary" className="bg-tertiary/10 text-tertiary text-xs md:text-sm ml-0">
                Customer
              </Badge>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationCenter userId={user?.id} />
            <span className="text-sm text-muted-foreground hidden md:block">
              Welcome, {user?.email?.split('@')[0] || 'User'}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Mobile overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-card border-r p-4 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:w-64`}>
          <div className="flex justify-between items-center mb-6 md:hidden">
            <h2 className="text-lg font-semibold">Menu</h2>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 pt-20 md:pt-6 md:ml-0">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground">Dashboard Overview</h2>
                <p className="text-sm md:text-muted-foreground">Welcome to your water delivery portal</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Last Delivery Card */}
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      Last Delivery
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {lastDelivery ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-lg font-bold">
                              {format(new Date(lastDelivery.delivery_date), "MMM d, yyyy")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {lastDelivery.delivery_items?.map(i => `${i.product_name} x${i.quantity}`).join(", ") || `${lastDelivery.qty} units`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-primary">
                              KSh {Number(lastDelivery.total_amount).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        {/* Confirmation Status */}
                        {(() => {
                          const status = getConfirmationStatus(lastDelivery);
                          const StatusIcon = status.icon;
                          return (
                            <div className={`flex items-center gap-2 text-sm ${status.color}`}>
                              <StatusIcon className="w-4 h-4" />
                              <span>{status.label}</span>
                            </div>
                          );
                        })()}

                        {/* Action Buttons */}
                        {canConfirmDelivery(lastDelivery) && (
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => confirmDeliveryMutation.mutate(lastDelivery.id)}
                              disabled={confirmDeliveryMutation.isPending}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Confirm Delivery
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive hover:bg-red-50"
                              onClick={() => setDiscrepancyDelivery(lastDelivery)}
                            >
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Report Issue
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground">
                        No deliveries yet
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Total Deliveries */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      Total Deliveries
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{deliveriesCount || 0}</div>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </CardContent>
                </Card>

                {/* Paid Payments */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Payments Made
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{paidPaymentsCount || 0}</div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </CardContent>
                </Card>
              </div>

              {/* Outstanding Payments Card - Only show if there's an outstanding balance */}
              {totalOutstanding > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-destructive" />
                      Outstanding Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-2xl font-bold text-destructive">
                          KSh {totalOutstanding.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pendingPayments?.length || 0} pending payment{(pendingPayments?.length || 0) !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        onClick={() => setActiveTab("payments")}
                        className="bg-gradient-primary"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pay Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Show "All Paid" message when there's no outstanding balance */}
              {totalOutstanding === 0 && lastDelivery && (
                <Card className="border-green-500/50 bg-green-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Payment Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">All deliveries are paid! Thank you.</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === "deliveries" && <CustomerDeliveriesSection />}

          {activeTab === "payments" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground">My Payments</h2>
                <p className="text-sm md:text-muted-foreground">Manage your payment history and pending payments</p>
              </div>
              
              <CustomerPaymentsSection />
              <CustomerMpesaPaymentForm />
            </div>
          )}

          {activeTab === "statements" && <CustomerStatementsSection />}
        </main>
      </div>

      {/* Discrepancy Dialog */}
      <CustomerDeliveryDiscrepancyDialog
        delivery={discrepancyDelivery}
        onClose={() => setDiscrepancyDelivery(null)}
        onSuccess={() => {
          setDiscrepancyDelivery(null);
          queryClient.invalidateQueries({ queryKey: ["last-delivery"] });
        }}
      />
    </div>
  );
};

export default CustomerDashboard;
