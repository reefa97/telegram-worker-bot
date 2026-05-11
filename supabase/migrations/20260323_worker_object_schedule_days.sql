-- Per-worker schedule days override on object assignments
-- If NULL, worker works all days of the object's schedule
-- Format: array of day numbers [1,2,3,4,5,6,7] where 1=Mon, 7=Sun
ALTER TABLE worker_objects
ADD COLUMN IF NOT EXISTS schedule_days INTEGER[];
