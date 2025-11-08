import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DeliveryData {
  id: string;
  total_amount: number;
  delivery_date: string;
  payment_status: string;
  customers: {
    customer_name: string;
  };
}

const PaymentPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();

  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid payment link');
      setLoading(false);
      return;
    }

    fetchDelivery();
    
    // Poll for payment status updates every 5 seconds
    const interval = setInterval(() => {
      if (delivery?.payment_status !== 'paid') {
        fetchDelivery();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [token]);

  const fetchDelivery = async () => {
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select(`
          id,
          total_amount,
          delivery_date,
          payment_status,
          customers (
            customer_name
          )
        `)
        .eq('payment_link_token', token)
        .single();

      if (error) throw error;
      
      setDelivery(data as DeliveryData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching delivery:', err);
      setError('Invalid or expired payment link');
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('initiate-mpesa-payment', {
        body: { payment_link_token: token }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Payment Request Sent',
          description: 'Please check your phone and enter your M-Pesa PIN to complete the payment.',
        });
      } else {
        throw new Error(data.error || 'Failed to initiate payment');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      toast({
        title: 'Payment Failed',
        description: err.message || 'Failed to initiate payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle>Payment Link Error</CardTitle>
            <CardDescription>{error || 'Invalid payment link'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (delivery.payment_status === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Payment Completed</CardTitle>
            <CardDescription>This delivery has already been paid. Thank you!</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src="/kemp-logo.png" 
            alt="Kemp Water" 
            className="h-16 mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Water Delivery Payment</CardTitle>
          <CardDescription>Secure M-Pesa Payment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{delivery.customers.customer_name}</span>
            </div>
            
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Delivery Date</span>
              <span className="font-medium">
                {new Date(delivery.delivery_date).toLocaleDateString('en-GB')}
              </span>
            </div>
            
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Amount Due</span>
              <span className="text-2xl font-bold text-primary">
                KES {delivery.total_amount.toLocaleString()}
              </span>
            </div>
          </div>

          <Button
            onClick={handlePayment}
            disabled={processing}
            className="w-full h-12 text-lg"
            size="lg"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Sending Request...
              </>
            ) : (
              'Pay with M-Pesa'
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <p>You will receive an M-Pesa prompt on your phone.</p>
            <p>Enter your PIN to complete the payment.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentPage;
