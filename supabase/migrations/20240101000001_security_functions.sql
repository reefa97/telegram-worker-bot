-- Security functions for RLS policies

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id = user_id AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access a worker
CREATE OR REPLACE FUNCTION user_can_access_worker(user_id UUID, worker_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    worker_creator UUID;
BEGIN
    -- Super admins can access all workers
    IF is_super_admin(user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Get the creator of the worker
    SELECT created_by INTO worker_creator FROM workers WHERE id = worker_id;
    
    -- Sub-admins can access workers they created
    IF worker_creator = user_id THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access an admin
CREATE OR REPLACE FUNCTION user_can_access_admin(user_id UUID, admin_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    admin_creator UUID;
    target_role TEXT;
BEGIN
    -- Super admins can access all admins
    IF is_super_admin(user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Get the creator and role of the target admin
    SELECT created_by, role INTO admin_creator, target_role FROM admin_users WHERE id = admin_id;
    
    -- Sub-admins can only access sub-admins they created
    IF admin_creator = user_id AND target_role = 'sub_admin' THEN
        RETURN TRUE;
    END IF;
    
    -- Users can always access their own record
    IF admin_id = user_id THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access a cleaning object
CREATE OR REPLACE FUNCTION user_can_access_object(user_id UUID, object_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    object_creator UUID;
BEGIN
    -- Super admins can access all objects
    IF is_super_admin(user_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Get the creator of the object
    SELECT created_by INTO object_creator FROM cleaning_objects WHERE id = object_id;
    
    -- Sub-admins can access objects they created
    IF object_creator = user_id THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
