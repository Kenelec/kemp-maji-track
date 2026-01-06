-- Fix: Restrict driver_locations INSERT to Admin/MasterAdmin only
DROP POLICY IF EXISTS "Allow insert access to driver locations" ON public.driver_locations;

CREATE POLICY "Admins can insert driver locations"
  ON public.driver_locations
  FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));