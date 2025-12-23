-- Create a new table to link objects to multiple managers
CREATE TABLE IF NOT EXISTS object_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    manager_chat_id TEXT NOT NULL,
    manager_name TEXT, -- Optional, for faster display
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(object_id, manager_chat_id)
);

-- Check if old columns exist and migrate data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cleaning_objects' AND column_name = 'manager_chat_id') THEN
        INSERT INTO object_managers (object_id, manager_chat_id, manager_name)
        SELECT id, manager_chat_id, manager_name
        FROM cleaning_objects
        WHERE manager_chat_id IS NOT NULL AND manager_chat_id != '';
    END IF;
END $$;

-- Enable RLS
ALTER TABLE object_managers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view object managers" ON object_managers
    FOR SELECT USING (
        auth.uid() IN (SELECT id FROM admin_users)
    );

CREATE POLICY "Admins can manage object managers" ON object_managers
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM admin_users)
    );
