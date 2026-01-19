-- ENABLE LOGS INSERT FOR ADMINS
-- Allows admin panel to write to system_logs (e.g. for bulk message tracking)

-- 1. Ensure table exists (idempotent check)
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  object_id UUID REFERENCES cleaning_objects(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- 2. Add Insert Policy for Admins
DROP POLICY IF EXISTS "Admins can create logs" ON system_logs;
CREATE POLICY "Admins can create logs" ON system_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Only allow if user is an admin
        EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
    );

-- 3. Ensure Select Policy exists
DROP POLICY IF EXISTS "Admins can view logs" ON system_logs;
CREATE POLICY "Admins can view logs" ON system_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
    );
