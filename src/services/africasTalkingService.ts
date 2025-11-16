import { supabase } from '@/integrations/supabase/client';

interface Delivery {
  id: string;
  customer_id: string;
  delivery_date: string;
  qty: number;
  total_amount: number;
  delivery_status: string;
  customer_name: string;
  customer_phone: string;
}

interface Payment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
}

class AfricasTalkingService {
  private apiKey: string;
  private username: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_AFRICAS_TALKING_API_KEY || '';
    this.username = import.meta.env.VITE_AFRICAS_TALKING_USERNAME || '';
  }

  private async sendSMS(to: string, message: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apikey': this.apiKey,
        },
        body: new URLSearchParams({
          username: this.username,
          to: to,
          message: message,
        }),
      });

      const result = await response.json();
      console.log('SMS Response:', result);
      return result.SMSMessageData?.Recipients?.length > 0;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  }

  async sendDeliveryNotification(delivery: Delivery): Promise<boolean> {
    const message = `Hello ${delivery.customer_name}, your water delivery has been scheduled for ${delivery.delivery_date}. Quantity: ${delivery.qty}L, Amount: KSh ${delivery.total_amount}. Thank you! - KEMP Maji Track`;
    
    return await this.sendSMS(delivery.customer_phone, message);
  }

  async sendPaymentNotification(payment: Payment): Promise<boolean> {
    try {
      // Get admin users to notify
      const { data: admins } = await supabase
        .from('users')
        .select('phone, name')
        .in('role_id', ['MasterAdmin', 'Admin']);

      if (!admins || admins.length === 0) return false;

      const message = `Payment received from ${payment.customer_name}. Amount: KSh ${payment.amount}. Method: ${payment.payment_method}. - KEMP Maji Track`;

      let successCount = 0;
      for (const admin of admins) {
        if (admin.phone) {
          const success = await this.sendSMS(admin.phone, message);
          if (success) successCount++;
        }
      }

      return successCount > 0;
    } catch (error) {
      console.error('Error sending payment notification:', error);
      return false;
    }
  }

  async processDriverUpdate(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Parse driver SMS (format: "DRIVER_CODE STATUS DELIVERY_ID")
      const parts = message.split(' ');
      if (parts.length < 3) return false;

      const [driverCode, status, deliveryId] = parts;

      // Find driver by phone number
      const { data: driver } = await supabase
        .from('users')
        .select('id, name')
        .eq('phone', phoneNumber)
        .single();

      if (!driver) return false;

      // Update delivery status based on driver SMS
      if (status === 'DELIVERED' && deliveryId) {
        const { error } = await supabase
          .from('deliveries')
          .update({ 
            delivery_status: 'completed', 
            delivery_completion_time: new Date().toISOString() 
          })
          .eq('id', deliveryId);
        
        if (error) throw error;
      }

      // Log the driver update
      await supabase
        .from('delivery_tracking')
        .insert({
          delivery_id: deliveryId,
          driver_id: driver.id,
          status: status,
          timestamp: new Date().toISOString(),
          location: 'Received via SMS from driver'
        });

      // Send confirmation SMS to driver
      await this.sendSMS(phoneNumber, `Update received: ${status} for delivery ${deliveryId}. Thank you! - KEMP Maji Track`);

      return true;
    } catch (error) {
      console.error('Error processing driver update:', error);
      return false;
    }
  }
}

export const africasTalkingService = new AfricasTalkingService();

// Functions to trigger SMS notifications
export const triggerDeliveryNotification = async (deliveryId: string) => {
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
        customers (customer_name, phone)
      `)
      .eq('id', deliveryId)
      .single();

    if (!delivery) return false;

    return await africasTalkingService.sendDeliveryNotification({
      ...delivery,
      customer_name: delivery.customers?.customer_name || '',
      customer_phone: delivery.customers?.phone || ''
    });
  } catch (error) {
    console.error('Error triggering delivery notification:', error);
    return false;
  }
};

export const triggerPaymentNotification = async (paymentId: string) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select(`
        id,
        customer_id,
        amount,
        payment_method,
        created_at,
        customers (customer_name, phone)
      `)
      .eq('id', paymentId)
      .single();

    if (!payment) return false;

    return await africasTalkingService.sendPaymentNotification({
      ...payment,
      customer_name: payment.customers?.customer_name || '',
      customer_phone: payment.customers?.phone || ''
    });
  } catch (error) {
    console.error('Error triggering payment notification:', error);
    return false;
  }
};
