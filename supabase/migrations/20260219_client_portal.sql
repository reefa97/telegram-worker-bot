-- ========================================
-- Client Portal Migration
-- Creates client_objects and client_requests tables
-- ========================================

-- 0. Update role constraint to allow 'client'
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('super_admin', 'sub_admin', 'manager', 'client'));
-- ========================================

-- 1. client_objects — links clients to cleaning objects
CREATE TABLE IF NOT EXISTS client_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, object_id)
);

-- RLS
ALTER TABLE client_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client_objects" ON client_objects
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 2. client_requests — stores client requests/tasks
CREATE TABLE IF NOT EXISTS client_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES admin_users(id)
);

-- RLS
ALTER TABLE client_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own requests" ON client_requests
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Clients can insert own requests" ON client_requests
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can update requests" ON client_requests
FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

-- 3. RPC: Get guardian info for a client's objects
CREATE OR REPLACE FUNCTION get_client_guardians(p_client_id UUID)
RETURNS TABLE (
  object_id UUID,
  object_name TEXT,
  object_address TEXT,
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    co.id AS object_id,
    co.name AS object_name,
    co.address AS object_address,
    au.name AS guardian_name,
    au.email AS guardian_email,
    au.phone AS guardian_phone
  FROM client_objects clo
  JOIN cleaning_objects co ON clo.object_id = co.id
  LEFT JOIN object_owners oo ON oo.object_id = co.id
  LEFT JOIN admin_users au ON oo.admin_id = au.id
  WHERE clo.client_id = p_client_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Get client schedule (work sessions for client's objects)
CREATE OR REPLACE FUNCTION get_client_schedule(p_client_id UUID, p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  session_id UUID,
  object_id UUID,
  object_name TEXT,
  worker_name TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ws.id AS session_id,
    co.id AS object_id,
    co.name AS object_name,
    COALESCE(w.first_name || ' ' || w.last_name, 'Nieznany') AS worker_name,
    ws.start_time,
    ws.end_time,
    ws.duration_minutes
  FROM work_sessions ws
  JOIN cleaning_objects co ON ws.object_id = co.id
  LEFT JOIN workers w ON ws.worker_id = w.id
  WHERE ws.object_id IN (
    SELECT clo.object_id FROM client_objects clo WHERE clo.client_id = p_client_id
  )
  AND ws.start_time >= p_from
  AND ws.start_time <= p_to
  ORDER BY ws.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add phone column to admin_users if not exists
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone TEXT;

-- 6. RPC: Get planned schedules for a client's objects
CREATE OR REPLACE FUNCTION get_client_planned_schedules(p_client_id UUID)
RETURNS TABLE (
  object_id UUID,
  object_name TEXT,
  schedule_days INT[],
  time_start TEXT,
  time_end TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    co.id AS object_id,
    co.name AS object_name,
    co.schedule_days,
    co.schedule_time_start AS time_start,
    co.schedule_time_end AS time_end
  FROM client_objects clo
  JOIN cleaning_objects co ON clo.object_id = co.id
  WHERE clo.client_id = p_client_id
  AND co.schedule_days IS NOT NULL
  AND array_length(co.schedule_days, 1) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
