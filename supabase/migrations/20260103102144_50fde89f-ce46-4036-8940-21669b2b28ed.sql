-- Fix the generate_payment_token function to use the correct schema for gen_random_bytes
CREATE OR REPLACE FUNCTION public.generate_payment_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token TEXT;
BEGIN
  -- Use extensions schema where pgcrypto is installed
  token := encode(extensions.gen_random_bytes(16), 'hex');
  RETURN token;
END;
$$;