-- Add manager assignment to cleaning_objects
ALTER TABLE cleaning_objects
ADD COLUMN IF NOT EXISTS manager_chat_id TEXT,
ADD COLUMN IF NOT EXISTS manager_name TEXT;

-- Comment
COMMENT ON COLUMN cleaning_objects.manager_chat_id IS 'Telegram Chat ID of the manager responsible for this object (receives photo reports)';
