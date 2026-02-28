-- ========================================
-- FIX_POINTS_SYSTEM.sql
-- ========================================

-- 1. Fix manual_adjust_points (Corrected Security & Logic)
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
    -- Corrected security check using the helper function
    IF NOT is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only super_admin can manually adjust points';
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

-- 2. Improve distribute_quality_points (Include active workers and handle first checks better)
CREATE OR REPLACE FUNCTION distribute_quality_points(
  p_check_id UUID,
  p_object_id UUID,
  p_score INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prev_check_date TIMESTAMPTZ;
  v_current_check_date TIMESTAMPTZ;
  v_points_change INT;
  v_reason TEXT;
  v_worker_id UUID;
  v_count INT := 0;
  v_result JSONB;
BEGIN
  -- Get current check date
  SELECT check_date INTO v_current_check_date
    FROM quality_checks WHERE id = p_check_id;

  IF v_current_check_date IS NULL THEN
    RETURN jsonb_build_object('error', 'Check not found', 'workers_affected', 0);
  END IF;

  -- Find previous check date for this object
  SELECT check_date INTO v_prev_check_date
    FROM quality_checks
    WHERE object_id = p_object_id
      AND id != p_check_id
      AND check_date < v_current_check_date
    ORDER BY check_date DESC
    LIMIT 1;

  -- If no previous check, use a long window (e.g. 7 days or object discovery)
  -- The previous logic used '30 days' which might be too long if we want to be "fair" 
  -- but safe enough for a first check.
  IF v_prev_check_date IS NULL THEN
     v_prev_check_date := v_current_check_date - INTERVAL '7 days';
  END IF;

  -- Determine points and reason based on score
  IF p_score >= 90 THEN
    v_points_change := 10;
    v_reason := 'Отличная чистота (' || p_score || '%)';
  ELSIF p_score >= 80 THEN
    v_points_change := 5;
    v_reason := 'Хорошая чистота (' || p_score || '%)';
  ELSIF p_score >= 50 THEN
    v_points_change := -5;
    v_reason := 'Нужно улучшить (' || p_score || '%)';
  ELSE
    v_points_change := -10;
    v_reason := 'Низкая чистота (' || p_score || '%)';
  END IF;

  -- Find workers who were active on this object during the period
  -- Condition: shift started before check ended AND (still active OR finished after period started)
  FOR v_worker_id IN
    SELECT DISTINCT ws.worker_id
    FROM work_sessions ws
    WHERE ws.object_id = p_object_id
      AND ws.start_time <= v_current_check_date
      AND (ws.end_time IS NULL OR ws.end_time >= v_prev_check_date)
  LOOP
    -- Insert points log entry
    INSERT INTO worker_points_log (
      worker_id, check_id, points_change, reason,
      work_period_start, work_period_end
    ) VALUES (
      v_worker_id, p_check_id, v_points_change, v_reason,
      v_prev_check_date, v_current_check_date
    );

    -- Update worker total_points (ensure it doesn't go below 0)
    UPDATE workers
      SET total_points = GREATEST(0, COALESCE(total_points, 0) + v_points_change)
      WHERE id = v_worker_id;

    v_count := v_count + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'workers_affected', v_count,
    'points_change', v_points_change,
    'period_start', v_prev_check_date,
    'period_end', v_current_check_date
  );

  RETURN v_result;
END;
$$;
