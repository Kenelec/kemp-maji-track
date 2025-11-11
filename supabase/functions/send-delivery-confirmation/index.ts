import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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

    // Fetch delivery with items and customer details
    const { data: delivery, error: fetchError } = await supabase
      .from('deliveries')
      .select(`
        id,
        delivery_date,
        total_amount,
        qty,
        unit_rate,
        delivery_note_no,
        payment_link_token,
        customer_id,
        customers!inner (
          customer_name,
          phone,
          email,
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
    
    if (!customer?.phone && !customer?.email) {
      console.error('Customer has no phone or email:', delivery_id);
      return new Response(
        JSON.stringify({ error: 'Customer has no contact information' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format delivery details
    const deliveryDate = new Date(delivery.delivery_date).toLocaleDateString('en-GB');
    const queryLink = `https://lguzfxcefsnmwrfjhzfb.lovable.app/query?token=${delivery.payment_link_token}`;
    
    // Create message content
    const itemsText = `${delivery.qty} units @ KES ${delivery.unit_rate} each`;
    
    const smsMessage = `Hi ${customer.customer_name}, your water delivery: ${itemsText} = KES ${delivery.total_amount} on ${deliveryDate}. DN#${delivery.delivery_note_no || 'N/A'}. Issues? ${queryLink}`;
    
    const emailHtml = `
      <h2>Delivery Confirmation</h2>
      <p>Dear ${customer.customer_name},</p>
      <p>Your water delivery has been logged:</p>
      <ul>
        <li><strong>Date:</strong> ${deliveryDate}</li>
        <li><strong>Quantity:</strong> ${delivery.qty} units</li>
        <li><strong>Unit Rate:</strong> KES ${delivery.unit_rate}</li>
        <li><strong>Total Amount:</strong> KES ${delivery.total_amount}</li>
        <li><strong>Delivery Note:</strong> ${delivery.delivery_note_no || 'N/A'}</li>
      </ul>
      <p>If you did not receive these items or there are any discrepancies, please <a href="${queryLink}">click here to raise a query</a>.</p>
      <p>Thank you for your business!</p>
    `;

    const results = {
      sms: null as any,
      email: null as any
    };

    // Send notification via WhatsApp first, fallback to SMS
    if (customer.phone) {
      let phoneNumber = customer.phone.trim();
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '+254' + phoneNumber.substring(1);
      } else if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+254' + phoneNumber;
      }

      let notificationChannel = 'whatsapp';
      let notificationSuccess = false;
      let notificationRef = '';

      try {
        // Try WhatsApp first
        console.log('Attempting WhatsApp delivery confirmation...');
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
            message: smsMessage
          })
        });

        const whatsappData = await whatsappResponse.json();
        console.log('WhatsApp API response:', whatsappData);

        // Check if WhatsApp succeeded
        if (whatsappData.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
          notificationSuccess = true;
          notificationRef = whatsappData.SMSMessageData?.Recipients?.[0]?.messageId;
          results.sms = whatsappData;
          console.log('WhatsApp delivery confirmation sent successfully');
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
              message: smsMessage
            })
          });

          const smsData = await smsResponse.json();
          console.log('SMS API response:', smsData);

          notificationSuccess = smsData.SMSMessageData?.Recipients?.[0]?.status === 'Success';
          notificationRef = smsData.SMSMessageData?.Recipients?.[0]?.messageId;
          results.sms = smsData;
        }

        // Log notification (WhatsApp or SMS)
        await supabase.from('notifications_log').insert({
          user_id: customer.user_id,
          channel: notificationChannel,
          content: smsMessage,
          status: notificationSuccess ? 'delivered' : 'failed',
          provider_ref: notificationRef
        });
      } catch (error) {
        console.error('Notification error:', error);
        results.sms = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    // Send Email if email available
    if (customer.email) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`
          },
          body: JSON.stringify({
            from: 'Kemp Water <onboarding@resend.dev>',
            to: [customer.email],
            subject: `Delivery Confirmation - ${deliveryDate}`,
            html: emailHtml
          })
        });

        const emailData = await emailResponse.json();
        results.email = emailData;
        console.log('Email sent:', results.email);

        // Log Email notification
        await supabase.from('notifications_log').insert({
          user_id: customer.user_id,
          channel: 'email',
          content: emailHtml,
          status: emailResponse.ok ? 'delivered' : 'failed',
          provider_ref: emailData.id
        });
      } catch (error) {
        console.error('Email error:', error);
        results.email = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Delivery confirmation sent',
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-delivery-confirmation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});