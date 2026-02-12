-- Migration: Email Search Admin Schema
-- Date: 2026-02-07

-- 1. Add serper_token column to admin_users table
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS serper_token TEXT;

-- 2. Drop old tables if they exist (cleanup from previous attempt)
DROP TABLE IF EXISTS email_search_results;
DROP TABLE IF EXISTS email_search_jobs;

-- 3. Create email_search_jobs table linked to admin_users
CREATE TABLE IF NOT EXISTS email_search_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, stopped, completed, failed
    total_emails_found INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stopped_at TIMESTAMP WITH TIME ZONE
);

-- 4. Create email_search_results table
CREATE TABLE IF NOT EXISTS email_search_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES email_search_jobs(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE email_search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_search_results ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Admins can view/edit their own jobs
CREATE POLICY "Admins can view own search jobs" ON email_search_jobs
    FOR ALL USING (admin_id = auth.uid());

CREATE POLICY "Admins can view own search results" ON email_search_results
    FOR ALL USING (
        job_id IN (
            SELECT id FROM email_search_jobs WHERE admin_id = auth.uid()
        )
    );
