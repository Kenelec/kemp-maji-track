import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema - UUID format for delivery_id
const requestSchema = z.object({
  delivery_id: z.string().uuid('Invalid delivery ID format'),
});

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate input
    const rawBody = await req.json();
    const validationResult = requestSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.format());
      return new Response(
        JSON.stringify({ error: 'Invalid request parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { delivery_id } = validationResult.data;

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

    // Try WhatsApp first, fallback to SMS
    let notificationChannel = 'whatsapp';
    let notificationSuccess = false;
    let notificationRef = '';

    // Attempt WhatsApp delivery
    console.log('Attempting WhatsApp delivery for payment reminder...');
    const whatsappResponse = await fetch('https://api.africastalking.com/version1/messaging', {
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

    const whatsappData = await whatsappResponse.json();
    console.log('WhatsApp API response:', whatsappData);

    // Check if WhatsApp succeeded
    if (whatsappData.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
      notificationSuccess = true;
      notificationRef = whatsappData.SMSMessageData?.Recipients?.[0]?.messageId;
      console.log('WhatsApp reminder sent successfully');
    } else {
      // Fallback to SMS
      console.log('WhatsApp failed, falling back to SMS...');
      notificationChannel = 'sms';
      
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

      notificationSuccess = smsData.SMSMessageData?.Recipients?.[0]?.status === 'Success';
      notificationRef = smsData.SMSMessageData?.Recipients?.[0]?.messageId;
    }

    // Log notification (WhatsApp or SMS)
    await supabase.from('notifications_log').insert({
      user_id: customer.user_id,
      channel: notificationChannel,
      content: message,
      status: notificationSuccess ? 'delivered' : 'failed',
      provider_ref: notificationRef
    });

    if (notificationSuccess) {
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
        success: notificationSuccess,
        channel: notificationChannel,
        message: notificationSuccess 
          ? `Payment reminder sent successfully via ${notificationChannel}` 
          : 'Failed to send reminder',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-payment-reminder:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
