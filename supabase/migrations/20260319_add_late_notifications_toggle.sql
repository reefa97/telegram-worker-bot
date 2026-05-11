-- Add toggle for late notifications per object (enabled by default)
ALTER TABLE cleaning_objects
ADD COLUMN IF NOT EXISTS late_notifications_enabled BOOLEAN DEFAULT true;
