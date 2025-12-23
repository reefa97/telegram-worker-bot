-- Add schedule fields to cleaning_objects
ALTER TABLE cleaning_objects
ADD COLUMN IF NOT EXISTS schedule_days INTEGER[] DEFAULT '{}', -- 0=Sun, 1=Mon, etc.
ADD COLUMN IF NOT EXISTS schedule_time_start TIME DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS schedule_time_end TIME DEFAULT '18:00';

-- Comment explaining the fields
COMMENT ON COLUMN cleaning_objects.schedule_days IS 'Array of days of week (0-6) when cleaning is performed';
COMMENT ON COLUMN cleaning_objects.schedule_time_start IS 'Start time of the cleaning shift';
COMMENT ON COLUMN cleaning_objects.schedule_time_end IS 'End time of the cleaning shift';
