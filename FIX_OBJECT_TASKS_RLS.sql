-- Fix RLS for object_tasks - allow service role to read
-- Run this in Supabase SQL Editor

-- Drop existing policy
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON object_tasks;

-- Create new policy that allows service_role (used by Edge Functions) to read all tasks
CREATE POLICY "Allow service role full access to object_tasks" ON object_tasks
FOR ALL
TO authenticated, service_role
USING (true)
WITH CHECK (true);

-- Verify the policy
SELECT * FROM pg_policies WHERE tablename = 'object_tasks';

-- Test: Edge Functions should now be able to read tasks
SELECT COUNT(*) FROM object_tasks;
