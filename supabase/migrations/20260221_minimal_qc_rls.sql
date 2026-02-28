-- Extreme diagnostic minimal RLS
DROP POLICY IF EXISTS "Admins can insert checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can update checks" ON quality_checks;
DROP POLICY IF EXISTS "Admins can delete checks" ON quality_checks;

DROP POLICY IF EXISTS "Admins can insert check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can update check items" ON quality_check_items;
DROP POLICY IF EXISTS "Admins can delete check items" ON quality_check_items;

CREATE POLICY "Admins can insert checks" ON quality_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update checks" ON quality_checks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete checks" ON quality_checks FOR DELETE TO authenticated USING (true);

CREATE POLICY "Admins can insert check items" ON quality_check_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update check items" ON quality_check_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete check items" ON quality_check_items FOR DELETE TO authenticated USING (true);
