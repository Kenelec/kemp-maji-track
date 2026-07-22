import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// REMOVE THESE FORM IMPORTS:
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// import { DeliveryForm } from '../forms/DeliveryForm';
import { /*Edit, Plus,*/ MapPin, Calendar, Package, CreditCard } from 'lucide-react'; // Remove unused icons

interface Delivery {
  id: string;
  customer_id: string;
  qty: number;
  unit_rate: number;
  total_amount: number;
  delivery_date: string;
  delivery_status: string;
  created_at: string;
  customers: {
    customer_name: string;
    phone: string;
    area: string;
    address: string;
  };
}

interface Payment {
  id: string;
  delivery_id: string;
  amount: number;
  payment_method: string;
  mpesa_code: string;
  due_date: string;
  status: string;
  created_at: string;
}

export const DeliveriesSection = () => {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sortField, setSortField] = useState<keyof Delivery | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  // REMOVE THIS STATE: const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchDeliveries = async () => {
    setLoading(true);
    
    let query = supabase
      .from('deliveries')
      .select(`
        *,
        customers (customer_name, phone, area, address)
      `);

    // Apply sorting if field is selected
    if (sortField) {
      query = query.order(sortField, { ascending: sortOrder === 'asc' });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching deliveries:', error);
    } else {
      setDeliveries(data || []);
    }
    
    setLoading(false);
  };

  const fetchPayments = async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('*');
    
    if (error) {
      console.error('Error fetching payments:', error);
    } else {
      setPayments(data || []);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    fetchPayments();
  }, [sortField, sortOrder]);

  const handleSort = (field: keyof Delivery) => {
    if (sortField === field) {
      // Toggle sort order if clicking same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new field in ascending order
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: keyof Delivery) => {
    if (sortField !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const getDeliveryStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'delivered':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Delivered</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading deliveries...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Deliveries</h2>
        {/* REMOVE THE ENTIRE DIALOG BUTTON */}
        {/* <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Delivery
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Delivery</DialogTitle>
            </DialogHeader>
            <DeliveryForm onClose={() => setShowCreateDialog(false)} />
          </DialogContent>
        </Dialog> */}
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All Deliveries</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('id')}
                      >
                        ID {getSortIcon('id')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('customers.customer_name')}
                      >
                        Customer {getSortIcon('customers.customer_name')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('qty')}
                      >
                        Qty {getSortIcon('qty')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('unit_rate')}
                      >
                        Unit Rate {getSortIcon('unit_rate')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('total_amount')}
                      >
                        Total {getSortIcon('total_amount')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('delivery_date')}
                      >
                        Date {getSortIcon('delivery_date')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('delivery_status')}
                      >
                        Status {getSortIcon('delivery_status')}
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="font-medium">{delivery.id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{delivery.customers?.customer_name || 'N/A'}</div>
                          <div className="text-sm text-muted-foreground">{delivery.customers?.phone || 'N/A'}</div>
                        </TableCell>
                        <TableCell>{delivery.qty}</TableCell>
                        <TableCell>KES {delivery.unit_rate.toLocaleString()}</TableCell>
                        <TableCell>KES {delivery.total_amount.toLocaleString()}</TableCell>
                        <TableCell>{new Date(delivery.delivery_date).toLocaleDateString()}</TableCell>
                        <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline">
                            {/* <Edit className="w-4 h-4 mr-2" /> */}
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('customers.customer_name')}
                      >
                        Customer {getSortIcon('customers.customer_name')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('qty')}
                      >
                        Qty {getSortIcon('qty')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('total_amount')}
                      >
                        Total {getSortIcon('total_amount')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('delivery_date')}
                      >
                        Date {getSortIcon('delivery_date')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('delivery_status')}
                      >
                        Status {getSortIcon('delivery_status')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries
                      .filter(d => d.delivery_status === 'pending')
                      .map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell>
                            <div className="font-medium">{delivery.customers?.customer_name || 'N/A'}</div>
                            <div className="text-sm text-muted-foreground">{delivery.customers?.phone || 'N/A'}</div>
                          </TableCell>
                          <TableCell>{delivery.qty}</TableCell>
                          <TableCell>KES {delivery.total_amount.toLocaleString()}</TableCell>
                          <TableCell>{new Date(delivery.delivery_date).toLocaleDateString()}</TableCell>
                          <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="delivered" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Delivered Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('customers.customer_name')}
                      >
                        Customer {getSortIcon('customers.customer_name')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('qty')}
                      >
                        Qty {getSortIcon('qty')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('total_amount')}
                      >
                        Total {getSortIcon('total_amount')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('delivery_date')}
                      >
                        Date {getSortIcon('delivery_date')}
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('delivery_status')}
                      >
                        Status {getSortIcon('delivery_status')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries
                      .filter(d => d.delivery_status === 'delivered')
                      .map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell>
                            <div className="font-medium">{delivery.customers?.customer_name || 'N/A'}</div>
                            <div className="text-sm text-muted-foreground">{delivery.customers?.phone || 'N/A'}</div>
                          </TableCell>
                          <TableCell>{delivery.qty}</TableCell>
                          <TableCell>KES {delivery.total_amount.toLocaleString()}</TableCell>
                          <TableCell>{new Date(delivery.delivery_date).toLocaleDateString()}</TableCell>
                          <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
