-- Advanced Features Migration
-- Adds: Geofencing, Salary Config, Shift Planning, Photos, Tasks, Notifications

-- 1. Modify cleaning_objects for new features
ALTER TABLE cleaning_objects
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'hourly' CHECK (salary_type IN ('hourly', 'monthly_fixed')),
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_cleanings_per_month INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS requires_photos BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS requires_tasks BOOLEAN DEFAULT false;

-- 2. Modify work_sessions to track geofence violations
ALTER TABLE work_sessions
ADD COLUMN IF NOT EXISTS is_start_in_geofence BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_end_in_geofence BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS start_distance_meters NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS end_distance_meters NUMERIC(10, 2);

-- 3. Create scheduled_shifts table
CREATE TABLE IF NOT EXISTS scheduled_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_id UUID REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create shift_photos table
CREATE TABLE IF NOT EXISTS shift_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES work_sessions(id) ON DELETE CASCADE,
    photo_type TEXT CHECK (photo_type IN ('start', 'end', 'during')),
    photo_url TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create object_tasks table
CREATE TABLE IF NOT EXISTS object_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_id UUID REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    task_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create session_tasks table
CREATE TABLE IF NOT EXISTS session_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES work_sessions(id) ON DELETE CASCADE,
    task_id UUID REFERENCES object_tasks(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create notifications_log table
CREATE TABLE IF NOT EXISTS notifications_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    notification_type TEXT CHECK (notification_type IN ('shift_reminder', 'forgotten_end', 'geofence_violation')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    message TEXT,
    metadata JSONB
);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_worker ON scheduled_shifts(worker_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_object ON scheduled_shifts(object_id);
CREATE INDEX IF NOT EXISTS idx_shift_photos_session ON shift_photos(session_id);
CREATE INDEX IF NOT EXISTS idx_object_tasks_object ON object_tasks(object_id);
CREATE INDEX IF NOT EXISTS idx_session_tasks_session ON session_tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_worker ON notifications_log(worker_id);

-- 9. Add updated_at trigger for new tables
CREATE TRIGGER update_scheduled_shifts_updated_at
    BEFORE UPDATE ON scheduled_shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_object_tasks_updated_at
    BEFORE UPDATE ON object_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
