import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const requestSchema = z.object({
  payment_link_token: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid token format'),
  query_type: z.enum(['missing_items', 'wrong_quantity', 'wrong_price', 'not_received', 'other']),
  message: z.string().min(1, 'Message is required').max(1000, 'Message too long'),
});

Deno.serve(async (req) => {
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

    const { payment_link_token, query_type, message } = validationResult.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find delivery by token
    const { data: delivery, error: deliveryError } = await supabase
      .from('deliveries')
      .select('id, customer_id')
      .eq('payment_link_token', payment_link_token)
      .single();

    if (deliveryError || !delivery) {
      console.error('Delivery not found:', deliveryError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create query
    const { data: query, error: queryError } = await supabase
      .from('delivery_queries')
      .insert({
        delivery_id: delivery.id,
        customer_id: delivery.customer_id,
        query_type,
        message
      })
      .select()
      .single();

    if (queryError) {
      console.error('Error creating query:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to submit query. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Query created:', query.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Your query has been submitted successfully',
        query_id: query.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in submit-delivery-query:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
