-- Fix notifications_log CHECK constraint to allow new late alert milestone types
ALTER TABLE notifications_log
DROP CONSTRAINT IF EXISTS notifications_log_notification_type_check;

ALTER TABLE notifications_log
ADD CONSTRAINT notifications_log_notification_type_check
CHECK (notification_type IN (
  'shift_reminder',
  'forgotten_end',
  'geofence_violation',
  'late_start_alert',
  'client_call_reminder',
  'late_10',
  'late_20',
  'late_30'
));
