-- ========================================
-- SECURITY: Add auth.uid() guard to client portal RPCs
-- ========================================
-- Functions get_client_schedule, get_client_guardians,
-- get_client_planned_schedules, get_client_shift_photos all accepted
-- p_client_id as a parameter without verifying it matches auth.uid().
-- That meant any authenticated client could read another client's
-- schedule, photos and guardian contact info by passing their UUID.
--
-- This migration adds a guard at the top of each function:
--   IF p_client_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden';
-- Admins (super_admin/sub_admin/manager) bypass the guard so they can
-- still query data for any client they manage.
-- ========================================

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
  IF p_client_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'sub_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: p_client_id must match auth.uid()';
  END IF;

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

DROP FUNCTION IF EXISTS get_client_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_client_schedule(
  p_client_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  session_id UUID,
  object_id UUID,
  object_name TEXT,
  worker_name TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INT,
  photo_count INT
) AS $$
BEGIN
  IF p_client_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'sub_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: p_client_id must match auth.uid()';
  END IF;

  RETURN QUERY
  SELECT
    ws.id AS session_id,
    co.id AS object_id,
    co.name AS object_name,
    COALESCE(w.first_name || ' ' || w.last_name, 'Nieznany') AS worker_name,
    ws.start_time,
    COALESCE(ws.end_time, sp.last_photo_at) AS end_time,
    COALESCE(
      ws.duration_minutes,
      CASE
        WHEN sp.last_photo_at IS NOT NULL
          THEN GREATEST(0, (EXTRACT(EPOCH FROM (sp.last_photo_at - ws.start_time)) / 60)::INT)
        ELSE NULL
      END
    ) AS duration_minutes,
    COALESCE(sp.cnt, 0)::INT AS photo_count
  FROM work_sessions ws
  JOIN cleaning_objects co ON ws.object_id = co.id
  LEFT JOIN workers w ON ws.worker_id = w.id
  LEFT JOIN (
    SELECT
      shift_photos.session_id AS sid,
      COUNT(*)::INT AS cnt,
      MAX(shift_photos.uploaded_at) AS last_photo_at
    FROM shift_photos
    GROUP BY shift_photos.session_id
  ) sp ON sp.sid = ws.id
  WHERE ws.object_id IN (
    SELECT clo.object_id FROM client_objects clo WHERE clo.client_id = p_client_id
  )
  AND ws.start_time >= p_from
  AND ws.start_time <= p_to
  ORDER BY ws.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_client_planned_schedules(p_client_id UUID)
RETURNS TABLE (
  object_id UUID,
  object_name TEXT,
  schedule_days INT[],
  time_start TEXT,
  time_end TEXT
) AS $$
BEGIN
  IF p_client_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'sub_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: p_client_id must match auth.uid()';
  END IF;

  RETURN QUERY
  SELECT
    co.id AS object_id,
    co.name::TEXT AS object_name,
    co.schedule_days,
    co.schedule_time_start::TEXT AS time_start,
    co.schedule_time_end::TEXT AS time_end
  FROM client_objects clo
  JOIN cleaning_objects co ON clo.object_id = co.id
  WHERE clo.client_id = p_client_id
  AND co.is_active = true
  AND co.schedule_days IS NOT NULL
  AND array_length(co.schedule_days, 1) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_client_shift_photos(
  p_client_id UUID,
  p_session_id UUID
)
RETURNS TABLE (
  id UUID,
  photo_url TEXT,
  photo_type TEXT,
  uploaded_at TIMESTAMPTZ
) AS $$
BEGIN
  IF p_client_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'sub_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: p_client_id must match auth.uid()';
  END IF;

  RETURN QUERY
  SELECT
    sp.id,
    sp.photo_url,
    sp.photo_type,
    sp.uploaded_at
  FROM shift_photos sp
  JOIN work_sessions ws ON ws.id = sp.session_id
  JOIN client_objects clo
    ON clo.object_id = ws.object_id
   AND clo.client_id = p_client_id
  WHERE sp.session_id = p_session_id
  ORDER BY sp.uploaded_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_client_guardians(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_client_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_client_planned_schedules(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_client_shift_photos(UUID, UUID) TO authenticated;
