const kempLogo = "/kemp-logo.png";
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
  Clock
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CustomersSection } from "./sections/CustomersSection";
import { ProductsSection } from "./sections/ProductsSection";
import { DeliveriesSection } from "./sections/DeliveriesSection";
import { PaymentsSection } from "./sections/PaymentsSection";
import { DashboardSection } from "./sections/DashboardSection";
import { SystemSettingsSection } from "./sections/SystemSettingsSection";
import { usePaymentNotifications } from "@/hooks/usePaymentNotifications";

interface ApprovalRequest {
  id: string;
  requested_by: string;
  admin_notes: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  request_type: string;
  target_id: string;
  target_table: string;
  original_data: any;
  requested_changes: any;
  created_at: string;
  updated_at: string;
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
  admin_resolution_notes: string | null;
  master_admin_approved: boolean | null;
  master_admin_approved_by: string | null;
  master_admin_approved_at: string | null;
  admin_resolved_by: string | null;
  admin_resolved_at: string | null;
  requires_approval: boolean | null;
  approval_request_id: string | null;
  created_at: string;
}

interface MasterAdminDashboardProps {
  onLogout: () => void;
}

const MasterAdminDashboard = ({ onLogout }: MasterAdminDashboardProps) => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [deliveryQueries, setDeliveryQueries] = useState<DeliveryQuery[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Enable real-time payment notifications
  usePaymentNotifications(user?.id);

  const handleLogout = async () => {
    await signOut();
    onLogout();
  };

  const fetchApprovalData = async () => {
    try {
      setLoading(true);

      // Fetch admin approval requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('admin_approval_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Fetch delivery queries
      const { data: queriesData, error: queriesError } = await supabase
        .from('delivery_queries')
        .select('*')
        .order('created_at', { ascending: false });

      if (queriesError) throw queriesError;

      setApprovalRequests(requestsData || []);
      setDeliveryQueries(queriesData || []);
    } catch (error) {
      console.error('Error fetching approval data', error);
    } finally {
      setLoading(false);
    }
  };

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
        // Update the delivery query status
        const { error: updateError } = await supabase
          .from('delivery_queries')
          .update({
            status: 'resolved',
            master_admin_approved: true,
            master_admin_approved_by: user?.id,
            master_admin_approved_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) throw updateError;
      }

      fetchApprovalData(); // Refresh the data
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
        const { error: updateError } = await supabase
          .from('delivery_queries')
          .update({
            status: 'rejected',
            master_admin_approved: false,
            master_admin_approved_by: user?.id,
            master_admin_approved_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) throw updateError;
      }

      fetchApprovalData(); // Refresh the data
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  useEffect(() => {
    fetchApprovalData();
  }, []);

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: Users },
    { id: "approvals", label: `Approvals (${approvalRequests.filter(r => r.status === 'pending').length + deliveryQueries.filter(q => q.status === 'open').length})`, icon: AlertTriangle },
    { id: "deliveries", label: "Deliveries", icon: Truck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "customers", label: "Customers", icon: Users },
    { id: "products", label: "Products", icon: Package },
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
                                {getRequestIcon(request.request_type)}
                                <div>
                                  <h3 className="font-medium">
                                    {request.request_type.replace('_', ' ')} Request
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    From: {request.requested_by}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Target: {request.target_table} - ID: {request.target_id}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {getStatusBadge(request.status)}
                              </div>
                            </div>
                            {request.admin_notes && (
                              <div className="mt-2 p-2 bg-muted rounded text-sm">
                                <strong>Notes:</strong> {request.admin_notes}
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
                                    requested_changes: request.requested_changes
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
                        {deliveryQueries.filter(q => q.status === 'open').map((query) => (
                          <Card key={query.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center space-x-3">
                                <MessageCircle className="w-4 h-4 text-blue-600" />
                                <div>
                                  <h3 className="font-medium">
                                    Query: {query.query_type}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    From: Customer ID {query.customer_id}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Delivery ID: {query.delivery_id}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {query.status === 'open' ? (
                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                    <Clock className="w-3 h-3 mr-1" /> Open
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
                              {query.admin_resolution_notes && (
                                <p className="text-sm mt-1"><strong>Admin Notes:</strong> {query.admin_resolution_notes}</p>
                              )}
                              {query.resolution_note && (
                                <p className="text-sm mt-1"><strong>Resolution:</strong> {query.resolution_note}</p>
                              )}
                            </div>
                            {query.status === 'open' && (
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
        return <DashboardSection />;
      case "deliveries":
        return <DeliveriesSection />;
      case "payments":
        return <PaymentsSection />;
      case "customers":
        return <CustomersSection />;
      case "products":
        return <ProductsSection />;
      case "settings":
        return <SystemSettingsSection />;
      case "exports":
        return (
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

                      // Build derived status per payment using cumulative sums per delivery
                      const byDelivery = new Map<string, any[]>();
                      data.forEach((p: any) => {
                        const key = p.delivery_id || `no-delivery-${p.id}`;
                        const arr = byDelivery.get(key) || [];
                        arr.push(p);
                        byDelivery.set(key, arr);
                      });

                      const statusById = new Map<string, string>();
                      byDelivery.forEach((arr) => {
                        arr.sort((a: any, b: any) => {
                          const at = new Date(a.created_at || a.due_date || 0).getTime();
                          const bt = new Date(b.created_at || b.due_date || 0).getTime();
                          if (at !== bt) return at - bt;
                          return String(a.id).localeCompare(String(b.id));
                        });
                        const deliveryTotal = arr[0]?.deliveries?.total_amount ? Number(arr[0].deliveries.total_amount) : 0;
                        let running = 0;
                        arr.forEach((p: any) => {
                          running += Number(p.amount || 0);
                          const diff = running - deliveryTotal;
                          let label: string;
                          if (deliveryTotal === 0) {
                            label = p.status;
                          } else if (diff > 0) {
                            label = `${Math.abs(diff)} credit`;
                          } else if (diff < 0) {
                            label = `${Math.abs(diff)} pending`;
                          } else {
                            label = "paid";
                          }
                          statusById.set(p.id, label);
                        });
                      });

                      const rows = data.map((p: any) => [
                        p.customers?.customer_name || "",
                        Number(p.amount || 0),
                        p.due_date,
                        p.payment_method,
                        p.mpesa_code || "",
                        statusById.get(p.id) || p.status,
                      ]);

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
        );
      default:
        return <DashboardSection />;
    }
  };

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
                Master Admin
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
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default MasterAdminDashboard;
