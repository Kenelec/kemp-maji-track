import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Package, CreditCard, MapPin, BarChart3, TrendingUp, DollarSign } from 'lucide-react';

interface Stats {
  total_customers: number;
  total_deliveries: number;
  pending_deliveries: number;
  total_payments: number;
  pending_payments: number;
  total_revenue: number;
}

export const DashboardSection = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    total_customers: 0,
    total_deliveries: 0,
    pending_deliveries: 0,
    total_payments: 0,
    pending_payments: 0,
    total_revenue: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    
    try {
      // Get stats based on user role (Master Admin vs Admin)
      let baseQuery = '';
      if (user?.role === 'admin') {
        // Get admin's area for filtering
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('area')
          .eq('id', user.id)
          .single();
        
        if (userProfile?.area) {
          baseQuery = `customers.area = '${userProfile.area}'`;
        }
      }

      // Fetch all statistics
      const [customersRes, deliveriesRes, paymentsRes] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact' }),
        supabase.from('deliveries').select('*', { count: 'exact' }),
        supabase.from('payments').select('*', { count: 'exact' })
      ]);

      const [pendingDeliveriesRes, pendingPaymentsRes, revenueRes] = await Promise.all([
        supabase.from('deliveries').select('*', { count: 'exact' }).eq('delivery_status', 'pending'),
        supabase.from('payments').select('*', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('payments').select('amount', { count: 'exact' }).eq('status', 'paid')
      ]);

      setStats({
        total_customers: customersRes.count || 0,
        total_deliveries: deliveriesRes.count || 0,
        pending_deliveries: pendingDeliveriesRes.count || 0,
        total_payments: paymentsRes.count || 0,
        pending_payments: pendingPaymentsRes.count || 0,
        total_revenue: revenueRes.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Dashboard Overview</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_customers}</div>
            <p className="text-xs text-muted-foreground">Registered customers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_deliveries}</div>
            <p className="text-xs text-muted-foreground">Total deliveries made</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Deliveries</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending_deliveries}</div>
            <p className="text-xs text-muted-foreground">Awaiting completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {stats.total_revenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Revenue collected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_payments}</div>
            <p className="text-xs text-muted-foreground">Payment transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending_payments}</div>
            <p className="text-xs text-muted-foreground">Awaiting payment</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
