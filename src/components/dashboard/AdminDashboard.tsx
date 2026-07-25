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
  Clock,
  Menu
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CustomersSection } from "./sections/CustomersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { DeliveriesSection } from "./sections/DeliveriesSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { AdminDriverTrackingMap } from "./sections/AdminDriverTrackingMap";
import { BulkExportSection } from "./sections/BulkExportSection";
import { DriversSection } from "./sections/DriversSection";
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
    { id: "drivers", label: "Drivers", icon: Truck },
    { id: "exports", label: "Exports", icon: Download },
  ];

  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-30">
        <div className="flex h-12 items-center justify-between px-2 md:px-4">
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen((v) => !v)} title="Toggle sidebar">
              <Menu className="w-5 h-5" />
            </Button>
            <img src={kempLogo} alt="KEMP Logo" className="w-7 h-7 object-contain" />
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-primary leading-tight">KEMP Maji Track</h1>
              <Badge variant="secondary" className="bg-tertiary/10 text-tertiary text-[10px] leading-none py-0.5">Admin</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter userId={user?.id} />
            <span className="text-xs text-muted-foreground hidden md:block">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {sidebarOpen && (
          <aside className="w-56 min-h-[calc(100vh-3rem)] border-r bg-card p-2 shrink-0">
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={activeTab === item.id ? "default" : "ghost"}
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>
          </aside>
        )}

        <main className="flex-1 p-2 md:p-3 min-w-0">
          <Alert className="mb-3 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950 py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Admin permissions: You can view and create records. Updates and deletions require Master Admin approval.
            </AlertDescription>
          </Alert>

          {activeTab === "tracking" && <AdminDriverTrackingMap />}
          {activeTab === "deliveries" && <DeliveriesSection />}
          {activeTab === "payments" && <PaymentsSection />}
          {activeTab === "customers" && <CustomersSection />}
          {activeTab === "products" && <ProductsSection />}
          {activeTab === "drivers" && <DriversSection />}
          {activeTab === "exports" && <BulkExportSection />}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
