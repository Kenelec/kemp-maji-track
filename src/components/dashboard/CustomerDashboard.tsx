const kempLogo = "/kemp-logo.png";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  LogOut, 
  Truck, 
  CreditCard, 
  Eye,
  DollarSign,
  Calendar,
  Menu,
  X,
  FileText
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CustomerPaymentsSection } from "./sections/CustomerPaymentsSection";
import { CustomerStatementsSection } from "./sections/CustomerStatementsSection";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerDashboardProps {
  onLogout: () => void;
}

const CustomerDashboard = ({ onLogout }: CustomerDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [mpesaCode, setMpesaCode] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        .select("*")
        .in("status", ["pending", "overdue"]);
      if (error) throw error;
      return data || [];
    },
  });

  const totalPending = pendingPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

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
                    setSidebarOpen(false); // Close sidebar after selection on mobile
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
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <Card className="p-4">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
                    <Truck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl md:text-2xl font-bold">{deliveriesCount || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      All time deliveries
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="p-4">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl md:text-2xl font-bold">KSh {totalPending.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      {pendingPayments?.length || 0} pending payment{pendingPayments?.length !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
                
                <Card className="p-4">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Next Delivery</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl md:text-2xl font-bold">-</div>
                    <p className="text-xs text-muted-foreground">
                      No scheduled deliveries
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "deliveries" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground">My Deliveries</h2>
                <p className="text-sm md:text-muted-foreground">Track your water delivery history</p>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Delivery History</CardTitle>
                  <CardDescription>
                    View your past and upcoming deliveries
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    No deliveries found. Your delivery history will appear here.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground">My Payments</h2>
                <p className="text-sm md:text-muted-foreground">Manage your payment history and pending payments</p>
              </div>
              
              <CustomerPaymentsSection />

              <Card>
                <CardHeader>
                  <CardTitle>Submit M-Pesa Payment</CardTitle>
                  <CardDescription>
                    Submit your M-Pesa transaction code after making payment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mpesa-code">M-Pesa Transaction Code</Label>
                    <Input
                      id="mpesa-code"
                      placeholder="Enter M-Pesa code (e.g., QJ23HGKL)"
                      value={mpesaCode}
                      onChange={(e) => setMpesaCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="payment-notes"
                      placeholder="Any additional information about the payment"
                      rows={3}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button className="bg-gradient-primary w-full sm:w-auto">
                      Submit M-Pesa Code
                    </Button>
                    <Button variant="outline" className="w-full sm:w-auto">
                      Pay by Cash (Notify Admin)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "statements" && <CustomerStatementsSection />}
        </main>
      </div>
    </div>
  );
};

export default CustomerDashboard;
