-- Add profile and Telegram fields to admin_users
ALTER TABLE admin_users 
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
ADD COLUMN IF NOT EXISTS telegram_username TEXT,
ADD COLUMN IF NOT EXISTS invitation_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Add index for invitation token for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_invitation_token ON admin_users(invitation_token);

-- Update RLS policies if necessary (Admins should be able to read all admins to select managers)
-- Existing policy "Admins can view all admin_users" should suffice if it exists.
-- Let's ensure it exists or recreate it safely.
DROP POLICY IF EXISTS "Admins can view admin_users" ON admin_users;
CREATE POLICY "Admins can view admin_users" ON admin_users FOR SELECT USING (auth.uid() IN (SELECT id FROM admin_users));

-- Allow admins to update admin_users (for activation and profile updates)
-- Be careful: We don't want sub-admins editing super-admins.
-- But for now, let's trust the backend logic or existing broad policies, 
-- or add a specific one for "Self update" or "Super admin update".
-- Simpler approach: Allow update if you are a super_admin OR if it's your own user.
DROP POLICY IF EXISTS "Admins can update admin_users" ON admin_users;
CREATE POLICY "Admins can update admin_users" ON admin_users FOR UPDATE USING (
    -- Can update if Super Admin
    (SELECT role FROM admin_users WHERE id = auth.uid()) = 'super_admin'
    OR
    -- Can update own profile
    auth.uid() = id
    OR
    -- Can update if created_by matches (Sub-Admin managing their creations)
    created_by = auth.uid()
);
