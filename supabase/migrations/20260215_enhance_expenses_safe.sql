-- Add reimbursement and receipt fields to admin_expenses
ALTER TABLE admin_expenses ADD COLUMN IF NOT EXISTS is_reimbursement BOOLEAN DEFAULT FALSE;
ALTER TABLE admin_expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
