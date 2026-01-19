-- Fix RLS violations by setting default created_by to auth.uid()

ALTER TABLE cleaning_objects 
ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Optional: Do the same for workers table to prevent similar issues there
ALTER TABLE workers 
ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Ensure the policy allows the insert if created_by matches key or if it's set by default
-- The existing policy WITH CHECK (created_by = auth.uid()) will pass because 
-- when the default is applied, the new row will have created_by = auth.uid().
