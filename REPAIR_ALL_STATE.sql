-- GLOBAL REPAIR & SYNC SCRIPT
-- This script idempotently fixes Schema, Columns, and ACL Policies all in one go.

-- ============================================================================
-- 1. SCHEMA REPAIR (Ensure all tables and columns exist)
-- ============================================================================

-- Fix cleaning_objects columns (from MISSING_MIGRATIONS.sql)
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8);
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8);
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS geofence_radius INTEGER DEFAULT 100;
-- Add salary_type safely
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cleaning_objects' AND column_name='salary_type') THEN
        ALTER TABLE cleaning_objects ADD COLUMN salary_type TEXT DEFAULT 'hourly' CHECK (salary_type IN ('hourly', 'monthly_fixed'));
    END IF;
END $$;
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS expected_cleanings_per_month INTEGER DEFAULT 20;
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS requires_photos BOOLEAN DEFAULT false;
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS requires_tasks BOOLEAN DEFAULT false;
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS schedule_days INTEGER[] DEFAULT '{}';
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS schedule_time_start TIME DEFAULT '09:00';
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS schedule_time_end TIME DEFAULT '18:00';

-- Worker Roles & Columns
CREATE TABLE IF NOT EXISTS worker_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE worker_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES worker_roles(id) ON DELETE SET NULL;

-- ACL Access Tables
CREATE TABLE IF NOT EXISTS admin_object_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(admin_id, object_id)
);
ALTER TABLE admin_object_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_worker_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(admin_id, worker_id)
);
ALTER TABLE admin_worker_access ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 2. CLEANUP (Drop old/conflicting policies and functions)
-- ============================================================================

-- Drop functions with CASCADE to wipe dependent policies
DROP FUNCTION IF EXISTS user_can_access_object(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS user_can_access_worker(uuid, uuid) CASCADE;

-- Explicitly drop potential leftover policies "just in case" CASCADE missed them
DROP POLICY IF EXISTS "Admins can view accessible workers" ON workers;
DROP POLICY IF EXISTS "Admins can update accessible workers" ON workers;
DROP POLICY IF EXISTS "Admins can delete accessible workers" ON workers;
DROP POLICY IF EXISTS "Admins can create workers" ON workers;

DROP POLICY IF EXISTS "Admins can view accessible objects" ON cleaning_objects;
DROP POLICY IF EXISTS "Admins can update accessible objects" ON cleaning_objects;
DROP POLICY IF EXISTS "Admins can delete accessible objects" ON cleaning_objects;
DROP POLICY IF EXISTS "Admins can create objects" ON cleaning_objects;

DROP POLICY IF EXISTS "Admins can view accessible worker objects" ON worker_objects;
DROP POLICY IF EXISTS "Admins can assign objects to workers" ON worker_objects;
DROP POLICY IF EXISTS "Admins can update worker object assignments" ON worker_objects;
DROP POLICY IF EXISTS "Admins can delete worker object assignments" ON worker_objects;

DROP POLICY IF EXISTS "Admins can view accessible work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins can update accessible work sessions" ON work_sessions;
DROP POLICY IF EXISTS "Admins can delete accessible work sessions" ON work_sessions;


-- ============================================================================
-- 3. APPLY NEW ACL POLICIES (Inline & Helper)
-- ============================================================================

-- A. WORKERS
CREATE POLICY "Admins can view accessible workers" ON workers
    FOR SELECT TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = auth.uid() AND worker_id = workers.id)
    );

CREATE POLICY "Admins can update accessible workers" ON workers
    FOR UPDATE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = auth.uid() AND worker_id = workers.id)
    );

CREATE POLICY "Admins can delete accessible workers" ON workers
    FOR DELETE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = auth.uid() AND worker_id = workers.id)
    );

CREATE POLICY "Admins can create workers" ON workers 
    FOR INSERT TO authenticated WITH CHECK (true);

-- B. CLEANING OBJECTS
CREATE POLICY "Admins can view accessible objects" ON cleaning_objects
    FOR SELECT TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id)
    );

CREATE POLICY "Admins can update accessible objects" ON cleaning_objects
    FOR UPDATE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id)
    );

CREATE POLICY "Admins can delete accessible objects" ON cleaning_objects
    FOR DELETE TO authenticated
    USING (
        is_super_admin(auth.uid()) 
        OR created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_object_access WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id)
    );

CREATE POLICY "Admins can create objects" ON cleaning_objects 
    FOR INSERT TO authenticated WITH CHECK (true);


-- C. HELPER FUNCTION (Non-recursive, for dependent tables)
CREATE OR REPLACE FUNCTION user_has_worker_access(p_user_id UUID, p_worker_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Super admins
    IF is_super_admin(p_user_id) THEN RETURN TRUE; END IF;
    -- Creator
    IF EXISTS (SELECT 1 FROM workers WHERE id = p_worker_id AND created_by = p_user_id) THEN RETURN TRUE; END IF;
    -- Shared
    IF EXISTS (SELECT 1 FROM admin_worker_access WHERE admin_id = p_user_id AND worker_id = p_worker_id) THEN RETURN TRUE; END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- D. DEPENDENT TABLES (Worker Objects & Sessions)
-- Worker Objects
CREATE POLICY "Admins can view accessible worker objects" ON worker_objects 
    FOR SELECT TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));
CREATE POLICY "Admins can assign objects to workers" ON worker_objects 
    FOR INSERT TO authenticated WITH CHECK (user_has_worker_access(auth.uid(), worker_id));
CREATE POLICY "Admins can update worker object assignments" ON worker_objects 
    FOR UPDATE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));
CREATE POLICY "Admins can delete worker object assignments" ON worker_objects 
    FOR DELETE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));

-- Work Sessions
CREATE POLICY "Admins can view accessible work sessions" ON work_sessions 
    FOR SELECT TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));
CREATE POLICY "Admins can update accessible work sessions" ON work_sessions 
    FOR UPDATE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));
CREATE POLICY "Admins can delete accessible work sessions" ON work_sessions 
    FOR DELETE TO authenticated USING (user_has_worker_access(auth.uid(), worker_id));
    
-- Allow work session creation (needed for Start Shift)
DROP POLICY IF EXISTS "Allow work session creation" ON work_sessions;
CREATE POLICY "Allow work session creation" ON work_sessions FOR INSERT WITH CHECK (true);

-- E. ACCESS TABLES POLICIES (Super Admin Management)
DROP POLICY IF EXISTS "Super Admins can manage object access" ON admin_object_access;
CREATE POLICY "Super Admins can manage object access" ON admin_object_access FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super Admins can manage worker access" ON admin_worker_access;
CREATE POLICY "Super Admins can manage worker access" ON admin_worker_access FOR ALL TO authenticated USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view their own object access" ON admin_object_access;
CREATE POLICY "Admins can view their own object access" ON admin_object_access FOR SELECT TO authenticated USING (admin_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view their own worker access" ON admin_worker_access;
CREATE POLICY "Admins can view their own worker access" ON admin_worker_access FOR SELECT TO authenticated USING (admin_id = auth.uid());

-- F. WORKER ROLES POLICIES
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON worker_roles;
CREATE POLICY "Enable read access for authenticated users" ON worker_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON worker_roles;
CREATE POLICY "Enable write access for authenticated users" ON worker_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
