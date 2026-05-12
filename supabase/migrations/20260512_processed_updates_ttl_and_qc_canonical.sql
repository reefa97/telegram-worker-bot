-- ========================================
-- M2: processed_updates TTL cleanup
-- ========================================
-- The Telegram idempotency table grows forever. Keep last 7 days only.
-- Old entries can't be duplicate updates (Telegram retries within minutes).
-- ========================================

CREATE OR REPLACE FUNCTION cleanup_processed_updates()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM processed_updates
  WHERE created_at < (now() - interval '7 days');
END;
$$;

-- Schedule via pg_cron if available; otherwise call manually
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-processed-updates');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-processed-updates',
      '0 3 * * *',  -- daily at 03:00
      $cmd$ SELECT cleanup_processed_updates(); $cmd$
    );
  END IF;
END$$;

-- ========================================
-- M3: Canonical quality_control RLS
-- ========================================
-- Replace the soup of _fix_qc_rls / _fix_qc_rls_v2 / _fix_qc_rls_final /
-- _minimal_qc_rls migrations with one clean state.
--   * Admins: full CRUD
--   * Workers: SELECT own checks (joined via worker_id)
-- ========================================

ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_check_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'quality_checks' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON quality_checks', r.policyname);
  END LOOP;
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'quality_check_items' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON quality_check_items', r.policyname);
  END LOOP;
END$$;

-- quality_checks: admins only
-- (workers don't log into Supabase web auth — they interact via Telegram bot
-- which uses service-role and bypasses RLS, so no worker policy needed)
CREATE POLICY "quality_checks admin all" ON quality_checks
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "quality_check_items admin all" ON quality_check_items
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

NOTIFY pgrst, 'reload schema';
