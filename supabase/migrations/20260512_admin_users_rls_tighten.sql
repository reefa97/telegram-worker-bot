-- ========================================
-- SECURITY: Tighten admin_users RLS
-- ========================================
-- The "Admins can view admin_users" policy used `USING (true)` for any
-- authenticated user, which meant clients and workers could read every
-- admin's email, phone, telegram_chat_id, permissions, and plain_password.
--
-- This migration removes that policy and any other open SELECT policies,
-- leaving a clean role-based stack:
--   * super_admin → sees all rows
--   * sub_admin   → sees own row + rows they created + clients
--   * manager     → sees own row + clients
--   * client      → sees own row only
--   * worker (telegram-only, no auth.users entry) → no access
-- ========================================

-- Drop ALL existing SELECT policies on admin_users (catch every variant)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'admin_users' AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON admin_users', r.policyname);
  END LOOP;
END$$;

-- Always allow reading own row
CREATE POLICY "admin_users select own" ON admin_users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Super_admin sees everyone
CREATE POLICY "admin_users select super_admin" ON admin_users
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Sub_admin sees clients they created + clients in general (so they can manage)
CREATE POLICY "admin_users select sub_admin" ON admin_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users me
      WHERE me.id = auth.uid()
      AND me.role = 'sub_admin'
    )
    AND (
      role = 'client'
      OR created_by = auth.uid()
    )
  );

-- Manager sees clients (for assigning, etc.)
CREATE POLICY "admin_users select manager" ON admin_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users me
      WHERE me.id = auth.uid()
      AND me.role = 'manager'
    )
    AND role = 'client'
  );

NOTIFY pgrst, 'reload schema';
