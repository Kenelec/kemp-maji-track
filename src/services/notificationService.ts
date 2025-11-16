import { triggerDeliveryNotification, triggerPaymentNotification } from './africasTalkingService';
import { triggerDeliveryEmail, triggerPaymentEmail } from './resendService';

export class NotificationService {
  static async sendDeliveryNotification(deliveryId: string): Promise<void> {
    try {
      // Send both SMS and email notifications
      const [smsSuccess, emailSuccess] = await Promise.allSettled([
        triggerDeliveryNotification(deliveryId),
        triggerDeliveryEmail(deliveryId)
      ]);

      console.log('Delivery notifications sent:', {
        sms: smsSuccess.status === 'fulfilled' ? smsSuccess.value : 'failed',
        email: emailSuccess.status === 'fulfilled' ? emailSuccess.value : 'failed'
      });
    } catch (error) {
      console.error('Error sending delivery notifications:', error);
    }
  }

  static async sendPaymentNotification(paymentId: string): Promise<void> {
    try {
      // Send both SMS and email notifications
      const [smsSuccess, emailSuccess] = await Promise.allSettled([
        triggerPaymentNotification(paymentId),
        triggerPaymentEmail(paymentId)
      ]);

      console.log('Payment notifications sent:', {
        sms: smsSuccess.status === 'fulfilled' ? smsSuccess.value : 'failed',
        email: emailSuccess.status === 'fulfilled' ? emailSuccess.value : 'failed'
      });
    } catch (error) {
      console.error('Error sending payment notifications:', error);
    }
  }

  static async processDriverSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Process driver SMS through Africa's Talking service
      const { africasTalkingService } = await import('./africasTalkingService');
      return await africasTalkingService.processDriverUpdate(phoneNumber, message);
    } catch (error) {
      console.error('Error processing driver SMS:', error);
      return false;
    }
  }
}

export default NotificationService;
