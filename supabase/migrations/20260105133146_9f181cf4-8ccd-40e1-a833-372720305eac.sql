-- Update system setting for 48-hour (2 days) confirmation window
UPDATE public.system_settings 
SET setting_value = '{"days": 2}'::jsonb
WHERE setting_key = 'delivery_confirmation_days';

-- Insert if it doesn't exist
INSERT INTO public.system_settings (setting_key, setting_value)
SELECT 'delivery_confirmation_days', '{"days": 2}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings WHERE setting_key = 'delivery_confirmation_days'
);