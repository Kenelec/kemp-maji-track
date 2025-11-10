-- Create system settings table for configurable options
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only MasterAdmin can view and manage settings
CREATE POLICY "MasterAdmin can manage settings"
  ON public.system_settings
  FOR ALL
  USING (get_user_role(auth.uid()) = 'MasterAdmin')
  WITH CHECK (get_user_role(auth.uid()) = 'MasterAdmin');

-- Insert default payment reminder duration (48 hours)
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('payment_reminder_hours', '{"hours": 48}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Create delivery queries table for customer dispute/query tracking
CREATE TABLE IF NOT EXISTS public.delivery_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  query_type TEXT NOT NULL, -- 'missing_items', 'wrong_quantity', 'wrong_price', 'other'
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'closed'
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_queries ENABLE ROW LEVEL SECURITY;

-- Customers can view their own queries
CREATE POLICY "Customers can view own queries"
  ON public.delivery_queries
  FOR SELECT
  USING (customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  ));

-- Customers can create queries for their deliveries
CREATE POLICY "Customers can create queries"
  ON public.delivery_queries
  FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  ));

-- Admins can view all queries
CREATE POLICY "Admins can view all queries"
  ON public.delivery_queries
  FOR SELECT
  USING (get_user_role(auth.uid()) = ANY(ARRAY['MasterAdmin', 'Admin']));

-- MasterAdmin can update queries (resolve them)
CREATE POLICY "MasterAdmin can update queries"
  ON public.delivery_queries
  FOR UPDATE
  USING (get_user_role(auth.uid()) = 'MasterAdmin')
  WITH CHECK (get_user_role(auth.uid()) = 'MasterAdmin');

-- Create index for faster queries
CREATE INDEX idx_delivery_queries_delivery_id ON public.delivery_queries(delivery_id);
CREATE INDEX idx_delivery_queries_customer_id ON public.delivery_queries(customer_id);
CREATE INDEX idx_delivery_queries_status ON public.delivery_queries(status);