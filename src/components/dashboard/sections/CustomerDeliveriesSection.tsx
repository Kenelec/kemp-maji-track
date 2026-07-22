import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// REMOVE FORM IMPORTS:
// import { PaymentFormDialog } from '../dialogs/PaymentFormDialog';
import { CreditCard, MapPin, Calendar, Package } from 'lucide-react';

interface CustomerDelivery {
  id: string;
  customer_id: string;
  qty: number;
  unit_rate: number;
  total_amount: number;
  delivery_date: string;
  delivery_status: string;
  created_at: string;
  payments: {
    amount: number;
    status: string;
  }[];
}

export const CustomerDeliveriesSection = () => {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<CustomerDelivery[]>([]);
  const [sortField, setSortField] = useState<keyof CustomerDelivery | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);

  const fetchDeliveries = async () => {
    if (!user) return;
    
    setLoading(true);
    
    let query = supabase
      .from('deliveries')
      .select(`
        *,
        payments (amount, status)
      `)
      .eq('customer_id', user.id);

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

  useEffect(() => {
    fetchDeliveries();
  }, [user, sortField, sortOrder]);

  const handleSort = (field: keyof CustomerDelivery) => {
    if (sortField === field) {
      // Toggle sort order if clicking same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Sort by new field in ascending order
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: keyof CustomerDelivery) => {
    if (sortField !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const getPaymentStatus = (delivery: CustomerDelivery) => {
    const totalAmount = delivery.total_amount;
    const paidAmount = delivery.payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;
    
    if (paidAmount >= totalAmount) return 'paid';
    if (paidAmount > 0) return `${paidAmount} pending ${totalAmount - paidAmount}`;
    return 'pending';
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
    return <div className="text-center py-8">Loading your deliveries...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">My Deliveries</h2>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Deliveries</CardTitle>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="font-medium">{delivery.id}</TableCell>
                        <TableCell>{delivery.qty}</TableCell>
                        <TableCell>KES {delivery.total_amount.toLocaleString()}</TableCell>
                        <TableCell>{new Date(delivery.delivery_date).toLocaleDateString()}</TableCell>
                        <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            getPaymentStatus(delivery) === 'paid' ? 'text-green-600 border-green-600' :
                            getPaymentStatus(delivery).includes('pending') ? 'text-yellow-600 border-yellow-600' :
                            'text-red-600 border-red-600'
                          }>
                            {getPaymentStatus(delivery)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {/* REMOVE THE PAYMENT FORM DIALOG */}
                          {/* <PaymentFormDialog delivery={delivery} /> */}
                          <Button size="sm" variant="outline">
                            Pay
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
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries
                      .filter(d => d.delivery_status === 'pending')
                      .map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell>{delivery.qty}</TableCell>
                          <TableCell>KES {delivery.total_amount.toLocaleString()}</TableCell>
                          <TableCell>{new Date(delivery.delivery_date).toLocaleDateString()}</TableCell>
                          <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              getPaymentStatus(delivery) === 'paid' ? 'text-green-600 border-green-600' :
                              getPaymentStatus(delivery).includes('pending') ? 'text-yellow-600 border-yellow-600' :
                              'text-red-600 border-red-600'
                            }>
                              {getPaymentStatus(delivery)}
                            </Badge>
                          </TableCell>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries
                      .filter(d => d.delivery_status === 'delivered')
                      .map((delivery) => (
                        <TableRow key={delivery.id}>
                          <TableCell>{delivery.qty}</TableCell>
                          <TableCell>KES {delivery.total_amount.toLocaleString()}</TableCell>
                          <TableCell>{new Date(delivery.delivery_date).toLocaleDateString()}</TableCell>
                          <TableCell>{getDeliveryStatusBadge(delivery.delivery_status)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              getPaymentStatus(delivery) === 'paid' ? 'text-green-600 border-green-600' :
                              getPaymentStatus(delivery).includes('pending') ? 'text-yellow-600 border-yellow-600' :
                              'text-red-600 border-red-600'
                            }>
                              {getPaymentStatus(delivery)}
                            </Badge>
                          </TableCell>
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
