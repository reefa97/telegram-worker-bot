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

-- Drop ALL existing SELECT policies on admin_users (catch every variant
-- including names with spaces, quoted identifiers, helper-based predicates,
-- and previous attempts at the same fix).
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

-- Pre-emptively drop policies we are about to create (idempotency on re-runs)
DROP POLICY IF EXISTS "admin_users select own" ON admin_users;
DROP POLICY IF EXISTS "admin_users select super_admin" ON admin_users;
DROP POLICY IF EXISTS "admin_users select sub_admin" ON admin_users;
DROP POLICY IF EXISTS "admin_users select manager" ON admin_users;

-- Always allow reading own row
CREATE POLICY "admin_users select own" ON admin_users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Super_admin sees everyone
CREATE POLICY "admin_users select super_admin" ON admin_users
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- IMPORTANT: inline SELECT-from-admin_users inside an admin_users RLS
-- policy causes infinite recursion (Postgres errors with 42P17). We use
-- the existing SECURITY DEFINER helper get_my_role() so the lookup
-- bypasses RLS on the inner read.

CREATE POLICY "admin_users select sub_admin" ON admin_users
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'sub_admin'
    AND (role = 'client' OR created_by = auth.uid())
  );

CREATE POLICY "admin_users select manager" ON admin_users
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'manager'
    AND role = 'client'
  );

NOTIFY pgrst, 'reload schema';
