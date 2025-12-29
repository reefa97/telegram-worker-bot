-- Function to get tasks for an object, bypassing RLS
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_object_tasks_secure(target_object_id UUID)
RETURNS TABLE (
    title TEXT,
    is_special_task BOOLEAN,
    is_active BOOLEAN,
    scheduled_days INTEGER[],
    scheduled_dates TEXT[],
    is_recurring BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ot.title,
        ot.is_special_task,
        ot.is_active,
        ot.scheduled_days,
        ot.scheduled_dates,
        ot.is_recurring
    FROM object_tasks ot
    WHERE ot.object_id = target_object_id
      AND ot.is_active = true;
END;
$$;
