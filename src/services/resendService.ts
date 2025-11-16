import { supabase } from '@/integrations/supabase/client';

interface Delivery {
  id: string;
  customer_id: string;
  delivery_date: string;
  qty: number;
  total_amount: number;
  delivery_status: string;
  customer_name: string;
  customer_email: string;
}

interface Payment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
}

class ResendService {
  private apiKey: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_RESEND_API_KEY || '';
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: 'KEMP Maji Track <notifications@yourdomain.com>', // Replace with your domain
          to: to,
          subject: subject,
          html: html,
        }),
      });

      const result = await response.json();
      console.log('Email Response:', result);
      return response.ok;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendDeliveryEmail(delivery: Delivery): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">KEMP Maji Track - Delivery Notification</h2>
        <p>Hello ${delivery.customer_name},</p>
        <p>Your water delivery has been scheduled for <strong>${delivery.delivery_date}</strong>.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Delivery Details:</strong></p>
          <p>Quantity: ${delivery.qty}L</p>
          <p>Amount: KSh ${delivery.total_amount}</p>
          <p>Status: ${delivery.delivery_status}</p>
        </div>
        <p>Thank you for choosing KEMP Maji Track!</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #64748b;">This is an automated message from KEMP Maji Track. Please do not reply to this email.</p>
      </div>
    `;
    
    return await this.sendEmail(delivery.customer_email, 'Your Water Delivery Notification', html);
  }

  async sendPaymentEmail(payment: Payment): Promise<boolean> {
    try {
      // Get admin emails to notify
      const { data: admins } = await supabase
        .from('users')
        .select('email, name')
        .in('role_id', ['MasterAdmin', 'Admin']);

      if (!admins || admins.length === 0) return false;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">KEMP Maji Track - Payment Received</h2>
          <p>Payment received from <strong>${payment.customer_name}</strong>.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p><strong>Payment Details:</strong></p>
            <p>Amount: KSh ${payment.amount}</p>
            <p>Method: ${payment.payment_method}</p>
            <p>Date: ${new Date(payment.created_at).toLocaleString()}</p>
          </div>
          <p>This is an automated notification from KEMP Maji Track.</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #64748b;">This is an automated message from KEMP Maji Track. Please do not reply to this email.</p>
        </div>
      `;

      let successCount = 0;
      for (const admin of admins) {
        if (admin.email) {
          const success = await this.sendEmail(admin.email, 'Payment Received Notification', html);
          if (success) successCount++;
        }
      }

      return successCount > 0;
    } catch (error) {
      console.error('Error sending payment email:', error);
      return false;
    }
  }
}

export const resendService = new ResendService();

// Functions to trigger email notifications
export const triggerDeliveryEmail = async (deliveryId: string) => {
  try {
    const { data: delivery } = await supabase
      .from('deliveries')
      .select(`
        id,
        customer_id,
        delivery_date,
        qty,
        total_amount,
        delivery_status,
        customers (customer_name, email)
      `)
      .eq('id', deliveryId)
      .single();

    if (!delivery) return false;

    return await resendService.sendDeliveryEmail({
      ...delivery,
      customer_name: delivery.customers?.customer_name || '',
      customer_email: delivery.customers?.email || ''
    });
  } catch (error) {
    console.error('Error triggering delivery email:', error);
    return false;
  }
};

export const triggerPaymentEmail = async (paymentId: string) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select(`
        id,
        customer_id,
        amount,
        payment_method,
        created_at,
        customers (customer_name, email)
      `)
      .eq('id', paymentId)
      .single();

    if (!payment) return false;

    return await resendService.sendPaymentEmail({
      ...payment,
      customer_name: payment.customers?.customer_name || '',
      customer_email: payment.customers?.email || ''
    });
  } catch (error) {
    console.error('Error triggering payment email:', error);
    return false;
  }
};
