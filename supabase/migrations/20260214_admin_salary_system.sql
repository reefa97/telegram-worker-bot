-- Database schema for Guardian Salary System

-- 1. Guardian Rates per Object
CREATE TABLE IF NOT EXISTS admin_object_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    monthly_rate NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(admin_id, object_id)
);

-- 2. Extra Income (Bonuses, etc., set by Super-Admin)
CREATE TABLE IF NOT EXISTS admin_extra_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    income_date DATE DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Expenses (Reported by Guardians)
CREATE TABLE IF NOT EXISTS admin_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    expense_date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Extra Hours (Reported by Guardians)
CREATE TABLE IF NOT EXISTS admin_extra_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    object_id UUID REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    hours NUMERIC(5, 2) NOT NULL,
    rate NUMERIC(10, 2) NOT NULL,
    work_date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_object_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_extra_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_extra_hours ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Helper to check if user is super admin (assuming the function already exists)
-- If not, we'll use a direct role check in policies

-- Super Admin: Full access to everything
CREATE POLICY "Super Admins can manage all rates" ON admin_object_rates FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Super Admins can manage all extra income" ON admin_extra_income FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Super Admins can manage all expenses" ON admin_expenses FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Super Admins can manage all extra hours" ON admin_extra_hours FOR ALL USING (is_super_admin(auth.uid()));

-- Sub Admin: Read-only for rates and extra income, CRUD for expenses and extra hours
CREATE POLICY "Admins can view own object rates" ON admin_object_rates FOR SELECT USING (admin_id = auth.uid());
CREATE POLICY "Admins can view own extra income" ON admin_extra_income FOR SELECT USING (admin_id = auth.uid());
CREATE POLICY "Admins can manage own expenses" ON admin_expenses FOR ALL USING (admin_id = auth.uid());
CREATE POLICY "Admins can manage own extra hours" ON admin_extra_hours FOR ALL USING (admin_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_admin_object_rates_updated_at
    BEFORE UPDATE ON admin_object_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
