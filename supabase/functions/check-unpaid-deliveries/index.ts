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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for unpaid deliveries...');

    // Fetch configurable reminder duration from settings
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'payment_reminder_hours')
      .single();

    const reminderHours = settings?.setting_value?.hours || 48; // Default to 48 if not set
    console.log(`Using reminder duration: ${reminderHours} hours`);

    // Calculate the timestamp based on configurable hours
    const reminderThreshold = new Date();
    reminderThreshold.setHours(reminderThreshold.getHours() - reminderHours);

    // Calculate the timestamp for 24 hours ago (for reminder throttling)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Find unpaid deliveries older than configured threshold
    const { data: unpaidDeliveries, error: fetchError } = await supabase
      .from('deliveries')
      .select('id, customer_id, total_amount, delivery_date, payment_reminder_sent, last_reminder_sent_at')
      .eq('payment_status', 'unpaid')
      .lte('delivery_date', reminderThreshold.toISOString().split('T')[0])
      .or(`payment_reminder_sent.is.null,payment_reminder_sent.eq.false,last_reminder_sent_at.lt.${twentyFourHoursAgo.toISOString()}`);

    if (fetchError) {
      console.error('Error fetching unpaid deliveries:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${unpaidDeliveries?.length || 0} unpaid deliveries`);

    if (!unpaidDeliveries || unpaidDeliveries.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No unpaid deliveries found',
          count: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send reminders for each unpaid delivery
    const results = [];
    for (const delivery of unpaidDeliveries) {
      try {
        console.log(`Sending reminder for delivery ${delivery.id}`);
        
        // Call send-payment-reminder function
        const reminderResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-payment-reminder`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ delivery_id: delivery.id })
          }
        );

        const reminderData = await reminderResponse.json();
        
        results.push({
          delivery_id: delivery.id,
          success: reminderData.success,
          message: reminderData.message
        });

      } catch (error) {
        console.error(`Error sending reminder for delivery ${delivery.id}:`, error);
        results.push({
          delivery_id: delivery.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Sent ${successCount}/${results.length} reminders successfully`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Processed ${results.length} deliveries`,
        successCount,
        totalCount: results.length,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-unpaid-deliveries:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
