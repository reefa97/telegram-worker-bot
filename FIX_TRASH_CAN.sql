-- 0. Dependencies: Ensure Access Control Functions Exist
-- (From ACL_MIGRATION.sql)

CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_users
        WHERE id = user_id AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    
    -- Check if access was explicitly granted (via object_owners)
    IF EXISTS (SELECT 1 FROM object_owners WHERE admin_id = p_user_id AND object_id = p_object_id) THEN
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
    
    -- Worker access via object assignments is implicit in UI, currently strict ownership or simple shared
    -- For now simplify: if you are *any* admin you can see workers (or restrict to super admin?)
    -- Reverting to simpler check if ACL table is missing:
    -- BUT we want to keep it compatible with previous logic
    
    RETURN TRUE; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1. Add deleted_at columns
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE object_tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Update RLS Policies to HIDE deleted items from standard views
-- cleaning_objects
DROP POLICY IF EXISTS "Admins can view accessible objects" ON cleaning_objects;
CREATE POLICY "Admins can view accessible objects" ON cleaning_objects 
    FOR SELECT TO authenticated 
    USING (user_can_access_object(auth.uid(), id) AND deleted_at IS NULL);

-- workers
DROP POLICY IF EXISTS "Admins can view accessible workers" ON workers;
CREATE POLICY "Admins can view accessible workers" ON workers 
    FOR SELECT TO authenticated 
    USING (
        -- Allow all authenticated admins to view workers (as per current simple requirements)
        -- Or filter by deleted_at
        deleted_at IS NULL
    );

-- object_tasks
DROP POLICY IF EXISTS "Admins can view tasks" ON object_tasks;
CREATE POLICY "Admins can view tasks" ON object_tasks
    FOR SELECT TO authenticated
    USING (
         -- Verify access via object ownership
        EXISTS (
            SELECT 1 FROM cleaning_objects 
            WHERE id = object_tasks.object_id 
            AND user_can_access_object(auth.uid(), id)
        )
        AND deleted_at IS NULL
    );

-- 3. Create Secure Functions for Trash Can Management (Security Definer)

CREATE OR REPLACE FUNCTION get_trashed_items(item_type TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    info TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only Super Admins can access trash
    IF NOT is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF item_type = 'objects' THEN
        RETURN QUERY 
        SELECT o.id, o.name, o.address as info, o.deleted_at 
        FROM cleaning_objects o 
        WHERE o.deleted_at IS NOT NULL
        ORDER BY o.deleted_at DESC;
        
    ELSIF item_type = 'workers' THEN
        RETURN QUERY 
        SELECT w.id, (w.first_name || ' ' || w.last_name) as name, w.phone as info, w.deleted_at 
        FROM workers w 
        WHERE w.deleted_at IS NOT NULL
        ORDER BY w.deleted_at DESC;
        
    ELSIF item_type = 'tasks' THEN
        RETURN QUERY 
        SELECT t.id, t.title as name, co.name as info, t.deleted_at 
        FROM object_tasks t
        JOIN cleaning_objects co ON t.object_id = co.id
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION restore_from_trash(item_type TEXT, item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF item_type = 'objects' THEN
        UPDATE cleaning_objects SET deleted_at = NULL WHERE id = item_id;
    ELSIF item_type = 'workers' THEN
        UPDATE workers SET deleted_at = NULL WHERE id = item_id;
    ELSIF item_type = 'tasks' THEN
        UPDATE object_tasks SET deleted_at = NULL WHERE id = item_id;
    ELSE
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION permanently_delete_item(item_type TEXT, item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF item_type = 'objects' THEN
        DELETE FROM cleaning_objects WHERE id = item_id;
    ELSIF item_type = 'workers' THEN
        DELETE FROM workers WHERE id = item_id;
    ELSIF item_type = 'tasks' THEN
        DELETE FROM object_tasks WHERE id = item_id;
    ELSE
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;
