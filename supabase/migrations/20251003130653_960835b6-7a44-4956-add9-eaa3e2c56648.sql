
-- Fix the products table RLS policy to match other tables
-- Drop the incorrect policy
DROP POLICY IF EXISTS "Dashboard read products" ON products;

-- Create correct policies for products
CREATE POLICY "MasterAdmin can manage all products"
ON products
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'MasterAdmin');

CREATE POLICY "Admin can view and manage products"
ON products
FOR ALL
TO authenticated
USING (get_user_role(auth.uid()) = 'Admin');

CREATE POLICY "Customers can view products"
ON products
FOR SELECT
TO authenticated
USING (get_user_role(auth.uid()) = 'Customer');
