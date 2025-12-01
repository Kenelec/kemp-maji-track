-- Create in_app_notifications table for real-time admin notifications
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment_received', 'query_submitted', 'delivery_update')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.in_app_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.in_app_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view their own notifications
CREATE POLICY "Admins can view own notifications"
ON public.in_app_notifications
FOR SELECT
USING (
  auth.uid() = user_id 
  OR get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin')
);

-- Policy: Admins can update their own notifications (mark as read)
CREATE POLICY "Admins can update own notifications"
ON public.in_app_notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: System can insert notifications
CREATE POLICY "System can insert notifications"
ON public.in_app_notifications
FOR INSERT
WITH CHECK (true);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;