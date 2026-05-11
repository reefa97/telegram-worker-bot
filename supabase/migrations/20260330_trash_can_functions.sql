-- Add deleted_at columns if not exist
ALTER TABLE cleaning_objects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE object_tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Trash functions

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
        SELECT w.id, (w.first_name || ' ' || w.last_name) as name, w.phone_number as info, w.deleted_at
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
