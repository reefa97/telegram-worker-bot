-- ========================================
-- Fair Points Distribution: only workers who worked get points
-- ========================================

-- 1. Add work_period columns to worker_points_log
ALTER TABLE worker_points_log
  ADD COLUMN IF NOT EXISTS work_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_period_end TIMESTAMPTZ;

-- 2. Index for efficient work_sessions lookup
CREATE INDEX IF NOT EXISTS idx_work_sessions_object_start
  ON work_sessions(object_id, start_time);

-- 3. RPC function: distribute points to workers who actually worked
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
  v_object_created TIMESTAMPTZ;
  v_points_change INT;
  v_reason TEXT;
  v_worker RECORD;
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

  -- If no previous check, use object creation date
  IF v_prev_check_date IS NULL THEN
    SELECT created_at INTO v_object_created
      FROM cleaning_objects WHERE id = p_object_id;
    v_prev_check_date := COALESCE(v_object_created, v_current_check_date - INTERVAL '30 days');
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

  -- Find workers who had completed shifts in this period
  FOR v_worker IN
    SELECT DISTINCT ws.worker_id
    FROM work_sessions ws
    WHERE ws.object_id = p_object_id
      AND ws.start_time >= v_prev_check_date
      AND ws.start_time <= v_current_check_date
      AND ws.end_time IS NOT NULL  -- only completed shifts
  LOOP
    -- Insert points log entry
    INSERT INTO worker_points_log (
      worker_id, check_id, points_change, reason,
      work_period_start, work_period_end
    ) VALUES (
      v_worker.worker_id, p_check_id, v_points_change, v_reason,
      v_prev_check_date, v_current_check_date
    );

    -- Update worker total_points (don't go below 0)
    UPDATE workers
      SET total_points = GREATEST(0, total_points + v_points_change)
      WHERE id = v_worker.worker_id;

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
