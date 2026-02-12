-- Migration: Email Integration System
-- Date: 2026-02-10

-- 1. Create email_accounts table
-- Stores connection details for IMAP/SMTP
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Determine if we link to a specific admin or system-wide. 
    -- If system-wide, created_by points to admin.
    created_by UUID REFERENCES auth.users(id), 
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL, -- Storing plain/base64 for this iteration as agreed
    
    imap_host TEXT NOT NULL,
    imap_port INTEGER NOT NULL DEFAULT 993,
    imap_user TEXT, -- defaults to email if null
    
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER NOT NULL DEFAULT 465,
    smtp_user TEXT, -- defaults to email if null
    
    signature_html TEXT,
    is_active BOOLEAN DEFAULT true,
    
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create email_messages table
-- Stores fetched emails
CREATE TABLE IF NOT EXISTS email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL, -- UID from IMAP
    
    from_name TEXT,
    from_address TEXT NOT NULL,
    to_address TEXT, -- multiple recipients joined by comma
    cc_address TEXT,
    bcc_address TEXT,
    
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_read BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(account_id, remote_id)
);

-- 3. Create email_attachments (Optional for now, but good to have schema)
CREATE TABLE IF NOT EXISTS email_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    storage_path TEXT, -- path in Supabase Storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RLS Policies

-- Enable RLS
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- Policies (Admins have full access)
CREATE POLICY "Admins full access to email_accounts" ON email_accounts
    FOR ALL
    TO authenticated
    USING (true) -- Simplified for admin app
    WITH CHECK (true);

CREATE POLICY "Admins full access to email_messages" ON email_messages
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admins full access to email_attachments" ON email_attachments
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_email_messages_account ON email_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_received ON email_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_remote_id ON email_messages(account_id, remote_id);

-- 6. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_accounts_modtime
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
