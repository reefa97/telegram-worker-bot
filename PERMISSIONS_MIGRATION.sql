-- Add permissions column to admin_users
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Update existing sub-admins to have default read permissions (optional, but good for safety)
-- UPDATE admin_users SET permissions = '{"workers_read": true, "objects_read": true, "reports_read": true}'::jsonb WHERE role = 'sub_admin';
