-- Fix RLS Policies for Advanced Features

-- 1. Enable RLS on new tables
ALTER TABLE scheduled_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;

-- 2. Create Policies for scheduled_shifts
CREATE POLICY "Enable all access for authenticated users" ON scheduled_shifts
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Create Policies for shift_photos
CREATE POLICY "Enable all access for authenticated users" ON shift_photos
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Create Policies for object_tasks
CREATE POLICY "Enable all access for authenticated users" ON object_tasks
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. Create Policies for session_tasks
CREATE POLICY "Enable all access for authenticated users" ON session_tasks
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 6. Create Policies for notifications_log
CREATE POLICY "Enable all access for authenticated users" ON notifications_log
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 7. Allow public read access to shift_photos (if needed for public URLs, though storage handles the file access)
-- The table reference itself might need to be readable if we share links, but for now authenticated is enough for admin panel.
