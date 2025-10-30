import kempLogo from "@/assets/kemp-logo.png";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  LogOut, 
  Truck, 
  CreditCard, 
  Users, 
  Package, 
  Download,
  Plus,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

          {activeTab === "deliveries" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Deliveries</h2>
                  <p className="text-muted-foreground">View and create water deliveries</p>
                </div>
                <Button className="bg-gradient-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  New Delivery
                </Button>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Recent Deliveries</CardTitle>
                  <CardDescription>
                    Track and manage all water deliveries
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    No deliveries found. Create your first delivery to get started.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Payments</h2>
                  <p className="text-muted-foreground">View customer payments</p>
                </div>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Payment Records</CardTitle>
                  <CardDescription>
                    View payment status and history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    No payments found.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "customers" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Customers</h2>
                  <p className="text-muted-foreground">View and add customer information</p>
                </div>
                <Button className="bg-gradient-secondary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer
                </Button>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Customer Database</CardTitle>
                  <CardDescription>
                    View and add customer profiles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    No customers found. Add your first customer to get started.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "products" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Products</h2>
                  <p className="text-muted-foreground">View and add water products</p>
                </div>
                <Button className="bg-gradient-tertiary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Product Catalog</CardTitle>
                  <CardDescription>
                    View and add water products and pricing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    No products found. Add your first product to get started.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

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
