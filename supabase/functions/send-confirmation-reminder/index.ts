import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AFRICASTALKING_API_KEY = Deno.env.get("AFRICASTALKING_API_KEY");
const AFRICASTALKING_USERNAME = Deno.env.get("AFRICASTALKING_USERNAME");

interface DeliveryWithCustomer {
  id: string;
  delivery_date: string;
  total_amount: number;
  confirmation_deadline: string;
  confirmation_reminder_sent: boolean;
  customers: {
    id: string;
    customer_name: string;
    phone: string;
    email: string;
    notification_preference: string;
  };
}

async function sendSMS(phone: string, message: string) {
  try {
    const formData = new URLSearchParams();
    formData.append("username", AFRICASTALKING_USERNAME || "");
    formData.append("to", phone);
    formData.append("message", message);

    const response = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "apiKey": AFRICASTALKING_API_KEY || "",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const result = await response.json();
    console.log("SMS sent:", result);
    return result;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw error;
  }
}

async function sendWhatsApp(phone: string, message: string) {
  try {
    // Format phone number for WhatsApp (remove + if present, ensure it has country code)
    const formattedPhone = phone.replace(/^\+/, "");
    
    const response = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "apiKey": AFRICASTALKING_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: AFRICASTALKING_USERNAME,
        productName: "KEMP",
        to: formattedPhone,
        message: message,
        channel: "whatsapp",
      }),
    });

    const result = await response.json();
    console.log("WhatsApp message sent:", result);
    return result;
  } catch (error) {
    console.error("Error sending WhatsApp:", error);
    throw error;
  }
}

// Secret token for cron job authentication
const CRON_SECRET = Deno.env.get("CRON_SECRET");

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.get("Authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");
    
    if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
      console.error("Unauthorized access attempt to send-confirmation-reminder");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    
    // Calculate reminder time (24 hours after delivery for 48-hour total window)
    const reminderCheckTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    // 1. Find deliveries needing reminder (24 hours after creation, not reminded, not confirmed)
    const { data: needsReminder, error: reminderError } = await supabase
      .from("deliveries")
      .select(`
        id,
        delivery_date,
        total_amount,
        confirmation_deadline,
        confirmation_reminder_sent,
        created_at,
        customers (
          id,
          customer_name,
          phone,
          email,
          notification_preference
        )
      `)
      .eq("customer_confirmed", false)
      .eq("auto_confirmed", false)
      .eq("confirmation_reminder_sent", false)
      .eq("discrepancy_flag", false)
      .lt("created_at", reminderCheckTime.toISOString());

    if (reminderError) {
      console.error("Error fetching deliveries for reminder:", reminderError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch deliveries" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${needsReminder?.length || 0} deliveries needing reminder`);

    // Send reminders
    for (const deliveryData of (needsReminder || [])) {
      const delivery = deliveryData as unknown as DeliveryWithCustomer;
      const customer = delivery.customers;
      if (!customer?.phone) continue;

      const message = `Hi ${customer.customer_name}, your delivery on ${new Date(delivery.delivery_date).toLocaleDateString()} (KSh ${delivery.total_amount}) hasn't been confirmed. If accurate, no action needed - it will auto-confirm in 24 hours. Have issues? Reply or call us. - KEMP Water`;

      try {
        const preference = customer.notification_preference || "whatsapp_sms";
        
        if (preference === "whatsapp" || preference === "whatsapp_sms") {
          await sendWhatsApp(customer.phone, message);
        }
        if (preference === "sms" || preference === "whatsapp_sms") {
          await sendSMS(customer.phone, message);
        }

        // Mark reminder as sent
        await supabase
          .from("deliveries")
          .update({ confirmation_reminder_sent: true })
          .eq("id", delivery.id);

        // Log notification
        const { data: userData } = await supabase
          .from("customers")
          .select("user_id")
          .eq("id", customer.id)
          .single();

        if (userData?.user_id) {
          await supabase.from("notifications_log").insert({
            user_id: userData.user_id,
            channel: preference,
            content: message,
            status: "sent",
          });
        }

        console.log(`Reminder sent for delivery ${delivery.id} to ${customer.customer_name}`);
      } catch (sendError) {
        console.error(`Failed to send reminder for delivery ${delivery.id}:`, sendError);
      }
    }

    // 2. Auto-confirm deliveries 48 hours after creation (24 hours after reminder)
    const autoConfirmTime = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

    const { data: needsAutoConfirm, error: autoConfirmError } = await supabase
      .from("deliveries")
      .select("id, created_at")
      .eq("customer_confirmed", false)
      .eq("auto_confirmed", false)
      .eq("discrepancy_flag", false)
      .lt("created_at", autoConfirmTime.toISOString());

    if (autoConfirmError) {
      console.error("Error fetching deliveries for auto-confirm:", autoConfirmError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch deliveries for auto-confirm" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${needsAutoConfirm?.length || 0} deliveries to auto-confirm`);

    // Auto-confirm
    for (const delivery of (needsAutoConfirm || [])) {
      await supabase
        .from("deliveries")
        .update({
          customer_confirmed: true,
          auto_confirmed: true,
          confirmed_at: now.toISOString(),
        })
        .eq("id", delivery.id);

      console.log(`Auto-confirmed delivery ${delivery.id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        reminders_sent: needsReminder?.length || 0,
        auto_confirmed: needsAutoConfirm?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in send-confirmation-reminder:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
