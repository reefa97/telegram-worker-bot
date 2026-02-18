-- Create table for tracking monthly limits (Corporate Credit)
CREATE TABLE IF NOT EXISTS admin_monthly_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month_date DATE NOT NULL, -- First day of the month (e.g., '2026-02-01')
    amount NUMERIC(10, 2) DEFAULT 0,
    credit_type TEXT DEFAULT 'corporate_credit',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(admin_id, month_date, credit_type)
);

-- RLS Policies
ALTER TABLE admin_monthly_limits ENABLE ROW LEVEL SECURITY;

-- Super Admins can manage everything
CREATE POLICY "Super Admins can manage monthly limits" ON admin_monthly_limits
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Admins can view their own limits
CREATE POLICY "Admins can view their own monthly limits" ON admin_monthly_limits
    FOR SELECT
    TO authenticated
    USING (
        admin_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Add indexes
CREATE INDEX idx_admin_monthly_limits_admin_date ON admin_monthly_limits(admin_id, month_date);
