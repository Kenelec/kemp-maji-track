
-- admin_approval_requests: drop permissive ALL policy, add scoped update/delete
DROP POLICY IF EXISTS "Allow read access to approval requests" ON public.admin_approval_requests;

CREATE POLICY "Admins can update approval requests"
ON public.admin_approval_requests
FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

CREATE POLICY "MasterAdmin can delete approval requests"
ON public.admin_approval_requests
FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'MasterAdmin'::text);

-- delivery_discrepancies: replace permissive ALL policy with scoped policies
DROP POLICY IF EXISTS "Allow read access to delivery discrepancies" ON public.delivery_discrepancies;

CREATE POLICY "Owners and admins can view discrepancies"
ON public.delivery_discrepancies
FOR SELECT
TO authenticated
USING (
  get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text])
  OR auth.uid() IN (
    SELECT d.created_by_user FROM public.deliveries d WHERE d.id = delivery_discrepancies.delivery_id
  )
  OR EXISTS (
    SELECT 1 FROM public.deliveries d
    JOIN public.customers c ON c.id = d.customer_id
    WHERE d.id = delivery_discrepancies.delivery_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can insert discrepancies"
ON public.delivery_discrepancies
FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

CREATE POLICY "Admins can update discrepancies"
ON public.delivery_discrepancies
FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

CREATE POLICY "MasterAdmin can delete discrepancies"
ON public.delivery_discrepancies
FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'MasterAdmin'::text);

-- pending_changes: replace permissive ALL policy with scoped admin-only policies
DROP POLICY IF EXISTS "Allow read access to pending changes" ON public.pending_changes;

CREATE POLICY "Admins can view pending changes"
ON public.pending_changes
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

CREATE POLICY "Admins can insert pending changes"
ON public.pending_changes
FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

CREATE POLICY "MasterAdmin can update pending changes"
ON public.pending_changes
FOR UPDATE
TO authenticated
USING (get_user_role(auth.uid()) = 'MasterAdmin'::text)
WITH CHECK (get_user_role(auth.uid()) = 'MasterAdmin'::text);

CREATE POLICY "MasterAdmin can delete pending changes"
ON public.pending_changes
FOR DELETE
TO authenticated
USING (get_user_role(auth.uid()) = 'MasterAdmin'::text);
