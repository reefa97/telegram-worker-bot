-- Add signature fields to mail_accounts
ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS signature_text TEXT;
ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS signature_image_url TEXT;
ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS signature_image_link TEXT;
