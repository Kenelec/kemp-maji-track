import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema for Africa's Talking callback
const callbackSchema = z.object({
  status: z.enum(['Success', 'Failed']),
  phoneNumber: z.string().optional(),
  amount: z.string().optional(),
  transactionId: z.string().optional(),
  requestMetadata: z.object({
    delivery_id: z.string().uuid('Invalid delivery ID format'),
    payment_link_token: z.string().optional(),
  }),
});

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

    // Parse and validate callback
    const rawBody = await req.json();
    const validationResult = callbackSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      console.error('Callback validation failed:', validationResult.error.format());
      return new Response(
        JSON.stringify({ error: 'Invalid callback data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callback = validationResult.data;
    
    console.log('Received M-Pesa callback:', {
      status: callback.status,
      transactionId: callback.transactionId,
      deliveryId: callback.requestMetadata.delivery_id
    });

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
        return new Response(
          JSON.stringify({ error: 'Failed to process callback' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
        return new Response(
          JSON.stringify({ error: 'Failed to process callback' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

      // Create in-app notification for all admins
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .in('role_id', (await supabase.from('user_roles').select('id').in('name', ['Admin', 'MasterAdmin'])).data?.map(r => r.id) || []);

      if (admins && admins.length > 0) {
        await supabase.from('in_app_notifications').insert(
          admins.map(admin => ({
            user_id: admin.id,
            type: 'payment_received',
            title: 'Payment Received!',
            message: `${customer.customer_name} paid KES ${delivery.total_amount} via M-Pesa (Ref: ${callback.transactionId})`,
            metadata: {
              customer_id: delivery.customer_id,
              delivery_id: deliveryId,
              amount: delivery.total_amount,
              transaction_id: callback.transactionId,
            },
          }))
        );
      }

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
      JSON.stringify({ error: 'An error occurred processing callback' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
