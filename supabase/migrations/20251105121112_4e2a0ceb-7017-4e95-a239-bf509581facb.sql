-- 1) Create trigger to mirror auth.users into public.users via existing function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill any existing auth users into public.users as Customer (preserves existing rows)
INSERT INTO public.users (id, name, phone, role_id)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'name', au.email),
  au.raw_user_meta_data->>'phone',
  ur.id
FROM auth.users au
JOIN public.user_roles ur ON ur.name = 'Customer'
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL;

-- 3) Normalize products RLS policies to allow Admin/MasterAdmin visibility and management
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop old policies that relied on JWT claims or blocked Admin visibility
DROP POLICY IF EXISTS "Customers can view products" ON public.products;
DROP POLICY IF EXISTS "Admin can insert products" ON public.products;
DROP POLICY IF EXISTS "products_update_admins_masteradmin" ON public.products;

-- Create clear, role-based policies using get_user_role
CREATE POLICY "products_select_roles"
ON public.products
FOR SELECT
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('Customer','Admin','MasterAdmin'));

CREATE POLICY "products_insert_admins"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) IN ('Admin','MasterAdmin'));

CREATE POLICY "products_update_admins"
ON public.products
FOR UPDATE
TO authenticated
USING (public.get_user_role(auth.uid()) IN ('Admin','MasterAdmin'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('Admin','MasterAdmin'));

CREATE POLICY "products_delete_master"
ON public.products
FOR DELETE
TO authenticated
USING (public.get_user_role(auth.uid()) = 'MasterAdmin');