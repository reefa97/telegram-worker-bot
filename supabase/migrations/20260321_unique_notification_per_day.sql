-- Prevent duplicate notifications per worker per type per day (race condition fix)

-- Helper: immutable date extraction for use in unique index
CREATE OR REPLACE FUNCTION notif_date(ts TIMESTAMPTZ)
RETURNS DATE AS $$
  SELECT ts::date;
$$ LANGUAGE sql IMMUTABLE;

-- Remove existing duplicates keeping only the earliest per group
DELETE FROM notifications_log a
USING notifications_log b
WHERE a.id > b.id
  AND a.worker_id = b.worker_id
  AND a.notification_type = b.notification_type
  AND notif_date(a.sent_at) = notif_date(b.sent_at);

-- Create unique index on (worker_id, notification_type, date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_log_unique_per_day
ON notifications_log(worker_id, notification_type, notif_date(sent_at));
