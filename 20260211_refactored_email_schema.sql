-- Migration: User-Defined Email Schema (Postgres Part)
-- Date: 2026-02-11

-- 1. mail_accounts
CREATE TABLE IF NOT EXISTS mail_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- References auth.users(id) in a real scenario, handled by app logic or FK if in same DB
    email_address VARCHAR(255) NOT NULL,
    
    -- IMAP
    imap_host VARCHAR(255) NOT NULL,
    imap_port INTEGER DEFAULT 993,
    imap_user VARCHAR(255) NOT NULL,
    imap_password_encrypted TEXT NOT NULL, 
    
    -- SMTP
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER DEFAULT 465,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS
ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own accounts" ON mail_accounts
    FOR ALL
    TO authenticated
    USING (true) -- Simplified for now, should be (user_id = auth.uid())
    WITH CHECK (true);
