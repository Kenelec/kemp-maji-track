import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Navigation, 
  MapPin, 
  Clock, 
  Users, 
  Package, 
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Settings
} from 'lucide-react';
import { format } from 'date-fns';

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

interface Delivery {
  id: string;
  customer_id: string;
  delivery_date: string;
  total_amount: number;
  qty: number;
  unit_rate: number;
  delivery_status: string;
  created_at: string;
  customers: {
    customer_name: string;
    area: string | null;
  } | null;
}

interface Payment {
  id: string;
  customer_id: string;
  delivery_id: string;
  amount: number;
  due_date: string;
  payment_method: string;
  status: string;
  created_at: string;
  customers: {
    customer_name: string;
  } | null;
  deliveries: {
    total_amount: number;
  } | null;
}

export function DriverTrackingMap() {
  const { user } = useAuth();
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
    
    // Set up real-time updates for driver locations
    const channel = supabase
      .channel('driver-locations-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
        },
        (payload) => {
          fetchData(); // Refresh when new location comes in
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch driver locations
      const {  locationsData, error: locationsError } = await supabase
        .from('driver_locations')
        .select(`
          *,
          users!inner (name, phone)
        `)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false });

      if (locationsError) throw locationsError;

      // Fetch deliveries
      const {  deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select(`
          *,
          customers (customer_name, area)
        `)
        .order('delivery_date', { ascending: false });

      if (deliveriesError) throw deliveriesError;

      // Fetch payments
      const {  paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          customers (customer_name),
          deliveries (total_amount)
        `)
        .order('created_at', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Get unique drivers with latest location
      const uniqueDrivers = new Map();
      locationsData?.forEach(location => {
        if (!uniqueDrivers.has(location.driver_id) ||
            new Date(location.created_at) > new Date(uniqueDrivers.get(location.driver_id).created_at)) {
          uniqueDrivers.set(location.driver_id, location);
        }
      });

      setDriverLocations(Array.from(uniqueDrivers.values()));
      setDeliveries(deliveriesData || []);
      setPayments(paymentsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const filteredLocations = selectedDriver === 'all' 
    ? driverLocations 
    : driverLocations.filter(loc => loc.driver_id === selectedDriver);

  // Calculate derived payment status per delivery using cumulative sums
  const paymentsByDelivery = new Map<string, Payment[]>();
  payments.forEach(p => {
    const key = p.delivery_id || `no-delivery-${p.id}`;
    const arr = paymentsByDelivery.get(key) || [];
    arr.push(p);
    paymentsByDelivery.set(key, arr);
  });

  const derivedStatusById = new Map<string, string>();
  paymentsByDelivery.forEach((arr) => {
    arr.sort((a, b) => {
      const at = new Date(a.created_at || a.due_date || 0).getTime();
      const bt = new Date(b.created_at || b.due_date || 0).getTime();
      if (at !== bt) return at - bt;
      return String(a.id).localeCompare(String(b.id));
    });
    const deliveryTotal = arr[0]?.deliveries?.total_amount ? Number(arr[0].deliveries.total_amount) : 0;
    let running = 0;
    arr.forEach(p => {
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
      derivedStatusById.set(p.id, label);
    });
  });

  const renderMap = () => {
    if (filteredLocations.length === 0) {
      return (
        <div className="h-96 rounded-lg border bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Navigation className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No active drivers to display</p>
            <p className="text-sm text-muted-foreground mt-1">
              Drivers need to have the app running to send location updates
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-96 rounded-lg border bg-gradient-to-br from-blue-50 to-green-50 relative overflow-hidden">
        {/* Water-themed background with subtle road patterns */}
        <div className="absolute inset-0 opacity-20">
          <div className="grid grid-cols-8 grid-rows-6 h-full w-full">
            {Array.from({ length: 48 }).map((_, i) => (
              <div key={i} className="flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-blue-300"></div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Driver location markers */}
        {filteredLocations.map((location, index) => {
          // Calculate position in grid based on index for visual distribution
          const top = 20 + (index % 4) * 20;
          const left = 20 + (index % 3) * 30;
          
          return (
            <div 
              key={location.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${top}%`, left: `${left}%` }}
            >
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <div className="bg-white rounded-lg shadow-md p-2 mt-1 max-w-xs">
                  <div className="text-xs font-medium">
                    {location.users?.name || 'Unknown Driver'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(location.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p>Loading driver locations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Driver Tracking</h2>
        <p className="text-muted-foreground">Track driver locations and delivery status in real-time</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Drivers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{driverLocations.length}</div>
            <p className="text-xs text-muted-foreground">Currently online</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deliveries.length}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {payments.filter(p => derivedStatusById.get(p.id)?.includes('pending')).length}
            </div>
            <p className="text-xs text-muted-foreground">Outstanding amount</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Delivery Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {deliveries.filter(d => d.delivery_status === 'completed').length}/{deliveries.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {deliveries.length > 0 ? Math.round((deliveries.filter(d => d.delivery_status === 'completed').length / deliveries.length) * 100) : 0}% completed
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5" />
              Driver Locations
            </CardTitle>
            <CardDescription>
              Real-time location of active drivers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderMap()}
            
            {/* Driver List */}
            <div className="mt-4 space-y-3">
              <h3 className="font-medium">Active Drivers ({filteredLocations.length})</h3>
              {filteredLocations.map(location => (
                <div key={location.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Navigation className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {location.users?.name || 'Unknown Driver'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-muted-foreground">
                      {new Date(location.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <Badge variant="secondary" className="mt-1">
                      {location.accuracy ? location.accuracy.toFixed(2) + 'm' : 'Unknown accuracy'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters and Stats */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Driver</label>
                <select 
                  value={selectedDriver} 
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="all">All Drivers</option>
                  {driverLocations.map(loc => (
                    <option key={loc.driver_id} value={loc.driver_id}>
                      {loc.users?.name || 'Unknown Driver'}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <div className="space-y-2">
                  <input 
                    type="date" 
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange({...dateRange, startDate: e.target.value})}
                    className="w-full p-2 border rounded"
                  />
                  <input 
                    type="date" 
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange({...dateRange, endDate: e.target.value})}
                    className="w-full p-2 border rounded"
                  />
                </div>
              </div>
              
              <Button className="w-full bg-gradient-primary">
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Pending</span>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    {deliveries.filter(d => d.delivery_status === 'pending').length}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">In Transit</span>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {deliveries.filter(d => d.delivery_status === 'in_transit').length}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Delivered</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {deliveries.filter(d => d.delivery_status === 'delivered').length}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Cancelled</span>
                  <Badge variant="secondary" className="bg-red-100 text-red-800">
                    {deliveries.filter(d => d.delivery_status === 'cancelled').length}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Deliveries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Recent Deliveries
          </CardTitle>
          <CardDescription>
            Latest delivery activities with driver assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent deliveries
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Customer</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Quantity</th>
                    <th className="text-left py-2">Amount</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.slice(0, 10).map(delivery => (
                    <tr key={delivery.id} className="border-b">
                      <td className="py-2">{delivery.customers?.customer_name || 'Unknown'}</td>
                      <td className="py-2">{format(new Date(delivery.delivery_date), 'MMM dd, yyyy')}</td>
                      <td className="py-2">{delivery.qty} units</td>
                      <td className="py-2">KSh {delivery.total_amount.toLocaleString()}</td>
                      <td className="py-2">
                        <Badge variant="secondary" className={
                          delivery.delivery_status === 'delivered' ? 'bg-green-100 text-green-800' :
                          delivery.delivery_status === 'in_transit' ? 'bg-blue-100 text-blue-800' :
                          delivery.delivery_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }>
                          {delivery.delivery_status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {delivery.assigned_driver_id ? (
                          <Badge variant="outline">
                            <Navigation className="w-3 h-3 mr-1" />
                            Assigned
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Recent Payments
          </CardTitle>
          <CardDescription>
            Latest payment transactions with calculated status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent payments
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Customer</th>
                    <th className="text-left py-2">Amount</th>
                    <th className="text-left py-2">Due Date</th>
                    <th className="text-left py-2">Method</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 10).map(payment => (
                    <tr key={payment.id} className="border-b">
                      <td className="py-2">{payment.customers?.customer_name || 'Unknown'}</td>
                      <td className="py-2">KSh {payment.amount.toLocaleString()}</td>
                      <td className="py-2">{format(new Date(payment.due_date), 'MMM dd, yyyy')}</td>
                      <td className="py-2 capitalize">{payment.payment_method}</td>
                      <td className="py-2">
                        <Badge variant="secondary" className={
                          derivedStatusById.get(payment.id)?.includes('credit') ? 'bg-blue-100 text-blue-800' :
                          derivedStatusById.get(payment.id)?.includes('pending') ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }>
                          {derivedStatusById.get(payment.id) || payment.status}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {payment.delivery_id ? (
                          <Badge variant="outline">
                            <Package className="w-3 h-3 mr-1" />
                            Linked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            No delivery
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
