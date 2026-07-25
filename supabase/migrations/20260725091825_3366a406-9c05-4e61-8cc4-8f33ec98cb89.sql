
CREATE TABLE public.customer_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  source_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  source_delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_credits_customer ON public.customer_credits(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_credits TO authenticated;
GRANT ALL ON public.customer_credits TO service_role;

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage credits"
  ON public.customer_credits
  FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('MasterAdmin','Admin'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin','Admin'));

CREATE POLICY "Customers view own credits"
  ON public.customer_credits
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );
