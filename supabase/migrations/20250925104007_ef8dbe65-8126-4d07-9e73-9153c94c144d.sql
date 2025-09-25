-- Create user roles enum and table
CREATE TYPE public.app_role AS ENUM ('MasterAdmin', 'Admin', 'Customer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name app_role NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default roles
INSERT INTO public.user_roles (name) VALUES 
  ('MasterAdmin'),
  ('Admin'), 
  ('Customer');

-- Create users table (extends auth.users with additional fields)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  role_id UUID REFERENCES public.user_roles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  area TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create deliveries table
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date DATE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  delivery_status TEXT CHECK (delivery_status IN ('scheduled', 'dispatched', 'delivered', 'cancelled')) DEFAULT 'scheduled',
  qty INTEGER NOT NULL,
  unit_rate DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  created_by_user UUID REFERENCES public.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create delivery_items table
CREATE TABLE public.delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  delivery_id UUID REFERENCES public.deliveries(id),
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  mpesa_code TEXT,
  payment_method TEXT CHECK (payment_method IN ('cash', 'mpesa', 'card', 'other')) DEFAULT 'cash',
  status TEXT CHECK (status IN ('pending', 'paid', 'overdue')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create admin_approval_requests table
CREATE TABLE public.admin_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.users(id) NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID NOT NULL,
  requested_action TEXT CHECK (requested_action IN ('update', 'delete')) NOT NULL,
  payload JSONB,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  acted_by UUID REFERENCES public.users(id),
  acted_at TIMESTAMP WITH TIME ZONE
);

-- Create notifications_log table
CREATE TABLE public.notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) NOT NULL,
  channel TEXT CHECK (channel IN ('sms', 'whatsapp', 'email')) NOT NULL,
  content TEXT NOT NULL,
  status TEXT CHECK (status IN ('queued', 'sent', 'failed')) DEFAULT 'queued',
  provider_ref TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create audit_log table
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  diff JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Create helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT ur.name::TEXT
    FROM public.users u
    JOIN public.user_roles ur ON u.role_id = ur.id
    WHERE u.id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  customer_role_id UUID;
BEGIN
  -- Get the customer role ID
  SELECT id INTO customer_role_id FROM public.user_roles WHERE name = 'Customer';
  
  INSERT INTO public.users (id, name, phone, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    customer_role_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for user_roles
CREATE POLICY "Everyone can view user roles" ON public.user_roles FOR SELECT USING (true);

-- RLS Policies for users
CREATE POLICY "Users can view their own profile" ON public.users 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "MasterAdmin can view all users" ON public.users 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view all users" ON public.users 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Users can update their own profile" ON public.users 
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for customers
CREATE POLICY "MasterAdmin can manage all customers" ON public.customers 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and insert customers" ON public.customers 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can insert customers" ON public.customers 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Customers can view their own data" ON public.customers 
  FOR SELECT USING (user_id = auth.uid());

-- RLS Policies for products
CREATE POLICY "MasterAdmin can manage all products" ON public.products 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and insert products" ON public.products 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can insert products" ON public.products 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

-- RLS Policies for deliveries
CREATE POLICY "MasterAdmin can manage all deliveries" ON public.deliveries 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and insert deliveries" ON public.deliveries 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can insert deliveries" ON public.deliveries 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Customers can view their deliveries" ON public.deliveries 
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for delivery_items
CREATE POLICY "MasterAdmin can manage all delivery items" ON public.delivery_items 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and insert delivery items" ON public.delivery_items 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can insert delivery items" ON public.delivery_items 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Customers can view their delivery items" ON public.delivery_items 
  FOR SELECT USING (
    delivery_id IN (
      SELECT d.id FROM public.deliveries d
      JOIN public.customers c ON d.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- RLS Policies for payments
CREATE POLICY "MasterAdmin can manage all payments" ON public.payments 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and insert payments" ON public.payments 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can insert payments" ON public.payments 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Customers can view their payments" ON public.payments 
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Customers can update their payment mpesa codes" ON public.payments 
  FOR UPDATE USING (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  ) WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for admin_approval_requests
CREATE POLICY "MasterAdmin can manage approval requests" ON public.admin_approval_requests 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and create approval requests" ON public.admin_approval_requests 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can create approval requests" ON public.admin_approval_requests 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'Admin' AND admin_user_id = auth.uid());

-- RLS Policies for notifications_log
CREATE POLICY "Users can view their notifications" ON public.notifications_log 
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "MasterAdmin can manage all notifications" ON public.notifications_log 
  FOR ALL USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and insert notifications" ON public.notifications_log 
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

CREATE POLICY "Admin can insert notifications" ON public.notifications_log 
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('MasterAdmin', 'Admin'));

-- RLS Policies for audit_log
CREATE POLICY "MasterAdmin can view all audit logs" ON public.audit_log 
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "System can insert audit logs" ON public.audit_log 
  FOR INSERT WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();