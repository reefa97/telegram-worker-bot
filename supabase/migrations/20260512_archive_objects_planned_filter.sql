-- ========================================
-- Hide planned schedules for archived (inactive) objects
-- ========================================
-- Clients whose objects have been moved to "Архив клиентов"
-- (is_active = false) should no longer see future planned cleanings.
-- Historical work_sessions (get_client_schedule) stay visible so old
-- clients can still review past cleanings and photos.
-- ========================================

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

GRANT EXECUTE ON FUNCTION get_client_planned_schedules(UUID) TO authenticated;
