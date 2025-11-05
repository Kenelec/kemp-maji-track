-- Grant execute permissions on user_can_view_delivery functions
GRANT EXECUTE ON FUNCTION public.user_can_view_delivery(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_view_delivery(uuid) TO authenticated;

-- Grant execute on get_user_role function (if not already granted)
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

-- Drop old confusing/overlapping deliveries policies
DROP POLICY IF EXISTS "Customers and Admins can select deliveries" ON deliveries;
DROP POLICY IF EXISTS "dashboard_user_select_deliveries" ON deliveries;
DROP POLICY IF EXISTS "Admin can insert deliveries" ON deliveries;
DROP POLICY IF EXISTS "Admins and MasterAdmin can insert deliveries" ON deliveries;

-- Create new clear, role-based SELECT policies
CREATE POLICY "deliveries_select_admin_master"
ON deliveries FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin')
);

CREATE POLICY "deliveries_select_customer_own"
ON deliveries FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()
  )
);

-- Create new clear INSERT policy
CREATE POLICY "deliveries_insert_admin_master"
ON deliveries FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin')
);

-- Keep existing UPDATE/DELETE policies (they are MasterAdmin-only and correct)