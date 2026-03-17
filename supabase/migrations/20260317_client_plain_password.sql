-- Store plain password for client accounts so super_admin can view/reset it
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS plain_password text;
