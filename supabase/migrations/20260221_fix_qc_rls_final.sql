-- Final RLS Fix for Quality Control Module
-- This script ensures all necessary tables have both management (INSERT/UPDATE/DELETE) 
-- and visibility (SELECT) permissions for admins.

-- 1. quality_checks
DROP POLICY IF EXISTS "Admins can view checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can manage checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can insert checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can update checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can delete checks" ON quality_checks;
DROP POLICY IF EXISTS "Anyone can view checks" ON quality_checks;

CREATE POLICY "Anyone can view checks" ON quality_checks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage checks" ON quality_checks
  FOR ALL TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );


-- 2. quality_check_items
DROP POLICY IF EXISTS "Admins can view check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can manage check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can insert check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can update check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can delete check items" ON quality_check_items;

CREATE POLICY "Anyone can view check items" ON quality_check_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage check items" ON quality_check_items
  FOR ALL TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );


-- 3. quality_check_schedules
DROP POLICY IF EXISTS "Admins can view schedules" ON quality_check_schedules;
DROP POLICY IF EXISTS "Admins can manage schedules" ON quality_check_schedules;
DROP POLICY IF EXISTS "Admins can insert schedules" ON quality_check_schedules;
DROP POLICY IF EXISTS "Admins can update schedules" ON quality_check_schedules;
DROP POLICY IF EXISTS "Admins can delete schedules" ON quality_check_schedules;

CREATE POLICY "Anyone can view schedules" ON quality_check_schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage schedules" ON quality_check_schedules
  FOR ALL TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );


-- 4. worker_points_log
DROP POLICY IF EXISTS "Admins can view points log" ON worker_points_log;
DROP POLICY IF EXISTS "Admins can manage points log" ON worker_points_log;
DROP POLICY IF EXISTS "Admins can insert worker points" ON worker_points_log;
DROP POLICY IF EXISTS "Admins can update worker points" ON worker_points_log;
DROP POLICY IF EXISTS "Admins can delete worker points" ON worker_points_log;

CREATE POLICY "Anyone can view points log" ON worker_points_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage points log" ON worker_points_log
  FOR ALL TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('super_admin', 'sub_admin'))
  );
