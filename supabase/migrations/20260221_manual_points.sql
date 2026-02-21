-- Migration: 20260221_manual_points
-- Description: Adds RPC function to manually adjust worker points

-- 1. Create RPC for manual points adjustment
CREATE OR REPLACE FUNCTION manual_adjust_points(
    p_worker_id UUID,
    p_points_change INTEGER,
    p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only allow admins (or specifically super_admins, checked via app logic or here)
    IF NOT EXISTS (
        SELECT 1 FROM current_setting('request.jwt.claims')::json->>'role' = 'authenticated'
        AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
    ) THEN
        -- Fallback check for session
        IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin') THEN
            RAISE EXCEPTION 'Only super_admin can manually adjust points';
        END IF;
    END IF;

    -- Update the worker's total points
    UPDATE workers
    SET total_points = COALESCE(total_points, 0) + p_points_change
    WHERE id = p_worker_id;

    -- Insert log entry
    INSERT INTO worker_points_log (
        worker_id,
        points_change,
        reason
    ) VALUES (
        p_worker_id,
        p_points_change,
        p_reason
    );
END;
$$;

-- Grant execution to authenticated users (the function itself checks for super_admin)
GRANT EXECUTE ON FUNCTION manual_adjust_points(UUID, INTEGER, TEXT) TO authenticated;
