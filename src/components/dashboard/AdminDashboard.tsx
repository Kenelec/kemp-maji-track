const kempLogo = "/kemp-logo.png";
import { useState, useEffect } from "react";
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
  AlertTriangle,
  Navigation,
  Clock
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CustomersSection } from "./sections/CustomersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { DeliveriesSection } from "./sections/DeliveriesSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { AdminDriverTrackingMap } from "./sections/AdminDriverTrackingMap";
import { BulkExportSection } from "./sections/BulkExportSection";
import { usePaymentNotifications } from "@/hooks/usePaymentNotifications";
import { NotificationCenter } from "./NotificationCenter";

interface DriverLocation {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number | null;
  created_at: string;
  users: {
    name: string;
    phone: string | null;
  } | null;
}

interface AdminDashboardProps {
  onLogout: () => void;
}

const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("deliveries");
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  
  // Enable real-time payment notifications
  usePaymentNotifications(user?.id);

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  // Fetch driver locations for the dashboard
  useEffect(() => {
    const fetchDriverLocations = async () => {
      try {
        const { data: locationsData, error } = await supabase
          .from('driver_locations')
          .select(`
            *,
            users!inner (name, phone)
          `)
          .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()) // Last 30 minutes
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Get unique drivers with latest location
        const uniqueDrivers = new Map();
        locationsData?.forEach(location => {
          if (!uniqueDrivers.has(location.driver_id) ||
              new Date(location.created_at) > new Date(uniqueDrivers.get(location.driver_id).created_at)) {
            uniqueDrivers.set(location.driver_id, location);
          }
        });

        setDriverLocations(Array.from(uniqueDrivers.values()));
      } catch (error) {
        console.error('Error fetching driver locations:', error);
      }
    };

    fetchDriverLocations();

    // Set up real-time updates
    const channel = supabase
      .channel('admin-driver-locations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
        },
        (payload) => {
          fetchDriverLocations(); // Refresh when new location comes in
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const menuItems = [
    { id: "tracking", label: `Driver Tracking (${driverLocations.length})`, icon: Navigation },
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
            <NotificationCenter userId={user?.id} />
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

          {activeTab === "tracking" && <AdminDriverTrackingMap />}
          {activeTab === "deliveries" && <DeliveriesSection />}
          {activeTab === "payments" && <PaymentsSection />}
          {activeTab === "customers" && <CustomersSection />}
          {activeTab === "products" && <ProductsSection />}
          {activeTab === "exports" && <BulkExportSection />}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
