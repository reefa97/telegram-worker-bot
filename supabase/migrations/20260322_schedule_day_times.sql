-- Per-day schedule time overrides
-- Format: {"1": "08:00", "3": "10:00"} where keys are day numbers
-- Days not listed use the global schedule_time_start
ALTER TABLE cleaning_objects
ADD COLUMN IF NOT EXISTS schedule_day_times JSONB DEFAULT '{}'::jsonb;
