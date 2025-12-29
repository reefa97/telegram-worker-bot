-- Migration to support multiple object owners

-- 1. Create junction table
CREATE TABLE IF NOT EXISTS object_owners (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    object_id UUID REFERENCES cleaning_objects(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(object_id, admin_id)
);

-- 2. Enable RLS
ALTER TABLE object_owners ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Super admins can manage everything
CREATE POLICY "Super admins can manage object_owners" ON object_owners
    FOR ALL
    TO authenticated
    USING (is_super_admin(auth.uid()))
    WITH CHECK (is_super_admin(auth.uid()));

-- Admins can view owners (needed for UI)
CREATE POLICY "Admins can view object_owners" ON object_owners
    FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Service role has full access
CREATE POLICY "Service role full access object_owners" ON object_owners
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Migrate existing data (Move created_by to object_owners)
INSERT INTO object_owners (object_id, admin_id)
SELECT id, created_by 
FROM cleaning_objects 
WHERE created_by IS NOT NULL
ON CONFLICT (object_id, admin_id) DO NOTHING;

-- 5. Helper function for bot to get all owners with telegram chat ids
CREATE OR REPLACE FUNCTION get_object_owners_with_chat_ids(target_object_id UUID)
RETURNS TABLE (telegram_chat_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT au.telegram_chat_id
    FROM object_owners oo
    JOIN admin_users au ON oo.admin_id = au.id
    WHERE oo.object_id = target_object_id
    AND au.telegram_chat_id IS NOT NULL;
END;
$$;
