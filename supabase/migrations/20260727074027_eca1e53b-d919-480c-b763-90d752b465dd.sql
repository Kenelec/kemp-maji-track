DROP POLICY IF EXISTS "authenticated_users_select_drivers" ON public.drivers;

DROP POLICY IF EXISTS "Everyone can view user roles" ON public.user_roles;
CREATE POLICY "Authenticated users can view user roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.user_roles FROM anon;