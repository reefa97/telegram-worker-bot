-- Migration: Advanced Email Features (Drafts, Templates, Scheduler)
-- Date: 2026-02-12

-- 1. mail_drafts
CREATE TABLE IF NOT EXISTS mail_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    
    to_address TEXT,
    cc_address TEXT,
    subject TEXT,
    body_html TEXT,
    body_plain TEXT,
    
    attachment_ids UUID[] DEFAULT '{}', 
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. mail_templates
CREATE TABLE IF NOT EXISTS mail_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References auth.users(id) theoretically
    title VARCHAR(255) NOT NULL, 
    
    subject_template TEXT, 
    body_html_template TEXT,
    
    category VARCHAR(50), 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. mail_scheduled
CREATE TABLE IF NOT EXISTS mail_scheduled (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    
    -- Email Data
    to_address TEXT NOT NULL,
    subject TEXT,
    body_html TEXT,
    
    -- Scheduling Data
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    sent_at TIMESTAMP WITH TIME ZONE, 
    
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENDING, SENT, FAILED
    error_log TEXT, 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_time_status ON mail_scheduled(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_drafts_account ON mail_drafts(account_id);
CREATE INDEX IF NOT EXISTS idx_templates_user ON mail_templates(user_id);

-- RLS
ALTER TABLE mail_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_scheduled ENABLE ROW LEVEL SECURITY;

-- Simplified Policies (Allow all authenticated for now)
CREATE POLICY "Admins full access to mail_drafts" ON mail_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access to mail_templates" ON mail_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access to mail_scheduled" ON mail_scheduled FOR ALL TO authenticated USING (true) WITH CHECK (true);
