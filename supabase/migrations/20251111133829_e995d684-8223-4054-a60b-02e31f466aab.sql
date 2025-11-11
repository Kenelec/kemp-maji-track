-- Add notification preference to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS notification_preference TEXT DEFAULT 'whatsapp_sms' 
CHECK (notification_preference IN ('whatsapp_sms', 'sms_only', 'email_only', 'whatsapp_only'));

COMMENT ON COLUMN customers.notification_preference IS 'Preferred notification channel: whatsapp_sms (try WhatsApp first, fallback to SMS), sms_only, email_only, whatsapp_only';

-- Enable realtime for deliveries table
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
ALTER TABLE deliveries REPLICA IDENTITY FULL;

-- Add index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications_log(user_id, created_at DESC) 
WHERE status = 'delivered';

-- Add channel column to track which channel was used
ALTER TABLE notifications_log 
ALTER COLUMN channel TYPE TEXT;

COMMENT ON COLUMN notifications_log.channel IS 'Channel used: whatsapp, sms, email';