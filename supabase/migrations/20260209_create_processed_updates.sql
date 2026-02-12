-- Migration: Create processed_updates table for Telegram Bot idempotency
-- Date: 2026-02-09
-- Description: Stores Telegram update_ids to prevent duplicate processing of the same message.

CREATE TABLE IF NOT EXISTS processed_updates (
    update_id BIGINT PRIMARY KEY,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for cleanups (we will need to clean old records periodically)
CREATE INDEX IF NOT EXISTS idx_processed_updates_time ON processed_updates(processed_at);

-- Enable RLS (Service Role only needs access usually, but good practice)
ALTER TABLE processed_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON processed_updates
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to clean up old updates (keep last 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_updates()
RETURNS void AS $$
BEGIN
    DELETE FROM processed_updates
    WHERE processed_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (optional, or just rely on manual/cron cleanup later)
-- For now, just the table is enough.
