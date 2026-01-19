-- FIX WORKSESSION VISIBILITY
-- Restrict access so Sub-Admins only see sessions of workers they created.
-- This removes "Unknown Worker" entries from the dashboard.

-- 1. DROP EXISTING POLICIES (Cleanup)
DROP POLICY IF EXISTS "Admins can view work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins can insert work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins can update work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins can delete work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Enable read access for all users" ON work_sessions;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON work_sessions;
DROP POLICY IF EXISTS "Enable update for users based on email" ON work_sessions;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON work_sessions;
DROP POLICY IF EXISTS "Admins can view accessible work sessions" ON work_sessions;

-- 2. CREATE STRICT POLICIES

-- SELECT: Only Super Admin OR Owner of the Worker
CREATE POLICY "Admins can view accessible work sessions" ON work_sessions
FOR SELECT TO authenticated
USING (
    -- Super Admin
    ((SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin')
    OR
    -- Workers created by the user
    (worker_id IN (SELECT id FROM workers WHERE created_by = auth.uid()))
);

-- INSERT: Only for own workers
CREATE POLICY "Admins can insert own workers sessions" ON work_sessions
FOR INSERT TO authenticated
WITH CHECK (
    -- Super Admin
    ((SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin')
    OR
    -- Workers created by the user
    (worker_id IN (SELECT id FROM workers WHERE created_by = auth.uid()))
);

-- UPDATE: Only for own workers' sessions
CREATE POLICY "Admins can update own workers sessions" ON work_sessions
FOR UPDATE TO authenticated
USING (
    ((SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin')
    OR
    (worker_id IN (SELECT id FROM workers WHERE created_by = auth.uid()))
);

-- DELETE: Only for own workers' sessions
CREATE POLICY "Admins can delete own workers sessions" ON work_sessions
FOR DELETE TO authenticated
USING (
    ((SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin')
    OR
    (worker_id IN (SELECT id FROM workers WHERE created_by = auth.uid()))
);
