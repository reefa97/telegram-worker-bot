-- Migration: Migrate Email Storage to Postgres
-- Date: 2026-02-12

-- 1. Create mail_folders table
CREATE TABLE IF NOT EXISTS mail_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    remote_name TEXT NOT NULL,
    delimiter TEXT DEFAULT '/',
    last_uid_validity BIGINT,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, remote_name)
);

-- 2. Update/Create email_messages
-- We will use the existing email_messages table but add missing columns
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS snippet TEXT;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS has_attachments BOOLEAN DEFAULT false;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS size INTEGER;

-- Ensure received_at is used as the primary time field
-- remote_id is the IMAP UID

-- 3. Create email_bodies
CREATE TABLE IF NOT EXISTS email_bodies (
    email_id UUID PRIMARY KEY REFERENCES email_messages(id) ON DELETE CASCADE,
    body_plain TEXT,
    body_html TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_messages_folder ON email_messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_account_received ON email_messages(account_id, received_at DESC);

-- Enable RLS for the new table
ALTER TABLE mail_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_bodies ENABLE ROW LEVEL SECURITY;

-- Policies for mail_folders
CREATE POLICY "Admins full access to mail_folders" ON mail_folders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Policies for email_bodies
CREATE POLICY "Admins full access to email_bodies" ON email_bodies
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
