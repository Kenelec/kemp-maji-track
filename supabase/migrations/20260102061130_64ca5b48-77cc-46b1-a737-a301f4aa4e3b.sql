-- Enable the pgcrypto extension for gen_random_bytes function
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Link the customer keiyonadesai@gmail.com to their auth user account
UPDATE public.customers 
SET user_id = 'eba0249b-6041-4454-a6c9-fa17453cd4c5'
WHERE email = 'keiyonadesai@gmail.com' AND user_id IS NULL;