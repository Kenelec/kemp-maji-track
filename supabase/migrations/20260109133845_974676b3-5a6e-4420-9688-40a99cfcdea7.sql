-- Update handle_new_user function to auto-link customers by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_role_id UUID;
BEGIN
  -- Get the customer role ID
  SELECT id INTO customer_role_id FROM public.user_roles WHERE name = 'Customer';
  
  -- Insert into users table
  INSERT INTO public.users (id, name, phone, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    customer_role_id
  );
  
  -- Auto-link any existing customer record with matching email
  UPDATE public.customers
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND user_id IS NULL;
  
  RETURN NEW;
END;
$$;