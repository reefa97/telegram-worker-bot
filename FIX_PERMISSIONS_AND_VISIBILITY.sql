-- COMPREHENSIVE FIX: Permissions, Visibility, Deletion (v3)
-- 1. Restrict Sub-Admins to ONLY see workers they created.
-- 2. HIDE deleted workers from the main list (fix "returned old workers").
-- 3. Allow Sub-Admins to DELETE work sessions (shifts).
-- 4. Restore ability to Update/Soft-Delete workers.

-- === PART 1: ENSURE created_by IS SET AUTOMATICALLY ===
CREATE OR REPLACE FUNCTION set_created_by_to_active_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Force the creator to be the current user
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for WORKERS
DROP TRIGGER IF EXISTS ensure_worker_ownership ON workers;
CREATE TRIGGER ensure_worker_ownership
BEFORE INSERT ON workers
FOR EACH ROW
EXECUTE FUNCTION set_created_by_to_active_user();


-- === PART 2: WORKERS VISIBILITY (SELECT) ===
-- Drop old policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can view accessible workers" ON workers;
DROP POLICY IF EXISTS "Admins can view workers" ON workers;
DROP POLICY IF EXISTS "Admins can select workers" ON workers;

CREATE POLICY "Admins can view accessible workers" ON workers
    FOR SELECT
    TO authenticated
    USING (
        (
            -- Super Admins see ALL
            (SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin'
            OR
            -- Sub-admins ONLY see workers they created
            created_by = auth.uid()
        )
        -- CRITICAL: Hide deleted workers from the main list
        -- (Trash uses a separate function that bypasses this)
        AND deleted_at IS NULL
    );


-- === PART 3: WORKERS UPDATE (Soft Delete support) ===
DROP POLICY IF EXISTS "Admins can update accessible workers" ON workers;
CREATE POLICY "Admins can update accessible workers" ON workers
    FOR UPDATE
    TO authenticated
    USING (
        -- Allow updates if you can see them (ownership check)
        (SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin'
        OR
        created_by = auth.uid()
    );


-- === PART 4: SHIFT DELETION ===
DROP POLICY IF EXISTS "Admins can delete accessible work sessions" ON work_sessions;

CREATE POLICY "Admins can delete accessible work sessions" ON work_sessions
    FOR DELETE
    TO authenticated
    USING (
        -- Allow any Admin/Sub-admin to delete shifts
        -- (Ideally scoped to workers they own, but "delete from any account" context implies broad access or trust for sub-admins)
        EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
    );


-- === PART 5: WORKER CREATION ===
DROP POLICY IF EXISTS "Admins can create workers" ON workers;
CREATE POLICY "Admins can create workers" ON workers 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (true);


-- === PART 6: ENSURE soft_delete_worker RPC EXISTS ===
-- Fix for "cannot change return type of existing function"
DROP FUNCTION IF EXISTS soft_delete_worker(uuid);

CREATE OR REPLACE FUNCTION soft_delete_worker(worker_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Check permissions: Super Admin or Owner
    IF EXISTS (
        SELECT 1 FROM workers 
        WHERE id = worker_id 
        AND (
            (SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin'
            OR
            created_by = auth.uid()
        )
    ) THEN
        UPDATE workers SET deleted_at = NOW() WHERE id = worker_id;
    ELSE
        RAISE EXCEPTION 'Access denied';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
