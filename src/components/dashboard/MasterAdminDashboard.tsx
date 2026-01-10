import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  LogOut, 
  Truck, 
  CreditCard, 
  Users, 
  Package, 
  Download,
  Settings,
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Navigation,
  MapPin
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CustomersSection } from "./sections/CustomersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { DeliveriesSection } from "./sections/DeliveriesSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { DashboardSection } from "./sections/DashboardSection";
import { SystemSettingsSection } from "./sections/SystemSettingsSection";
import { DriverTrackingMap } from "./sections/DriverTrackingMap";
import { BulkExportSection } from "./sections/BulkExportSection";
import { DriversSection } from "./sections/DriversSection";
import { usePaymentNotifications } from "@/hooks/usePaymentNotifications";
import { NotificationCenter } from "./NotificationCenter";

interface ApprovalRequest {
  id: string;
  admin_user_id: string;
  status: string | null;
  acted_by: string | null;
  acted_at: string | null;
  requested_action: string;
  target_id: string;
  target_table: string;
  payload: any;
  requested_at: string | null;
}

interface DeliveryQuery {
  id: string;
  customer_id: string;
  delivery_id: string;
  message: string;
  query_type: string;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  status: string;
  requires_approval: boolean | null;
  approval_request_id: string | null;
  created_at: string | null;
  customers?: {
    customer_name: string;
    email: string | null;
    phone: string | null;
    user_id: string | null;
  } | null;
  deliveries?: {
    delivery_date: string;
    total_amount: number;
  } | null;
}

interface DriverLocation {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number | null;
  created_at: string;
  driver_name?: string;
  driver_phone?: string | null;
}

interface MasterAdminDashboardProps {
  onLogout: () => void;
}

const MasterAdminDashboard = ({ onLogout }: MasterAdminDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [deliveryQueries, setDeliveryQueries] = useState<DeliveryQuery[]>([]);
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Enable real-time payment notifications
  usePaymentNotifications(user?.id);

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch admin approval requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('admin_approval_requests')
        .select('*')
        .order('requested_at', { ascending: false });

      if (requestsError) {
        console.error('Error fetching approval requests:', requestsError);
      }

      // Fetch delivery queries with customer and delivery info
      const { data: queriesData, error: queriesError } = await supabase
        .from('delivery_queries')
        .select(`
          *,
          customers (customer_name, email, phone, user_id),
          deliveries (delivery_date, total_amount)
        `)
        .order('created_at', { ascending: false });

      if (queriesError) {
        console.error('Error fetching delivery queries:', queriesError);
      }

      // Set data even if some fetches failed
      setApprovalRequests(requestsData || []);
      setDeliveryQueries(queriesData || []);

      // Fetch driver locations SEPARATELY to prevent breaking the whole fetch
      try {
        const { data: locationsData, error: locationsError } = await supabase
          .from('driver_locations')
          .select('*')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false });

        if (!locationsError && locationsData) {
          // Get driver names from drivers table separately
          const driverIds = [...new Set(locationsData.map(l => l.driver_id))];
          const { data: driversData } = await supabase
            .from('drivers')
            .select('id, name, phone')
            .in('id', driverIds);
          
          // Map driver info to locations
          const driversMap = new Map(driversData?.map(d => [d.id, d]) || []);
          const locationsWithDriverInfo = locationsData.map(loc => ({
            ...loc,
            driver_name: driversMap.get(loc.driver_id)?.name || 'Unknown',
            driver_phone: driversMap.get(loc.driver_id)?.phone || null
          }));

          // Get unique drivers with latest location
          const uniqueDrivers = new Map();
          locationsWithDriverInfo.forEach(location => {
            if (!uniqueDrivers.has(location.driver_id) ||
                new Date(location.created_at!) > new Date(uniqueDrivers.get(location.driver_id).created_at)) {
              uniqueDrivers.set(location.driver_id, location);
            }
          });
          setDriverLocations(Array.from(uniqueDrivers.values()));
        }
      } catch (locError) {
        console.error('Error fetching driver locations (non-critical):', locError);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Set up real-time updates for driver locations and delivery queries
    const channel = supabase
      .channel('master-admin-dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
        },
        () => {
          fetchDashboardData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_queries',
        },
        () => {
          console.log('Delivery query change detected, refreshing...');
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const approveRequest = async (requestId: string, table: string, id: string, changes: any) => {
    try {
      if (table === 'admin_approval_requests') {
        // Update the approval request status
        const { error: updateError } = await supabase
          .from('admin_approval_requests')
          .update({
            status: 'approved',
            approved_by: user?.id,
            approved_at: new Date().toISOString()
          })
          .eq('id', requestId);

        if (updateError) throw updateError;

        // If this is for an edit request, apply the changes to the target table
        if (changes) {
          const { error: targetError } = await supabase
            .from(changes.target_table)
            .update(changes.requested_changes)
            .eq('id', changes.target_id);

          if (targetError) throw targetError;
        }
      } else if (table === 'delivery_queries') {
        // First get the query with customer info
        const { data: queryData } = await supabase
          .from('delivery_queries')
          .select('customer_id, query_type, customers(user_id, customer_name)')
          .eq('id', id)
          .single();

        // Update the delivery query status
        const { error: updateError } = await supabase
          .from('delivery_queries')
          .update({
            status: 'resolved',
            resolved_by: user?.id,
            resolved_at: new Date().toISOString(),
            resolution_note: 'Approved by Master Admin'
          })
          .eq('id', id);

        if (updateError) throw updateError;

        // Send notification to customer
        if (queryData?.customers?.user_id) {
          await supabase.from('in_app_notifications').insert({
            user_id: queryData.customers.user_id,
            type: 'query_resolved',
            title: 'Query Resolved',
            message: `Your ${queryData.query_type.replace('_', ' ')} query has been resolved.`,
            metadata: { delivery_query_id: id }
          });
        }
      }

      fetchDashboardData(); // Refresh the data
    } catch (error) {
      console.error('Error approving request:', error);
    }
  };

  const rejectRequest = async (requestId: string, table: string, id: string, rejectionReason: string) => {
    try {
      if (table === 'admin_approval_requests') {
        const { error: updateError } = await supabase
          .from('admin_approval_requests')
          .update({
            status: 'rejected',
            rejected_by: user?.id,
            rejected_at: new Date().toISOString(),
            rejection_reason: rejectionReason
          })
          .eq('id', requestId);

        if (updateError) throw updateError;
      } else if (table === 'delivery_queries') {
        // First get the query with customer info
        const { data: queryData } = await supabase
          .from('delivery_queries')
          .select('customer_id, query_type, customers(user_id, customer_name)')
          .eq('id', id)
          .single();

        const { error: updateError } = await supabase
          .from('delivery_queries')
          .update({
            status: 'rejected',
            resolved_by: user?.id,
            resolved_at: new Date().toISOString(),
            resolution_note: rejectionReason || 'Rejected by Master Admin'
          })
          .eq('id', id);

        if (updateError) throw updateError;

        // Send notification to customer
        if (queryData?.customers?.user_id) {
          await supabase.from('in_app_notifications').insert({
            user_id: queryData.customers.user_id,
            type: 'query_rejected',
            title: 'Query Rejected',
            message: `Your ${queryData.query_type.replace('_', ' ')} query was rejected: ${rejectionReason || 'No reason provided'}`,
            metadata: { delivery_query_id: id }
          });
        }
      }

      fetchDashboardData(); // Refresh the data
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: Users },
    { id: "tracking", label: `Driver Tracking (${driverLocations.length})`, icon: Navigation },
    { id: "approvals", label: `Approvals (${approvalRequests.filter(r => r.status === 'pending').length + deliveryQueries.filter(q => q.status === 'pending' || q.status === 'open').length})`, icon: AlertTriangle },
    { id: "deliveries", label: "Deliveries", icon: Truck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "customers", label: "Customers", icon: Users },
    { id: "products", label: "Products", icon: Package },
    { id: "drivers", label: "Drivers", icon: Truck },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "exports", label: "Exports", icon: Download },
  ];

  const getRequestIcon = (requestType: string) => {
    switch (requestType) {
      case 'delivery_edit':
      case 'delivery_delete':
        return <Truck className="w-4 h-4" />;
      case 'payment_edit':
      case 'payment_delete':
        return <CreditCard className="w-4 h-4" />;
      case 'customer_edit':
      case 'customer_delete':
        return <Users className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getRequestBadge = (requestType: string) => {
    switch (requestType) {
      case 'delivery_edit':
      case 'delivery_delete':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Delivery</Badge>;
      case 'payment_edit':
      case 'payment_delete':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Payment</Badge>;
      case 'customer_edit':
      case 'customer_delete':
        return <Badge variant="secondary" className="bg-purple-100 text-purple-800">Customer</Badge>;
      default:
        return <Badge variant="secondary">{requestType.replace('_', ' ')}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "tracking":
        return <DriverTrackingMap />;
      case "approvals":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Approval Dashboard</h2>
              <p className="text-muted-foreground">Review and approve requests from Admins and Customers</p>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Loading approval requests...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Admin Approval Requests */}
                <Card>
                  <CardHeader>
                    <CardTitle>Admin Approval Requests</CardTitle>
                    <CardDescription>
                      Requests from Admin users requiring your approval
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {approvalRequests.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No pending admin approval requests
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {approvalRequests.filter(r => r.status === 'pending').map((request) => (
                          <Card key={request.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center space-x-3">
                                {getRequestIcon(request.requested_action)}
                                <div>
                                  <h3 className="font-medium">
                                    {request.requested_action.replace('_', ' ')} Request
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    From: Admin {request.admin_user_id?.slice(0, 8)}...
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Target: {request.target_table} - ID: {request.target_id}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {getStatusBadge(request.status || 'pending')}
                              </div>
                            </div>
                            {request.payload && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <strong>Changes:</strong> {JSON.stringify(request.payload, null, 2)}
                              </div>
                            )}
                            {request.status === 'pending' && (
                              <div className="flex space-x-2 mt-3">
                                <Button 
                                  size="sm" 
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => approveRequest(request.id, 'admin_approval_requests', request.id, {
                                    target_table: request.target_table,
                                    target_id: request.target_id,
                                    requested_changes: request.payload
                                  })}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => rejectRequest(request.id, 'admin_approval_requests', request.id, 'Not approved')}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Customer Queries */}
                <Card>
                  <CardHeader>
                    <CardTitle>Customer Queries & Discrepancies</CardTitle>
                    <CardDescription>
                      Queries raised by customers requiring your attention
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {deliveryQueries.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No pending customer queries
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {deliveryQueries.filter(q => q.status === 'pending' || q.status === 'open').map((query) => (
                          <Card key={query.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center space-x-3">
                                <MessageCircle className="w-4 h-4 text-blue-600" />
                                <div>
                                  <h3 className="font-medium">
                                    Query: {query.query_type.replace('_', ' ')}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    From: {query.customers?.customer_name || `Customer ID ${query.customer_id.slice(0, 8)}...`}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Delivery: {query.deliveries?.delivery_date ? new Date(query.deliveries.delivery_date).toLocaleDateString() : query.delivery_id.slice(0, 8) + '...'} 
                                    {query.deliveries?.total_amount && ` - KSh ${query.deliveries.total_amount.toLocaleString()}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                              {query.status === 'pending' || query.status === 'open' ? (
                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                    <Clock className="w-3 h-3 mr-1" /> Pending
                                  </Badge>
                                ) : query.status === 'resolved' ? (
                                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Resolved
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-red-100 text-red-800">
                                    <XCircle className="w-3 h-3 mr-1" /> Rejected
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="mt-2">
                              <p className="text-sm"><strong>Message:</strong> {query.message}</p>
                              {query.resolution_note && (
                                <p className="text-sm mt-1"><strong>Resolution:</strong> {query.resolution_note}</p>
                              )}
                            </div>
                            {(query.status === 'pending' || query.status === 'open') && (
                              <div className="flex space-x-2 mt-3">
                                <Button 
                                  size="sm" 
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => approveRequest(query.id, 'delivery_queries', query.id, null)}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-1" />
                                  Resolve
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => rejectRequest(query.id, 'delivery_queries', query.id, 'Query rejected')}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        );
      case "dashboard":
        return <DashboardSection onNavigateToTab={setActiveTab} />;
      case "deliveries":
        return <DeliveriesSection />;
      case "payments":
        return <PaymentsSection />;
      case "customers":
        return <CustomersSection />;
      case "products":
        return <ProductsSection />;
      case "drivers":
        return <DriversSection />;
      case "settings":
        return <SystemSettingsSection />;
      case "exports":
        return <BulkExportSection />;
      default:
        return <DashboardSection onNavigateToTab={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center space-x-3">
            <img 
              src="/kemp-logo.png" 
              alt="KEMP Logo" 
              className="w-8 h-8 md:w-10 md:h-10 object-contain"
            />
            <div>
              <h1 className="text-lg md:text-xl font-bold text-primary">KEMP Maji Track</h1>
              <Badge variant="secondary" className="bg-tertiary/10 text-tertiary text-xs md:text-sm ml-0">
                Master Admin
              </Badge>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationCenter userId={user?.id} onNavigateToApprovals={() => setActiveTab('approvals')} />
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
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default MasterAdminDashboard;
