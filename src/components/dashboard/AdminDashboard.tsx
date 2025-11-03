const kempLogo = "/kemp-logo.png";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  LogOut, 
  Truck, 
  CreditCard, 
  Users, 
  Package, 
  Download,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { CustomersSection } from "./sections/CustomersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { DeliveriesSection } from "./sections/DeliveriesSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminDashboardProps {
  onLogout: () => void;
}

const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("deliveries");

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  const menuItems = [
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
          <div className="flex items-center space-x-3">
            <img 
              src={kempLogo} 
              alt="KEMP Logo" 
              className="w-8 h-8 md:w-10 md:h-10 object-contain"
            />
            <div>
              <h1 className="text-lg md:text-xl font-bold text-primary">KEMP Maji Track</h1>
              <Badge variant="secondary" className="bg-tertiary/10 text-tertiary text-xs md:text-sm ml-0">
                Admin
              </Badge>
            </div>
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
          <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Admin permissions: You can view and create records. Updates and deletions require Master Admin approval.
            </AlertDescription>
          </Alert>

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
                    <Button variant="outline" className="w-full">
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
                    <Button variant="outline" className="w-full">
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
                    <Button variant="outline" className="w-full">
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

export default AdminDashboard;
