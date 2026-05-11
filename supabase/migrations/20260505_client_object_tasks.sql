-- RPC: Get all tasks (zakres prac) for client's objects
DROP FUNCTION IF EXISTS get_client_object_tasks(uuid);

CREATE OR REPLACE FUNCTION get_client_object_tasks(p_client_id UUID)
RETURNS TABLE (
  task_id UUID,
  object_id UUID,
  object_name TEXT,
  title TEXT,
  description TEXT,
  scheduled_days INT[],
  scheduled_dates TEXT[],
  is_recurring BOOLEAN,
  frequency TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS task_id,
    co.id AS object_id,
    co.name::TEXT AS object_name,
    t.title::TEXT,
    COALESCE(t.description, '')::TEXT AS description,
    t.scheduled_days,
    t.scheduled_dates,
    COALESCE(t.is_recurring, true) AS is_recurring,
    COALESCE(t.frequency, 'weekly')::TEXT AS frequency
  FROM object_tasks t
  JOIN cleaning_objects co ON t.object_id = co.id
  WHERE t.object_id IN (
    SELECT clo.object_id FROM client_objects clo WHERE clo.client_id = p_client_id
  )
  AND t.is_active = true
  AND t.deleted_at IS NULL
  ORDER BY co.name, t.task_order, t.title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
