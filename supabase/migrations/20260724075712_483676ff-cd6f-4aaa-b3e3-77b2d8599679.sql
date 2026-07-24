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

-- Backfill existing deliveries
WITH sums AS (
  SELECT d.id, d.total_amount, COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('paid','completed')), 0) AS paid
  FROM deliveries d
  LEFT JOIN payments p ON p.delivery_id = d.id
  GROUP BY d.id, d.total_amount
)
UPDATE deliveries d
SET payment_status = CASE
  WHEN s.paid >= COALESCE(s.total_amount, 0) AND s.paid > 0 THEN 'paid'
  WHEN s.paid > 0 THEN 'partial'
  ELSE 'unpaid'
END
FROM sums s
WHERE d.id = s.id;