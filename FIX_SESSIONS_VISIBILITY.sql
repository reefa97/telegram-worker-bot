-- EXPAND ACCESS TO WORK SESSIONS
-- This update allows Admins to view shifts if they operate the Object, 
-- even if they don't "own" the Worker.

-- 1. Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins can view accessible work sessions" ON work_sessions;

-- 2. Create a broader policy
-- Logic: You can see the shift if:
-- A) You are a Super Admin (covered by functions implicitly or role check)
-- B) You have access to the WORKER (you invited them)
-- C) You have access to the OBJECT (it's your building being cleaned)

CREATE POLICY "Admins can view accessible work sessions" ON work_sessions
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE role = 'super_admin') -- Super Access
        OR
        user_can_access_worker(auth.uid(), worker_id) -- You own the worker
        OR
        (object_id IS NOT NULL AND user_can_access_object(auth.uid(), object_id)) -- You own the object
    );
    
-- 3. Verify object access function exists (just in case, shouldn't be needed if migrations ran)
-- (Assuming user_can_access_object is defined from previous steps)
