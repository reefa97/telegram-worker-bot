-- Create table for corporate credit transactions (deposits/withdrawals)
CREATE TABLE IF NOT EXISTS admin_corporate_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL, -- Positive for add, Negative for deduct
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- RLS Policies
ALTER TABLE admin_corporate_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can manage corporate credits" ON admin_corporate_credits
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Admins can view their own corporate credits" ON admin_corporate_credits
    FOR SELECT
    TO authenticated
    USING (
        admin_id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM admin_users
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Index for faster queries
CREATE INDEX idx_corporate_credits_admin_date ON admin_corporate_credits(admin_id, transaction_date);

-- Migrate existing limits to transactions (Optional, best effort)
-- We insert the 'amount' from admin_monthly_limits as a credit transaction on the 1st of that month
INSERT INTO admin_corporate_credits (admin_id, amount, transaction_date, description)
SELECT 
    admin_id, 
    amount, 
    month_date, 
    'Initial Limit Migration'
FROM admin_monthly_limits;

-- Drop the old table as it is replaced by the transaction system
DROP TABLE IF EXISTS admin_monthly_limits;
