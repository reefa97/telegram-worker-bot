-- Fix for Admin Users RLS Infinite Recursion
-- This script creates a security definer function to break circular dependencies.

-- 1. Create a security definer function to safely get the current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT role FROM admin_users WHERE id = auth.uid());
END;
$$;

-- 2. Update admin_users policies to use the function instead of recursive SELECTs
DROP POLICY IF EXISTS "Admins can view all admin profiles" ON admin_users;
DROP POLICY IF EXISTS "Super admins can manage all admins" ON admin_users;

-- Users can always see their own record (critical for AuthContext)
CREATE POLICY "Users can view own admin profile" ON admin_users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admins can see all profiles (uses get_my_role to avoid recursion)
CREATE POLICY "Admins can view all profiles" ON admin_users
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('super_admin', 'sub_admin'));

-- Only super admins can manage (INSERT/UPDATE/DELETE)
CREATE POLICY "Super admins can manage all profiles" ON admin_users
  FOR ALL TO authenticated
  USING (get_my_role() = 'super_admin')
  WITH CHECK (get_my_role() = 'super_admin');
