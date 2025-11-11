import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AfricasTalkingCallback {
  status: 'Success' | 'Failed';
  phoneNumber: string;
  amount: string;
  transactionId: string;
  requestMetadata: {
    delivery_id: string;
    payment_link_token: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const callback: AfricasTalkingCallback = await req.json();
    
    console.log('Received M-Pesa callback:', {
      status: callback.status,
      transactionId: callback.transactionId,
      deliveryId: callback.requestMetadata?.delivery_id
    });

    if (!callback.requestMetadata?.delivery_id) {
      console.error('Missing delivery_id in callback metadata');
      return new Response(
        JSON.stringify({ error: 'Missing delivery_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const deliveryId = callback.requestMetadata.delivery_id;

    if (callback.status === 'Success') {
      // Fetch delivery with customer details first
      const { data: delivery, error: fetchError } = await supabase
        .from('deliveries')
        .select('customer_id, total_amount, customers!inner(user_id, customer_name)')
        .eq('id', deliveryId)
        .single();

      if (fetchError) {
        console.error('Error fetching delivery:', fetchError);
        throw fetchError;
      }

      const customer = Array.isArray(delivery.customers) ? delivery.customers[0] : delivery.customers;

      // Update delivery to paid status
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({
          payment_status: 'paid',
          mpesa_transaction_id: callback.transactionId,
          payment_date: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (updateError) {
        console.error('Error updating delivery:', updateError);
        throw updateError;
      }

      console.log(`Delivery ${deliveryId} marked as paid with transaction ${callback.transactionId}`);

      // Log successful payment notification with customer details
      await supabase.from('notifications_log').insert({
        user_id: customer.user_id,
        channel: 'mpesa',
        content: `Payment received: KES ${delivery.total_amount} from ${customer.customer_name} - Transaction: ${callback.transactionId}`,
        status: 'delivered',
        provider_ref: callback.transactionId
      });

    } else if (callback.status === 'Failed') {
      console.log(`Payment failed for delivery ${deliveryId}`);
      
      // Log failed payment attempt
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('customer_id, customers!inner(user_id)')
        .eq('id', deliveryId)
        .single();

      if (delivery) {
        const customer = Array.isArray(delivery.customers) ? delivery.customers[0] : delivery.customers;
        await supabase.from('notifications_log').insert({
          user_id: customer.user_id,
          channel: 'mpesa',
          content: 'Payment failed. Please try again.',
          status: 'failed'
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Callback processed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in mpesa-webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
