-- 1. Fix the CHECK constraint to allow 'late_start_alert'
ALTER TABLE notifications_log
DROP CONSTRAINT IF EXISTS notifications_log_notification_type_check;

ALTER TABLE notifications_log
ADD CONSTRAINT notifications_log_notification_type_check 
CHECK (notification_type IN ('shift_reminder', 'forgotten_end', 'geofence_violation', 'late_start_alert'));

-- 2. Check logs (using correct column sent_at)
select * from notifications_log order by sent_at desc limit 20;

-- 3. Check system errors
select * from system_logs where level = 'error' order by created_at desc limit 20;
