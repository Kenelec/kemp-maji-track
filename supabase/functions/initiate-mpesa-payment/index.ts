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
    const { payment_link_token } = await req.json();

    if (!payment_link_token) {
      return new Response(
        JSON.stringify({ error: 'Payment link token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Fetch delivery details
    const { data: delivery, error: fetchError } = await supabase
      .from('deliveries')
      .select(`
        id,
        total_amount,
        payment_link_token,
        customer_id,
        customers!inner (
          customer_name,
          phone
        )
      `)
      .eq('payment_link_token', payment_link_token)
      .single();

    if (fetchError || !delivery) {
      console.error('Delivery not found:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Invalid payment link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const customer = Array.isArray(delivery.customers) ? delivery.customers[0] : delivery.customers;
    
    if (!customer?.phone) {
      return new Response(
        JSON.stringify({ error: 'Customer phone number not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format phone number for Kenya (ensure +254 format)
    let phoneNumber = customer.phone.trim();
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '+254' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+254' + phoneNumber;
    }

    console.log('Initiating M-Pesa payment:', {
      deliveryId: delivery.id,
      amount: delivery.total_amount,
      phone: phoneNumber
    });

    // Call Africa's Talking Mobile Checkout API
    const checkoutResponse = await fetch('https://payments.africastalking.com/mobile/checkout/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': Deno.env.get('AFRICASTALKING_API_KEY') ?? '',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username: Deno.env.get('AFRICASTALKING_USERNAME') ?? '',
        productName: 'Kemp Water Delivery',
        phoneNumber: phoneNumber,
        currencyCode: 'KES',
        amount: parseFloat(delivery.total_amount),
        metadata: {
          delivery_id: delivery.id,
          payment_link_token: payment_link_token
        }
      })
    });

    const checkoutData = await checkoutResponse.json();

    if (!checkoutResponse.ok) {
      console.error('Africa\'s Talking error:', checkoutData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to initiate M-Pesa payment',
          details: checkoutData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('M-Pesa STK Push initiated:', checkoutData);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Payment request sent to your phone',
        transactionId: checkoutData.transactionId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in initiate-mpesa-payment:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
