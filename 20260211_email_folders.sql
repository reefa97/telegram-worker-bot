-- Migration: support for email folders(inbox/sent)
-- Date: 2026-02-11

-- 1. Add folder column
ALTER TABLE email_messages 
ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT 'inbox';

-- 2. Drop old constraint and add new one
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_account_id_remote_id_key') THEN
        ALTER TABLE email_messages DROP CONSTRAINT email_messages_account_id_remote_id_key;
    END IF;
END $$;

-- 3. Add new unique constraint
ALTER TABLE email_messages 
ADD CONSTRAINT email_messages_account_id_remote_id_folder_key UNIQUE (account_id, remote_id, folder);

-- 4. Add index for faster querying by folder
CREATE INDEX IF NOT EXISTS idx_email_messages_folder ON email_messages(folder);
