-- Fix Issue 1: Remove permissive INSERT policy on audit_log (unrestricted inserts)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;

-- Audit logs should only be inserted via SECURITY DEFINER triggers/functions
-- No direct insert policy needed

-- Fix Issue 2: Restrict driver_locations read access to Admin/MasterAdmin only
DROP POLICY IF EXISTS "Allow read access to driver locations" ON public.driver_locations;

CREATE POLICY "Admins can view driver locations"
  ON public.driver_locations
  FOR SELECT
  USING (get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));