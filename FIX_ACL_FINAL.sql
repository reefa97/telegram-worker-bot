-- Fix ACL Recursion Bug by using Inline Policies (Robust Version)

-- 1. Drop problematic functions and dependent policies using CASCADE
-- This cleans up any "function-based" policies from previous attempts
DROP FUNCTION IF EXISTS user_can_access_object(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_worker(uuid, uuid) CASCADE;

-- 2. Worker Policies (Inline Check)
DROP POLICY IF EXISTS "Admins can view accessible workers" ON workers;
CREATE POLICY "Admins can view accessible workers" ON workers
    FOR SELECT TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR 
        created_by = auth.uid()
        OR 
        EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = auth.uid() AND worker_id = workers.id)
    );

DROP POLICY IF EXISTS "Admins can update accessible workers" ON workers;
CREATE POLICY "Admins can update accessible workers" ON workers
    FOR UPDATE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR 
        created_by = auth.uid()
        OR 
        EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = auth.uid() AND worker_id = workers.id)
    );

DROP POLICY IF EXISTS "Admins can delete accessible workers" ON workers;
CREATE POLICY "Admins can delete accessible workers" ON workers
    FOR DELETE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR 
        created_by = auth.uid()
        OR 
        EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = auth.uid() AND worker_id = workers.id)
    );

-- Important: Drop strict insert policy if it exists from previous steps
DROP POLICY IF EXISTS "Admins can create workers" ON workers;
CREATE POLICY "Admins can create workers" ON workers 
    FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Cleaning Object Policies (Inline Check)
DROP POLICY IF EXISTS "Admins can view accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can view accessible objects" ON cleaning_objects
    FOR SELECT TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR 
        created_by = auth.uid()
        OR 
        EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id)
    );

DROP POLICY IF EXISTS "Admins can update accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can update accessible objects" ON cleaning_objects
    FOR UPDATE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR 
        created_by = auth.uid()
        OR 
        EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id)
    );

DROP POLICY IF EXISTS "Admins can delete accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can delete accessible objects" ON cleaning_objects
    FOR DELETE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR 
        created_by = auth.uid()
        OR 
        EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id)
    );

DROP POLICY IF EXISTS "Admins can create objects" ON cleaning_objects;
CREATE POLICY "Admins can create objects" ON cleaning_objects 
    FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Dependent Policies (Worker Objects & Work Sessions)
-- First create helper function
CREATE OR REPLACE FUNCTION user_has_worker_access(p_user_id UUID, p_worker_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Super admins can access all
    IF is_super_admin(p_user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user created the worker
    IF EXISTS (SELECT 1 FROM workers WHERE id = p_worker_id AND created_by = p_user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Check shared access
    IF EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = p_user_id AND worker_id = p_worker_id) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Worker Objects Policies
DROP POLICY IF EXISTS "Admins can view accessible worker objects" ON worker_objects;
CREATE POLICY "Admins can view accessible worker objects" ON worker_objects 
    FOR SELECT TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can assign objects to workers" ON worker_objects;
CREATE POLICY "Admins can assign objects to workers" ON worker_objects 
    FOR INSERT TO authenticated WITH CHECK (user_has_worker_access(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can update worker object assignments" ON worker_objects;
CREATE POLICY "Admins can update worker object assignments" ON worker_objects 
    FOR UPDATE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can delete worker object assignments" ON worker_objects;
CREATE POLICY "Admins can delete worker object assignments" ON worker_objects 
    FOR DELETE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

-- Work Sessions Policies
DROP POLICY IF EXISTS "Admins can view accessible work sessions" ON work_sessions;
CREATE POLICY "Admins can view accessible work sessions" ON work_sessions 
    FOR SELECT TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can update accessible work sessions" ON work_sessions;
CREATE POLICY "Admins can update accessible work sessions" ON work_sessions 
    FOR UPDATE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can delete accessible work sessions" ON work_sessions;
CREATE POLICY "Admins can delete accessible work sessions" ON work_sessions 
    FOR DELETE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

-- Ensure Allow work session creation exists
DROP POLICY IF EXISTS "Allow work session creation" ON work_sessions;
CREATE POLICY "Allow work session creation" ON work_sessions FOR INSERT WITH CHECK (true);
