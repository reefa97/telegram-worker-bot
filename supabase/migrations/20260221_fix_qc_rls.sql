-- Fix RLS for Quality Control Module
-- Using a standard pattern for `auth.uid()` checks that doesn't cause recursive row-not-found issues.

DROP POLICY IF EXISTS "Admins can insert checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can update checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can delete checks" ON quality_checks;

DROP POLICY IF EXISTS "Admins can insert check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can update check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can delete check items" ON quality_check_items;

DROP POLICY IF EXISTS "Admins can insert schedules" ON quality_check_schedules;
DROP POLICY IF EXISTS "Admins can update schedules" ON quality_check_schedules;
DROP POLICY IF EXISTS "Admins can delete schedules" ON quality_check_schedules;

DROP POLICY IF EXISTS "Admins can insert worker points" ON worker_points_log;
DROP POLICY IF EXISTS "Admins can update worker points" ON worker_points_log;
DROP POLICY IF EXISTS "Admins can delete worker points" ON worker_points_log;

-- Recreate with simpler, fail-proof manager access (based on admin_users role)
-- 1. quality_checks
CREATE POLICY "Admins can insert checks" ON quality_checks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can update checks" ON quality_checks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can delete checks" ON quality_checks
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

-- 2. quality_check_items
CREATE POLICY "Admins can insert check items" ON quality_check_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can update check items" ON quality_check_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can delete check items" ON quality_check_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

-- 3. quality_check_schedules
CREATE POLICY "Admins can insert schedules" ON quality_check_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can update schedules" ON quality_check_schedules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can delete schedules" ON quality_check_schedules
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

-- 4. worker_points_log
CREATE POLICY "Admins can insert worker points" ON worker_points_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can update worker points" ON worker_points_log
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );

CREATE POLICY "Admins can delete worker points" ON worker_points_log
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );
