import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  LogOut, 
  Truck, 
  CreditCard, 
  Users, 
  Package, 
  Download
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CustomersSection } from "./sections/CustomersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { DeliveriesSection } from "./sections/DeliveriesSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { DashboardSection } from "./sections/DashboardSection";

interface MasterAdminDashboardProps {
  onLogout: () => void;
}

const MasterAdminDashboard = ({ onLogout }: MasterAdminDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: Users },
    { id: "deliveries", label: "Deliveries", icon: Truck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "customers", label: "Customers", icon: Users },
    { id: "products", label: "Products", icon: Package },
    { id: "exports", label: "Exports", icon: Download },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-primary">KEMP Maji Track</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Master Admin
            </Badge>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">
              Welcome, {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-[calc(100vh-4rem)] border-r bg-card p-4">
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab(item.id)}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {activeTab === "dashboard" && <DashboardSection />}
          {activeTab === "deliveries" && <DeliveriesSection />}
          {activeTab === "payments" && <PaymentsSection />}
          {activeTab === "customers" && <CustomersSection />}
          {activeTab === "products" && <ProductsSection />}

          {activeTab === "exports" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Export Data</h2>
                <p className="text-muted-foreground">Download reports and data exports</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Deliveries Report</CardTitle>
                    <CardDescription>Export delivery data with filters</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={async () => {
                        const { data, error } = await supabase.from("deliveries").select("*, customers(customer_name)");
                        if (error) return;
                        const csv = [
                          ["Customer", "Date", "Quantity", "Unit Rate", "Total", "Status"],
                          ...data.map(d => [
                            d.customers?.customer_name || "",
                            d.delivery_date,
                            d.qty,
                            d.unit_rate,
                            d.total_amount,
                            d.delivery_status
                          ])
                        ].map(row => row.join(",")).join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "deliveries.csv";
                        a.click();
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Payments Report</CardTitle>
                    <CardDescription>Export payment records</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={async () => {
                        const { data, error } = await supabase
                          .from("payments")
                          .select(`*, customers(customer_name), deliveries(total_amount)`);
                        if (error || !data) return;

                        const rows = data.map((p: any) => {
                          const deliveryTotal = p.deliveries?.total_amount ? Number(p.deliveries.total_amount) : 0;
                          const paymentAmt = Number(p.amount || 0);
                          let statusDisplay = p.status;
                          if (deliveryTotal > 0) {
                            const diff = paymentAmt - deliveryTotal;
                            if (diff > 0) statusDisplay = `${Math.abs(diff)} credit`;
                            else if (diff < 0) statusDisplay = `${Math.abs(diff)} pending`;
                            else statusDisplay = "paid";
                          }
                          return [
                            p.customers?.customer_name || "",
                            paymentAmt,
                            p.due_date,
                            p.payment_method,
                            p.mpesa_code || "",
                            statusDisplay
                          ];
                        });

                        const csv = [["Customer", "Amount", "Due Date", "Method", "M-Pesa Code", "Status"], ...rows]
                          .map((row) => row.join(","))
                          .join("\n");

                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "payments.csv";
                        a.click();
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Customers Report</CardTitle>
                    <CardDescription>Export customer database</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={async () => {
                        const { data, error } = await supabase.from("customers").select("*");
                        if (error) return;
                        const csv = [
                          ["Name", "Phone", "Email", "Area", "Address"],
                          ...data.map(c => [
                            c.customer_name,
                            c.phone || "",
                            c.email || "",
                            c.area || "",
                            c.address || ""
                          ])
                        ].map(row => row.join(",")).join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "customers.csv";
                        a.click();
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MasterAdminDashboard;