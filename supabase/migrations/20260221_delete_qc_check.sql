-- RPC to delete a quality check and reverse worker points
CREATE OR REPLACE FUNCTION delete_quality_check(p_check_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
BEGIN
    -- 1. Identify all point changes associated with this check and reverse them
    -- We use a loop to ensure each worker's points are updated correctly
    FOR r IN (SELECT worker_id, points_change FROM worker_points_log WHERE check_id = p_check_id) LOOP
        UPDATE workers
        SET total_points = GREATEST(0, total_points - r.points_change)
        WHERE id = r.worker_id;
    END LOOP;

    -- 2. Delete point logs associated with this check
    DELETE FROM worker_points_log WHERE check_id = p_check_id;

    -- 3. Delete the check (this will cascade delete quality_check_items and photo records if they target this check)
    DELETE FROM quality_checks WHERE id = p_check_id;
END;
$$;
