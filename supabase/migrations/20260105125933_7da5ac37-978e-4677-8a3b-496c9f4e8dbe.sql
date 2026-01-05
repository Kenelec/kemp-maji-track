-- Allow customers to update their own deliveries (for confirmation and discrepancy reporting)
CREATE POLICY "customers_update_own_delivery_confirmation" ON public.deliveries
FOR UPDATE
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  )
);