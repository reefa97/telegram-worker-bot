-- Drop restrictive CHECK constraint on notifications_log.notification_type
-- The check-late-shifts function uses compound types like 'late_10_XXXXXXXX' for per-object deduplication
-- The constraint was preventing log inserts, causing repeat notifications

ALTER TABLE notifications_log
DROP CONSTRAINT IF EXISTS notifications_log_notification_type_check;
