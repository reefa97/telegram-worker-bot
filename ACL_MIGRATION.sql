-- Advanced Access Control List (ACL) Migration

-- 1. Create Access Tables
CREATE TABLE IF NOT EXISTS admin_object_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(admin_id, object_id)
);

CREATE TABLE IF NOT EXISTS admin_worker_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(admin_id, worker_id)
);

-- 2. Enable RLS on Access Tables
ALTER TABLE admin_object_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_worker_access ENABLE ROW LEVEL SECURITY;

-- 3. RLS for Access Tables (Only Super Admin can manage these)
DROP POLICY IF EXISTS "Super Admins can manage object access" ON admin_object_access;
CREATE POLICY "Super Admins can manage object access" ON admin_object_access
    FOR ALL
    TO authenticated
    USING (is_super_admin(auth.uid()))
    WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can manage worker access" ON admin_worker_access;
CREATE POLICY "Super Admins can manage worker access" ON admin_worker_access
    FOR ALL
    TO authenticated
    USING (is_super_admin(auth.uid()))
    WITH CHECK (is_super_admin(auth.uid()));
    
-- Allow admins to view their own access rights (for frontend verification)
DROP POLICY IF EXISTS "Admins can view their own object access" ON admin_object_access;
CREATE POLICY "Admins can view their own object access" ON admin_object_access
    FOR SELECT
    TO authenticated
    USING (admin_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view their own worker access" ON admin_worker_access;
CREATE POLICY "Admins can view their own worker access" ON admin_worker_access
    FOR SELECT
    TO authenticated
    USING (admin_id = auth.uid());

-- 4. Update Security Functions to use ACL
-- We replace the previous functions to include the check for shared access

-- DROP functions with CASCADE to remove old policies that depend on them
DROP FUNCTION IF EXISTS user_can_access_object(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_worker(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION user_can_access_object(p_user_id UUID, p_object_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Super admins can access all
    IF is_super_admin(p_user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user created the object
    IF EXISTS (SELECT 1 FROM cleaning_objects WHERE id = p_object_id AND created_by = p_user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Check if access was explicitly granted
    IF EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = p_user_id AND object_id = p_object_id) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_can_access_worker(p_user_id UUID, p_worker_id UUID)
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
    
    -- Check if access was explicitly granted
    IF EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = p_user_id AND worker_id = p_worker_id) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Re-apply RLS Policies
-- We explicitly DROP then CREATE to handle both Dependent (cascade removed) and Independent (previous fix) policies safely.

-- cleaning_objects
DROP POLICY IF EXISTS "Admins can view accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can view accessible objects" ON cleaning_objects 
    FOR SELECT TO authenticated USING (user_can_access_object(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can update accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can update accessible objects" ON cleaning_objects 
    FOR UPDATE TO authenticated USING (user_can_access_object(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can delete accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can delete accessible objects" ON cleaning_objects 
    FOR DELETE TO authenticated USING (user_can_access_object(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can create objects" ON cleaning_objects;
CREATE POLICY "Admins can create objects" ON cleaning_objects 
    FOR INSERT TO authenticated WITH CHECK (true);
    
-- workers
DROP POLICY IF EXISTS "Admins can view accessible workers" ON workers;
CREATE POLICY "Admins can view accessible workers" ON workers 
    FOR SELECT TO authenticated USING (user_can_access_worker(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can update accessible workers" ON workers;
CREATE POLICY "Admins can update accessible workers" ON workers 
    FOR UPDATE TO authenticated USING (user_can_access_worker(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can delete accessible workers" ON workers;
CREATE POLICY "Admins can delete accessible workers" ON workers 
    FOR DELETE TO authenticated USING (user_can_access_worker(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can create workers" ON workers;
CREATE POLICY "Admins can create workers" ON workers 
    FOR INSERT TO authenticated WITH CHECK (true);

-- dependent policies for worker_objects
DROP POLICY IF EXISTS "Admins can view accessible worker objects" ON worker_objects;
CREATE POLICY "Admins can view accessible worker objects" ON worker_objects 
    FOR SELECT TO authenticated USING (user_can_access_worker(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can assign objects to workers" ON worker_objects;
CREATE POLICY "Admins can assign objects to workers" ON worker_objects 
    FOR INSERT TO authenticated WITH CHECK (user_can_access_worker(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can update worker object assignments" ON worker_objects;
CREATE POLICY "Admins can update worker object assignments" ON worker_objects 
    FOR UPDATE TO authenticated USING (user_can_access_worker(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can delete worker object assignments" ON worker_objects;
CREATE POLICY "Admins can delete worker object assignments" ON worker_objects 
    FOR DELETE TO authenticated USING (user_can_access_worker(auth.uid(), worker_id));

-- dependent policies for work_sessions
DROP POLICY IF EXISTS "Admins can view accessible work sessions" ON work_sessions;
CREATE POLICY "Admins can view accessible work sessions" ON work_sessions 
    FOR SELECT TO authenticated USING (user_can_access_worker(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can update accessible work sessions" ON work_sessions;
CREATE POLICY "Admins can update accessible work sessions" ON work_sessions 
    FOR UPDATE TO authenticated USING (user_can_access_worker(auth.uid(), worker_id));

DROP POLICY IF EXISTS "Admins can delete accessible work sessions" ON work_sessions;
CREATE POLICY "Admins can delete accessible work sessions" ON work_sessions 
    FOR DELETE TO authenticated USING (user_can_access_worker(auth.uid(), worker_id));
    
-- Also ensure Allow work session creation stays (it's often used by backend)
DROP POLICY IF EXISTS "Allow work session creation" ON work_sessions;
CREATE POLICY "Allow work session creation" ON work_sessions 
    FOR INSERT WITH CHECK (true);
