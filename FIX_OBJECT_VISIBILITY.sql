-- FIX OBJECT VISIBILITY & DELETED ITEMS
-- Problem: Deleted objects are showing up for Super Admins.
-- Cause: Likely a conflicting RLS policy or missing 'deleted_at IS NULL' check in a specific policy.
-- Solution: Drop ALL read policies for cleaning_objects and re-create a single strict one.

-- 1. CLEANUP OLD POLICIES
DROP POLICY IF EXISTS "Admins can view accessible objects" ON cleaning_objects;
DROP POLICY IF EXISTS "Admins can view objects" ON cleaning_objects;
DROP POLICY IF EXISTS "Admins can select objects" ON cleaning_objects;
DROP POLICY IF EXISTS "Enable read access for all users" ON cleaning_objects;

-- 2. CREATE STRICT POLICY
CREATE POLICY "Admins can view accessible objects" ON cleaning_objects 
FOR SELECT TO authenticated 
USING (
    (
        -- Super Admin logic: Can see all
        ((SELECT role FROM admin_users WHERE id = auth.uid() LIMIT 1) = 'super_admin')
        OR
        -- Regular Admin: Can see own
        (created_by = auth.uid())
        OR
        -- Assigned owners
        (EXISTS (SELECT 1 FROM object_owners WHERE admin_id = auth.uid() AND object_id = cleaning_objects.id))
    )
    -- GLOBALLY HIDE DELETED ITEMS
    AND deleted_at IS NULL
);
