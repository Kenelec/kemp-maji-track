
-- Fix case-mismatched role checks
DROP POLICY IF EXISTS "Admins can propose edits" ON public.customers_edits;
CREATE POLICY "Admins can propose edits"
ON public.customers_edits
FOR INSERT
TO authenticated
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

DROP POLICY IF EXISTS "admin_full_access" ON public.payments_audit;
CREATE POLICY "admin_full_access"
ON public.payments_audit
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]))
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['MasterAdmin'::text, 'Admin'::text]));

-- Set fixed search_path on functions missing it
CREATE OR REPLACE FUNCTION public.update_delivery_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('paid', 'completed') THEN
    UPDATE deliveries SET payment_status = 'paid' WHERE id = NEW.delivery_id;
  ELSIF NEW.status IN ('pending', 'overdue') THEN
    UPDATE deliveries SET payment_status = 'unpaid' WHERE id = NEW.delivery_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_customer_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT id FROM customers
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
    LIMIT 1
  );
END;
$function$;
