-- Update soft_delete_worker to also unlink all objects when worker is moved to trash
DROP FUNCTION IF EXISTS soft_delete_worker(uuid);

CREATE OR REPLACE FUNCTION soft_delete_worker(p_worker_id UUID)
RETURNS VOID AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM workers WHERE id = p_worker_id) THEN
        -- Unlink all objects from this worker
        DELETE FROM worker_objects WHERE worker_id = p_worker_id;
        -- Soft delete the worker and deactivate
        UPDATE workers SET deleted_at = NOW(), is_active = false WHERE id = p_worker_id;
    ELSE
        RAISE EXCEPTION 'Worker not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
