import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { delivery_id } = await req.json();

    if (!delivery_id) {
      return new Response(
        JSON.stringify({ error: 'delivery_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch delivery and customer details
    const { data: delivery, error: fetchError } = await supabase
      .from('deliveries')
      .select(`
        id,
        total_amount,
        delivery_date,
        payment_link_token,
        customer_id,
        customers!inner (
          customer_name,
          phone,
          user_id
        )
      `)
      .eq('id', delivery_id)
      .single();

    if (fetchError || !delivery) {
      console.error('Delivery not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Delivery not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customer = Array.isArray(delivery.customers) ? delivery.customers[0] : delivery.customers;
    
    if (!customer?.phone) {
      console.error('Customer phone not found for delivery:', delivery_id);
      return new Response(
        JSON.stringify({ error: 'Customer phone not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format phone number for Kenya
    let phoneNumber = customer.phone.trim();
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '+254' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+254' + phoneNumber;
    }

    // Generate payment link
    const paymentLink = `https://lguzfxcefsnmwrfjhzfb.lovable.app/pay?token=${delivery.payment_link_token}`;

    // Format delivery date
    const deliveryDate = new Date(delivery.delivery_date).toLocaleDateString('en-GB');

    // Create message
    const message = `Hi ${customer.customer_name}, your KES ${delivery.total_amount} payment for water delivery on ${deliveryDate} is pending. Pay securely now: ${paymentLink}`;

    console.log('Sending payment reminder:', {
      deliveryId: delivery_id,
      phone: phoneNumber,
      amount: delivery.total_amount
    });

    // Send SMS via Africa's Talking
    const smsResponse = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': Deno.env.get('AFRICASTALKING_API_KEY') ?? '',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        username: Deno.env.get('AFRICASTALKING_USERNAME') ?? '',
        to: phoneNumber,
        message: message
      })
    });

    const smsData = await smsResponse.json();
    console.log('SMS API response:', smsData);

    const success = smsData.SMSMessageData?.Recipients?.[0]?.status === 'Success';

    // Log notification
    await supabase.from('notifications_log').insert({
      user_id: customer.user_id,
      channel: 'sms',
      content: message,
      status: success ? 'delivered' : 'failed',
      provider_ref: smsData.SMSMessageData?.Recipients?.[0]?.messageId
    });

    if (success) {
      // Update delivery reminder status
      await supabase
        .from('deliveries')
        .update({
          payment_reminder_sent: true,
          last_reminder_sent_at: new Date().toISOString()
        })
        .eq('id', delivery_id);
    }

    return new Response(
      JSON.stringify({ 
        success,
        message: success ? 'Payment reminder sent successfully' : 'Failed to send reminder',
        smsData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-payment-reminder:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
