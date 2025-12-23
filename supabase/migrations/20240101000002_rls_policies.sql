-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_admins ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ADMIN_USERS POLICIES
-- ============================================

-- Super admins can see all admins
CREATE POLICY "Super admins can view all admins" ON admin_users
    FOR SELECT
    USING (is_super_admin(auth.uid()));

-- Sub-admins can see themselves and admins they created
CREATE POLICY "Sub-admins can view accessible admins" ON admin_users
    FOR SELECT
    USING (
        id = auth.uid() OR 
        user_can_access_admin(auth.uid(), id)
    );

-- Super admins can insert admins
CREATE POLICY "Super admins can create admins" ON admin_users
    FOR INSERT
    WITH CHECK (is_super_admin(auth.uid()));

-- Sub-admins can create only sub-admins
CREATE POLICY "Sub-admins can create sub-admins" ON admin_users
    FOR INSERT
    WITH CHECK (
        NOT is_super_admin(auth.uid()) AND 
        role = 'sub_admin' AND 
        created_by = auth.uid()
    );

-- Super admins can update all admins
CREATE POLICY "Super admins can update admins" ON admin_users
    FOR UPDATE
    USING (is_super_admin(auth.uid()));

-- Sub-admins can update admins they created
CREATE POLICY "Sub-admins can update their admins" ON admin_users
    FOR UPDATE
    USING (created_by = auth.uid() OR id = auth.uid());

-- Super admins can delete admins
CREATE POLICY "Super admins can delete admins" ON admin_users
    FOR DELETE
    USING (is_super_admin(auth.uid()));

-- Sub-admins can delete sub-admins they created
CREATE POLICY "Sub-admins can delete their sub-admins" ON admin_users
    FOR DELETE
    USING (created_by = auth.uid() AND role = 'sub_admin');

-- ============================================
-- WORKERS POLICIES
-- ============================================

-- Admins can view workers they have access to
CREATE POLICY "Admins can view accessible workers" ON workers
    FOR SELECT
    USING (user_can_access_worker(auth.uid(), id));

-- Admins can create workers
CREATE POLICY "Admins can create workers" ON workers
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- Admins can update workers they have access to
CREATE POLICY "Admins can update accessible workers" ON workers
    FOR UPDATE
    USING (user_can_access_worker(auth.uid(), id));

-- Admins can delete workers they have access to
CREATE POLICY "Admins can delete accessible workers" ON workers
    FOR DELETE
    USING (user_can_access_worker(auth.uid(), id));

-- ============================================
-- CLEANING_OBJECTS POLICIES
-- ============================================

-- Admins can view objects they have access to
CREATE POLICY "Admins can view accessible objects" ON cleaning_objects
    FOR SELECT
    USING (user_can_access_object(auth.uid(), id));

-- Admins can create objects
CREATE POLICY "Admins can create objects" ON cleaning_objects
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- Admins can update objects they have access to
CREATE POLICY "Admins can update accessible objects" ON cleaning_objects
    FOR UPDATE
    USING (user_can_access_object(auth.uid(), id));

-- Admins can delete objects they have access to
CREATE POLICY "Admins can delete accessible objects" ON cleaning_objects
    FOR DELETE
    USING (user_can_access_object(auth.uid(), id));

-- ============================================
-- WORKER_OBJECTS POLICIES
-- ============================================

-- Admins can view worker-object assignments for their workers
CREATE POLICY "Admins can view accessible worker objects" ON worker_objects
    FOR SELECT
    USING (user_can_access_worker(auth.uid(), worker_id));

-- Admins can assign objects to their workers
CREATE POLICY "Admins can assign objects to workers" ON worker_objects
    FOR INSERT
    WITH CHECK (user_can_access_worker(auth.uid(), worker_id));

-- Admins can update assignments for their workers
CREATE POLICY "Admins can update worker object assignments" ON worker_objects
    FOR UPDATE
    USING (user_can_access_worker(auth.uid(), worker_id));

-- Admins can delete assignments for their workers
CREATE POLICY "Admins can delete worker object assignments" ON worker_objects
    FOR DELETE
    USING (user_can_access_worker(auth.uid(), worker_id));

-- ============================================
-- WORK_SESSIONS POLICIES
-- ============================================

-- Admins can view work sessions for their workers
CREATE POLICY "Admins can view accessible work sessions" ON work_sessions
    FOR SELECT
    USING (user_can_access_worker(auth.uid(), worker_id));

-- Allow inserting work sessions (used by Edge Functions)
CREATE POLICY "Allow work session creation" ON work_sessions
    FOR INSERT
    WITH CHECK (true);

-- Admins can update work sessions for their workers
CREATE POLICY "Admins can update accessible work sessions" ON work_sessions
    FOR UPDATE
    USING (user_can_access_worker(auth.uid(), worker_id));

-- Admins can delete work sessions for their workers
CREATE POLICY "Admins can delete accessible work sessions" ON work_sessions
    FOR DELETE
    USING (user_can_access_worker(auth.uid(), worker_id));

-- ============================================
-- BOT_SETTINGS POLICIES
-- ============================================

-- All authenticated users can view bot settings
CREATE POLICY "Authenticated users can view bot settings" ON bot_settings
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only super admins can update bot settings
CREATE POLICY "Super admins can update bot settings" ON bot_settings
    FOR UPDATE
    USING (is_super_admin(auth.uid()));

-- ============================================
-- BOT_ADMINS POLICIES
-- ============================================

-- All authenticated users can view bot admins
CREATE POLICY "Authenticated users can view bot admins" ON bot_admins
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Super admins can insert bot admins
CREATE POLICY "Super admins can create bot admins" ON bot_admins
    FOR INSERT
    WITH CHECK (is_super_admin(auth.uid()));

-- Super admins can update bot admins
CREATE POLICY "Super admins can update bot admins" ON bot_admins
    FOR UPDATE
    USING (is_super_admin(auth.uid()));

-- Super admins can delete bot admins
CREATE POLICY "Super admins can delete bot admins" ON bot_admins
    FOR DELETE
    USING (is_super_admin(auth.uid()));
