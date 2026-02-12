-- Add created_by and is_shared to mail_accounts
ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- Note: is_active is already there for soft delete.
-- is_shared = true means sub-admins can see it if the Super Admin allowed it?
-- The user said: "super админ мог открывать и скрывать аккануты от глаз суб-админов"
-- So if is_shared is false, only Super Admins (and the owner) see it.
-- If is_shared is true, maybe target users or all sub-admins see it. 
-- Let's stick to is_shared for "visible to sub-admins". 
