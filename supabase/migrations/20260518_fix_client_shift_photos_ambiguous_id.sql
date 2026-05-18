-- ========================================
-- Hotfix: get_client_shift_photos ambiguous "id"
-- ========================================
-- Client portal modal "Zobacz zdjęcia (N)" rendered empty for every
-- session even when get_client_schedule reported a non-zero
-- photo_count. The function raised PostgREST error 42702:
--   column reference "id" is ambiguous (PL/pgSQL variable or table column)
-- because RETURNS TABLE declares an OUT parameter named `id`, while
-- the SELECT body referenced `sp.id` from shift_photos. Same class of
-- bug we fixed earlier in get_client_schedule.
--
-- Fix: keep the OUT names (frontend reads { id, photo_url, photo_type,
-- uploaded_at }), but qualify every reference inside the SELECT with
-- the table alias and an explicit AS, plus fully-qualify admin_users
-- columns in the security guard.
-- ========================================

DROP FUNCTION IF EXISTS get_client_shift_photos(UUID, UUID);

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
    WHERE admin_users.id = auth.uid()
    AND admin_users.role IN ('super_admin', 'sub_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: p_client_id must match auth.uid()';
  END IF;

  RETURN QUERY
  SELECT
    sp.id           AS id,
    sp.photo_url    AS photo_url,
    sp.photo_type   AS photo_type,
    sp.uploaded_at  AS uploaded_at
  FROM shift_photos sp
  JOIN work_sessions ws ON ws.id = sp.session_id
  JOIN client_objects clo
    ON clo.object_id = ws.object_id
   AND clo.client_id = p_client_id
  WHERE sp.session_id = p_session_id
  ORDER BY sp.uploaded_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_client_shift_photos(UUID, UUID) TO authenticated;
