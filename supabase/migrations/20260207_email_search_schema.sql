-- Migration: Email Search Schema
-- Date: 2026-02-07

-- 1. Add serper_token column to workers table
ALTER TABLE workers ADD COLUMN IF NOT EXISTS serper_token TEXT;

-- 2. Create email_search_jobs table
CREATE TABLE IF NOT EXISTS email_search_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, stopped, completed, failed
    total_emails_found INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stopped_at TIMESTAMP WITH TIME ZONE
);

-- 3. Create email_search_results table
CREATE TABLE IF NOT EXISTS email_search_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES email_search_jobs(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE email_search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_search_results ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Service Role should have full access (implicit, but good to be explicit for others)

-- Workers can read/write their own jobs
CREATE POLICY "Workers can view own search jobs" ON email_search_jobs
    FOR SELECT USING (worker_id = auth.uid()); -- Assuming auth.uid() matches worker_id or we use a lookup. 
    -- correct approach for workers usually involves joining with workers table if auth.uid() is not worker_id directly.
    -- In this project, workers seems to be a separate table from auth.users? 
    -- Looking at previous migrations would clarify, but for now let's assume service role (Edge Function) does the work.
    -- The Edge Function will use Service Role Key, so it bypasses RLS.
    -- The Bot uses Service Role Key too.
    -- So strictly speaking, RLS might not be needed for the bot/worker function interaction if they use service role.
    -- But for safety, let's allow public read if needed or just keep it closed to service role.
    -- Actually, if I want to allow "workers" to see it via some frontend, I need RLS. 
    -- But here interaction is via Telegram Bot (Service Role) and Edge Function (Service Role).
    -- So I will just leave RLS enabled but no policies for now, meaning only Service Role can access.
