-- Fix: Allow all authenticated users to view drivers (for customer to see driver names)
CREATE POLICY "authenticated_users_select_drivers"
ON public.drivers
FOR SELECT
USING (auth.role() = 'authenticated');

-- Update the specific delivery to 'paid' status (customer paid 2500)
UPDATE public.deliveries 
SET payment_status = 'paid' 
WHERE id = '441c6ae5-2bed-4027-97aa-8351804718a8';