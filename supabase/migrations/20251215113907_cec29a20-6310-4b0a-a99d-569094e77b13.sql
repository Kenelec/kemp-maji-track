-- Create drivers table
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_number TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for drivers table
CREATE POLICY "drivers_select_admin" ON public.drivers
  FOR SELECT USING (get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "drivers_insert_admin" ON public.drivers
  FOR INSERT WITH CHECK (get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "drivers_update_master" ON public.drivers
  FOR UPDATE USING (get_user_role(auth.uid()) = 'MasterAdmin')
  WITH CHECK (get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "drivers_delete_master" ON public.drivers
  FOR DELETE USING (get_user_role(auth.uid()) = 'MasterAdmin');

-- Add driver_id column to deliveries table
ALTER TABLE public.deliveries 
ADD COLUMN driver_id UUID REFERENCES public.drivers(id);

-- Create trigger for updated_at on drivers
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();