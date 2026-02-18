-- Fix RLS Policies for Finance Tables

-- 1. admin_expenses
DROP POLICY IF EXISTS "Super Admins can manage all expenses" ON admin_expenses;
DROP POLICY IF EXISTS "Admins can manage own expenses" ON admin_expenses;

CREATE POLICY "Super Admins can manage all expenses" ON admin_expenses
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Admins can manage own expenses" ON admin_expenses
FOR ALL TO authenticated
USING (
    admin_id = auth.uid()
)
WITH CHECK (
    admin_id = auth.uid()
);


-- 2. admin_extra_hours
DROP POLICY IF EXISTS "Super Admins can manage all extra hours" ON admin_extra_hours;
DROP POLICY IF EXISTS "Admins can manage own extra hours" ON admin_extra_hours;

CREATE POLICY "Super Admins can manage all extra hours" ON admin_extra_hours
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Admins can manage own extra hours" ON admin_extra_hours
FOR ALL TO authenticated
USING (
    admin_id = auth.uid()
)
WITH CHECK (
    admin_id = auth.uid()
);


-- 3. admin_extra_income
DROP POLICY IF EXISTS "Super Admins can manage all extra income" ON admin_extra_income;
DROP POLICY IF EXISTS "Admins can view own extra income" ON admin_extra_income;

CREATE POLICY "Super Admins can manage all extra income" ON admin_extra_income
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Admins can view own extra income" ON admin_extra_income
FOR SELECT TO authenticated
USING (
    admin_id = auth.uid()
);


-- 4. admin_object_rates
DROP POLICY IF EXISTS "Super Admins can manage all rates" ON admin_object_rates;
DROP POLICY IF EXISTS "Admins can view own object rates" ON admin_object_rates;

CREATE POLICY "Super Admins can manage all rates" ON admin_object_rates
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Admins can view own object rates" ON admin_object_rates
FOR SELECT TO authenticated
USING (
    admin_id = auth.uid()
);

-- Ensure tables have RLS enabled
ALTER TABLE admin_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_extra_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_extra_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_object_rates ENABLE ROW LEVEL SECURITY;
