import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const usePaymentNotifications = (userId: string | undefined) => {
  useEffect(() => {
    if (!userId) return;

    console.log('Setting up payment notifications for user:', userId);

    // Subscribe to ALL deliveries table updates and filter in handler
    // This catches both 'paid' and 'partial' payment statuses
    const channel = supabase
      .channel('payment-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
        },
        async (payload) => {
          const newPaymentStatus = (payload.new as any).payment_status;
          const oldPaymentStatus = (payload.old as any)?.payment_status;
          
          // Only notify if payment status changed to 'paid' or 'partial'
          if ((newPaymentStatus === 'paid' && oldPaymentStatus !== 'paid') ||
              (newPaymentStatus === 'partial' && oldPaymentStatus !== 'partial')) {
            
            console.log('Payment update received:', payload);

            // Fetch customer details for the notification
            const { data: delivery } = await supabase
              .from('deliveries')
              .select(`
                customer_id,
                total_amount,
                mpesa_transaction_id,
                customers!inner (
                  customer_name
                )
              `)
              .eq('id', (payload.new as any).id)
              .single();

            if (delivery) {
              const customer = Array.isArray(delivery.customers) 
                ? delivery.customers[0] 
                : delivery.customers;

              const paymentType = newPaymentStatus === 'partial' ? 'submitted M-Pesa payment' : 'paid';
              
              toast({
                title: "💰 Payment Received!",
                description: `${customer.customer_name} ${paymentType} KES ${delivery.total_amount}${delivery.mpesa_transaction_id ? ` (Ref: ${delivery.mpesa_transaction_id})` : ''}`,
                duration: 10000,
              });

              // Optional: Play notification sound
              try {
                const audio = new Audio('/notification-sound.mp3');
                audio.volume = 0.5;
                await audio.play();
              } catch (error) {
                // Ignore audio errors (browser autoplay policy, missing file, etc.)
                console.log('Could not play notification sound:', error);
              }
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up payment notifications');
      supabase.removeChannel(channel);
    };
  }, [userId]);
};
