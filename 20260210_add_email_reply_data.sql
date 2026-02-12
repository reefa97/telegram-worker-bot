-- Migration: Add email_reply_data to workers
-- Date: 2026-02-10

ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS email_reply_data JSONB;
