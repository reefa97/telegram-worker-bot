-- ========================================
-- Client Portal: Shift Photos Access
-- ========================================
-- 1. Extend get_client_schedule with photo_count per session
-- 2. New RPC get_client_shift_photos: returns photos only for sessions
--    whose object belongs to the requesting client.
-- ========================================

-- 1. get_client_schedule: add photo_count
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
  RETURN QUERY
  SELECT
    ws.id AS session_id,
    co.id AS object_id,
    co.name AS object_name,
    COALESCE(w.first_name || ' ' || w.last_name, 'Nieznany') AS worker_name,
    ws.start_time,
    ws.end_time,
    ws.duration_minutes,
    COALESCE(sp.cnt, 0)::INT AS photo_count
  FROM work_sessions ws
  JOIN cleaning_objects co ON ws.object_id = co.id
  LEFT JOIN workers w ON ws.worker_id = w.id
  LEFT JOIN (
    SELECT shift_photos.session_id AS sid, COUNT(*)::INT AS cnt
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

-- 2. get_client_shift_photos: returns photos for a given session,
--    but ONLY if the session's object is linked to this client.
--    Otherwise returns an empty set (no leakage of foreign objects).
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

GRANT EXECUTE ON FUNCTION get_client_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_client_shift_photos(UUID, UUID) TO authenticated;
