-- Add timestamp columns for worker tracking
ALTER TABLE email_search_jobs 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMPTZ;
