-- Drop the existing INSERT policy that uses JWT claims
DROP POLICY IF EXISTS "customers_insert_owner_or_admin" ON public.customers;

-- Create new INSERT policy using get_user_role function
CREATE POLICY "customers_insert_admin_or_owner" ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  get_user_role(auth.uid()) IN ('Admin', 'MasterAdmin')
  OR user_id = auth.uid()
);