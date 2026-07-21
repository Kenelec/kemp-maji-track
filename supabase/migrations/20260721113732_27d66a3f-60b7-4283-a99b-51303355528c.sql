DROP POLICY IF EXISTS "System can insert notifications" ON public.in_app_notifications;

CREATE POLICY "Authenticated admins can insert notifications"
ON public.in_app_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text])
  OR auth.uid() = user_id
);