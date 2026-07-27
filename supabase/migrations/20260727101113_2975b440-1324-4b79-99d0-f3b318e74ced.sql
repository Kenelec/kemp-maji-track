
-- Expand allowed statuses and payment methods
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status = ANY (ARRAY['pending','paid','overdue','pending_verification','rejected','failed','completed','partial','credit']));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method = ANY (ARRAY['cash','mpesa','card','other','bank','credit']));

-- Backfill payments rows for existing customer_credits ledger entries
INSERT INTO public.payments (customer_id, delivery_id, amount, due_date, payment_method, status, created_at)
SELECT
  cc.customer_id,
  cc.source_delivery_id,
  cc.amount,
  COALESCE(cc.created_at::date, CURRENT_DATE),
  'credit',
  'credit',
  COALESCE(cc.created_at, now())
FROM public.customer_credits cc
WHERE NOT EXISTS (
  SELECT 1 FROM public.payments p
  WHERE p.status = 'credit'
    AND p.customer_id = cc.customer_id
    AND p.amount = cc.amount
    AND COALESCE(p.delivery_id::text,'') = COALESCE(cc.source_delivery_id::text,'')
);

-- Update trigger: credit rows must never count as delivery payment
CREATE OR REPLACE FUNCTION public.update_delivery_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_id UUID;
  v_total NUMERIC;
  v_paid NUMERIC;
BEGIN
  v_delivery_id := COALESCE(NEW.delivery_id, OLD.delivery_id);
  IF v_delivery_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total_amount INTO v_total FROM deliveries WHERE id = v_delivery_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM payments
  WHERE delivery_id = v_delivery_id
    AND status IN ('paid', 'completed');

  IF v_paid >= COALESCE(v_total, 0) AND v_paid > 0 THEN
    UPDATE deliveries SET payment_status = 'paid' WHERE id = v_delivery_id;
  ELSIF v_paid > 0 THEN
    UPDATE deliveries SET payment_status = 'partial' WHERE id = v_delivery_id;
  ELSE
    UPDATE deliveries SET payment_status = 'unpaid' WHERE id = v_delivery_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
