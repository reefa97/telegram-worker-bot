-- Use get_my_role() to simplify and harden QC policies
-- This avoids any hidden RLS recursion or visibility issues with admin_users table

-- 1. quality_checks
DROP POLICY IF EXISTS "Admins can manage checks" ON quality_checks;
CREATE POLICY "Admins can manage checks" ON quality_checks
  FOR ALL TO authenticated
  WITH CHECK (
    get_my_role() IN ('super_admin', 'sub_admin')
  );

-- 2. quality_check_items
DROP POLICY IF EXISTS "Admins can manage check items" ON quality_check_items;
CREATE POLICY "Admins can manage check items" ON quality_check_items
  FOR ALL TO authenticated
  WITH CHECK (
    get_my_role() IN ('super_admin', 'sub_admin')
  );

-- 3. quality_check_schedules
DROP POLICY IF EXISTS "Admins can manage schedules" ON quality_check_schedules;
CREATE POLICY "Admins can manage schedules" ON quality_check_schedules
  FOR ALL TO authenticated
  WITH CHECK (
    get_my_role() IN ('super_admin', 'sub_admin')
  );

-- 4. worker_points_log (for points distribution)
DROP POLICY IF EXISTS "Anyone can view points" ON worker_points_log;
CREATE POLICY "Anyone can view points" ON worker_points_log
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage points" ON worker_points_log;
CREATE POLICY "Admins can manage points" ON worker_points_log
  FOR ALL TO authenticated
  WITH CHECK (
    get_my_role() IN ('super_admin', 'sub_admin')
  );
