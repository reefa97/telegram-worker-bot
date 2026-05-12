-- ========================================
-- SECURITY: RLS Hardening
-- ========================================
-- Replace `USING (true)` policies on sensitive tables with real
-- predicates. Before this migration any authenticated user (including
-- clients) could read/write data belonging to other workers/clients.
--
-- Strategy:
--   * Add helper SQL functions: is_admin(), is_super_admin(), is_client()
--   * Workers see only their own data (worker_objects FK or
--     work_sessions.worker_id matches a worker linked to auth.uid())
--   * Clients see only data linked to their own objects via client_objects
--   * Admins (super_admin/sub_admin/manager) keep full access
--
-- The python_search worker and edge functions all use service_role,
-- which bypasses RLS unconditionally — so server-side flows are not
-- affected by these tightenings.
-- ========================================

-- ---- Helper functions ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'sub_admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
    AND role = 'client'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_client() TO authenticated;

-- ---- shift_photos --------------------------------------------------------

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON shift_photos;
DROP POLICY IF EXISTS "Admins full access" ON shift_photos;
DROP POLICY IF EXISTS "Workers own sessions" ON shift_photos;
DROP POLICY IF EXISTS "Clients own objects" ON shift_photos;

-- Admins: full access
CREATE POLICY "shift_photos admin all" ON shift_photos
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Workers: only their own sessions' photos (read-only)
CREATE POLICY "shift_photos worker own" ON shift_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_sessions ws
      JOIN workers w ON w.id = ws.worker_id
      WHERE ws.id = shift_photos.session_id
      AND w.telegram_user_id::text = (auth.jwt() ->> 'telegram_user_id')
    )
  );

-- Clients: photos for sessions on objects they own
CREATE POLICY "shift_photos client own" ON shift_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_sessions ws
      JOIN client_objects clo ON clo.object_id = ws.object_id
      WHERE ws.id = shift_photos.session_id
      AND clo.client_id = auth.uid()
    )
  );

-- ---- client_requests ----------------------------------------------------

DROP POLICY IF EXISTS "Clients can view own requests" ON client_requests;
DROP POLICY IF EXISTS "Clients can insert own requests" ON client_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON client_requests;
DROP POLICY IF EXISTS "Clients can delete own requests" ON client_requests;

CREATE POLICY "client_requests admin all" ON client_requests
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "client_requests client select own" ON client_requests
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "client_requests client insert own" ON client_requests
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "client_requests client delete own" ON client_requests
  FOR DELETE TO authenticated
  USING (client_id = auth.uid() AND status = 'new');

-- ---- client_objects -----------------------------------------------------

DROP POLICY IF EXISTS "Admins can manage client_objects" ON client_objects;

CREATE POLICY "client_objects admin all" ON client_objects
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Clients can read their own assignments (used by some UI)
CREATE POLICY "client_objects client select own" ON client_objects
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- ---- scheduled_shifts ---------------------------------------------------

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON scheduled_shifts;

CREATE POLICY "scheduled_shifts admin all" ON scheduled_shifts
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ---- session_tasks ------------------------------------------------------

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON session_tasks;

CREATE POLICY "session_tasks admin all" ON session_tasks
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "session_tasks client select" ON session_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_sessions ws
      JOIN client_objects clo ON clo.object_id = ws.object_id
      WHERE ws.id = session_tasks.session_id
      AND clo.client_id = auth.uid()
    )
  );

-- ---- object_tasks -------------------------------------------------------

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON object_tasks;

CREATE POLICY "object_tasks admin all" ON object_tasks
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "object_tasks client select" ON object_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_objects clo
      WHERE clo.object_id = object_tasks.object_id
      AND clo.client_id = auth.uid()
    )
  );

-- ---- notifications_log --------------------------------------------------

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON notifications_log;

-- Admins only (internal log)
CREATE POLICY "notifications_log admin all" ON notifications_log
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
