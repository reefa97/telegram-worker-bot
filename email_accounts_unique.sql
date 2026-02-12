-- 1. Remove duplicates, keeping the most recent one (or just one)
DELETE FROM mail_accounts
WHERE id NOT IN (
    SELECT id
    FROM (
        SELECT id,
        ROW_NUMBER() OVER (PARTITION BY email_address ORDER BY created_at DESC) as row_num
        FROM mail_accounts
    ) t
    WHERE t.row_num = 1
);

-- 2. Add Unique constraint
ALTER TABLE mail_accounts ADD CONSTRAINT unique_email_address UNIQUE (email_address);

-- 3. Ensure is_active exists and has default (it was already in model, but let's be sure)
-- If it doesn't exist:
-- ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
-- UPDATE mail_accounts SET is_active = true WHERE is_active IS NULL;
