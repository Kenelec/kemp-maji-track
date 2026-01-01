-- Add delivery confirmation columns to deliveries table
ALTER TABLE public.deliveries
ADD COLUMN IF NOT EXISTS customer_confirmed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmation_reminder_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS confirmation_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_confirmed BOOLEAN DEFAULT false;

-- Create trigger to auto-set confirmation deadline on delivery creation
CREATE OR REPLACE FUNCTION public.set_confirmation_deadline()
RETURNS TRIGGER AS $$
DECLARE
  days_setting INTEGER;
BEGIN
  -- Get confirmation days from settings, default to 3
  SELECT COALESCE((setting_value->>'days')::INTEGER, 3) INTO days_setting
  FROM public.system_settings
  WHERE setting_key = 'delivery_confirmation_days';
  
  IF days_setting IS NULL THEN
    days_setting := 3;
  END IF;
  
  NEW.confirmation_deadline := NEW.created_at + (days_setting || ' days')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new deliveries
DROP TRIGGER IF EXISTS set_delivery_confirmation_deadline ON public.deliveries;
CREATE TRIGGER set_delivery_confirmation_deadline
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_confirmation_deadline();

-- Insert default system setting for confirmation days if not exists
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('delivery_confirmation_days', '{"days": 3}')
ON CONFLICT (setting_key) DO NOTHING;

-- Update existing deliveries to have confirmation deadline (3 days from creation)
UPDATE public.deliveries
SET confirmation_deadline = created_at + INTERVAL '3 days'
WHERE confirmation_deadline IS NULL;