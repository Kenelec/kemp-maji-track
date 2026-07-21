
-- Fix delivery_acl policies to use vetted role function instead of JWT claim
DROP POLICY IF EXISTS delivery_acl_select ON public.delivery_acl;
DROP POLICY IF EXISTS delivery_acl_write_master ON public.delivery_acl;

CREATE POLICY delivery_acl_select ON public.delivery_acl
FOR SELECT TO authenticated
USING (
  public.get_user_role(auth.uid()) IN ('MasterAdmin','Admin')
  OR EXISTS (
    SELECT 1 FROM public.deliveries d
    JOIN public.customers c ON d.customer_id = c.id
    WHERE d.id = delivery_acl.delivery_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY delivery_acl_write_master ON public.delivery_acl
FOR ALL TO authenticated
USING (public.get_user_role(auth.uid()) = 'MasterAdmin')
WITH CHECK (public.get_user_role(auth.uid()) = 'MasterAdmin');

-- Fix delivery_items policies to use server-verified customer mapping
DROP POLICY IF EXISTS "Customers can view their delivery items" ON public.delivery_items;
DROP POLICY IF EXISTS select_customers_own_delivery_items_v2 ON public.delivery_items;

CREATE POLICY select_customers_own_delivery_items_v2 ON public.delivery_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deliveries d
    JOIN public.customers c ON c.id = d.customer_id
    WHERE d.id = delivery_items.delivery_id AND c.user_id = auth.uid()
  )
);

-- Fix get_current_customer_id to map via user_id instead of email
CREATE OR REPLACE FUNCTION public.get_current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.customers WHERE user_id = auth.uid() LIMIT 1;
$$;
