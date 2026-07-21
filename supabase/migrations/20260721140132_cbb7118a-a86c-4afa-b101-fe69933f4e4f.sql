
-- Extend payments.status values
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status = ANY (ARRAY['pending','paid','overdue','pending_verification','rejected','failed','completed']));

-- Add verification tracking columns
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- SMS inbox table
CREATE TABLE IF NOT EXISTS public.mpesa_sms_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mpesa_code text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  sender_phone text,
  sender_name text,
  message_text text,
  received_at timestamptz NOT NULL DEFAULT now(),
  matched_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mpesa_sms_inbox TO authenticated;
GRANT ALL ON public.mpesa_sms_inbox TO service_role;

ALTER TABLE public.mpesa_sms_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sms inbox" ON public.mpesa_sms_inbox
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('MasterAdmin','Admin'));

CREATE POLICY "MasterAdmin can insert sms inbox" ON public.mpesa_sms_inbox
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "MasterAdmin can update sms inbox" ON public.mpesa_sms_inbox
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "MasterAdmin can delete sms inbox" ON public.mpesa_sms_inbox
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

-- Auto-match function: when a payment or SMS arrives, try to match by code + amount tolerance
CREATE OR REPLACE FUNCTION public.try_match_mpesa_payment(p_payment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay RECORD;
  sms RECORD;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND OR pay.mpesa_code IS NULL OR pay.status = 'paid' THEN
    RETURN false;
  END IF;

  SELECT * INTO sms FROM public.mpesa_sms_inbox
    WHERE upper(mpesa_code) = upper(pay.mpesa_code)
      AND matched_payment_id IS NULL
      AND abs(amount - pay.amount) <= 1
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.payments
    SET status = 'paid',
        verified_at = now()
    WHERE id = pay.id;

  UPDATE public.mpesa_sms_inbox
    SET matched_payment_id = pay.id
    WHERE id = sms.id;

  RETURN true;
END;
$$;

-- Trigger on payments: try auto-match when payment is inserted/updated with pending_verification
CREATE OR REPLACE FUNCTION public.trg_payment_automatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending_verification' AND NEW.mpesa_code IS NOT NULL THEN
    PERFORM public.try_match_mpesa_payment(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_automatch_trigger ON public.payments;
CREATE TRIGGER payment_automatch_trigger
  AFTER INSERT OR UPDATE OF status, mpesa_code ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payment_automatch();

-- Trigger on sms inbox: try to match against pending payments
CREATE OR REPLACE FUNCTION public.trg_sms_automatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_pay RECORD;
BEGIN
  IF NEW.matched_payment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO pending_pay FROM public.payments
    WHERE upper(mpesa_code) = upper(NEW.mpesa_code)
      AND status = 'pending_verification'
      AND abs(amount - NEW.amount) <= 1
    ORDER BY created_at ASC
    LIMIT 1;

  IF FOUND THEN
    UPDATE public.payments
      SET status = 'paid', verified_at = now()
      WHERE id = pending_pay.id;
    NEW.matched_payment_id := pending_pay.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_automatch_trigger ON public.mpesa_sms_inbox;
CREATE TRIGGER sms_automatch_trigger
  BEFORE INSERT ON public.mpesa_sms_inbox
  FOR EACH ROW EXECUTE FUNCTION public.trg_sms_automatch();

-- Update delivery_payment_status: keep unpaid until admin confirms
CREATE OR REPLACE FUNCTION public.update_delivery_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('paid', 'completed') THEN
    UPDATE deliveries SET payment_status = 'paid' WHERE id = NEW.delivery_id;
  ELSIF NEW.status IN ('pending', 'overdue', 'pending_verification', 'rejected') THEN
    UPDATE deliveries SET payment_status = 'unpaid' WHERE id = NEW.delivery_id;
  END IF;
  RETURN NEW;
END;
$$;
