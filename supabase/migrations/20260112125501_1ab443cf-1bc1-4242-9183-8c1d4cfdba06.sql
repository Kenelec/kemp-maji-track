-- Allow customers to insert payments for their own deliveries (for M-Pesa payments)
CREATE POLICY "Customers can insert their own payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers 
    WHERE user_id = auth.uid()
  )
);