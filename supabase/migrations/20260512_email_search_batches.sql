-- ========================================
-- Email Search: AI-expanded batches
-- ========================================
-- Groups multiple sub-queries that originated from a single user input
-- (topic + location) which an AI agent expanded into 5-20 Serper-friendly
-- queries. The python worker runs each sub-query as a normal job; the
-- frontend groups results back together by batch_id.
-- ========================================

ALTER TABLE email_search_jobs
  ADD COLUMN IF NOT EXISTS batch_id UUID,
  ADD COLUMN IF NOT EXISTS batch_topic TEXT,
  ADD COLUMN IF NOT EXISTS batch_location TEXT;

CREATE INDEX IF NOT EXISTS idx_email_search_jobs_batch_id
  ON email_search_jobs(batch_id);
