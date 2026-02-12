-- Enhance object_tasks for scheduling and types
ALTER TABLE object_tasks
ADD COLUMN IF NOT EXISTS scheduled_days INTEGER[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS scheduled_dates TEXT[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_special_task BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add openai_key to admin_users if not exists
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS openai_key TEXT DEFAULT NULL;

-- Create index for deleted_at to speed up filtering
CREATE INDEX IF NOT EXISTS idx_object_tasks_deleted_at ON object_tasks(deleted_at);
