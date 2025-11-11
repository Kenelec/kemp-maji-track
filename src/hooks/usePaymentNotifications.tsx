import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const usePaymentNotifications = (userId: string | undefined) => {
  useEffect(() => {
    if (!userId) return;

    console.log('Setting up payment notifications for user:', userId);

    // Subscribe to deliveries table changes where payment_status becomes 'paid'
    const channel = supabase
      .channel('payment-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
          filter: `payment_status=eq.paid`
        },
        async (payload) => {
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
            .eq('id', payload.new.id)
            .single();

          if (delivery) {
            const customer = Array.isArray(delivery.customers) 
              ? delivery.customers[0] 
              : delivery.customers;

            toast({
              title: "💰 Payment Received!",
              description: `${customer.customer_name} paid KES ${delivery.total_amount} via M-Pesa${delivery.mpesa_transaction_id ? ` (Ref: ${delivery.mpesa_transaction_id})` : ''}`,
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
