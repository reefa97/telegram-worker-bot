-- Migration for Task Management System

-- Add scheduling columns to object_tasks
ALTER TABLE object_tasks
ADD COLUMN IF NOT EXISTS scheduled_days INTEGER[], -- Array of integers 0-6 (Sunday-Saturday)
ADD COLUMN IF NOT EXISTS scheduled_dates TEXT[], -- Array of strings 'YYYY-MM-DD' (using TEXT for simplicity in Postgres arrays, or DATE[])
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT true, -- If true, uses scheduled_days. If false, uses scheduled_dates
ADD COLUMN IF NOT EXISTS is_special_task BOOLEAN DEFAULT false; -- Special tasks trigger proactive reminders

-- Comments
COMMENT ON COLUMN object_tasks.scheduled_days IS 'Array of days of week (0=Sun, 6=Sat) when this task should be performed';
COMMENT ON COLUMN object_tasks.scheduled_dates IS 'Array of specific dates (YYYY-MM-DD) for non-recurring tasks';
COMMENT ON COLUMN object_tasks.is_special_task IS 'If true, this is a special service (e.g. window cleaning) requiring reminders';
