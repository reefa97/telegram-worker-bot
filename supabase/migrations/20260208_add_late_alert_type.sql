
-- Update notifications_log to allow 'late_start_alert' type
-- We need to drop the existing check constraint and add a new one with the extended list.

ALTER TABLE notifications_log 
DROP CONSTRAINT IF EXISTS notifications_log_notification_type_check;

ALTER TABLE notifications_log 
ADD CONSTRAINT notifications_log_notification_type_check 
CHECK (notification_type IN ('shift_reminder', 'forgotten_end', 'geofence_violation', 'late_start_alert'));
