import { supabase } from '@/integrations/supabase/client';

export class NotificationService {
  static async sendDeliveryNotification(deliveryId: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('send-delivery-confirmation', {
        body: { delivery_id: deliveryId }
      });
      
      if (error) throw error;
      console.log('Delivery notification sent successfully via Edge Function');
    } catch (error) {
      console.error('Error sending delivery notification:', error);
    }
  }

  static async sendPaymentNotification(deliveryId: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('send-payment-reminder', {
        body: { delivery_id: deliveryId }
      });
      
      if (error) throw error;
      console.log('Payment notification sent successfully via Edge Function');
    } catch (error) {
      console.error('Error sending payment notification:', error);
    }
  }
}

export default NotificationService;
