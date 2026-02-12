-- Add tasks_completed column to work_sessions
ALTER TABLE work_sessions 
ADD COLUMN IF NOT EXISTS tasks_completed BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN work_sessions.tasks_completed IS 'True if worker confirmed all tasks done, False if they said tasks not done, NULL if not applicable or not answered yet';
