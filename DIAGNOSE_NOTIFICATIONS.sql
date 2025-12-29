-- Diagnostic: Check if notification system is set up correctly

-- 1. Check if RPC function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'get_object_owners_with_chat_ids';

-- 2. Check object_owners table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'object_owners';

-- 3. Check if there are any object owners assigned
SELECT 
    co.name as object_name,
    au.name as owner_name,
    au.telegram_chat_id,
    oo.created_at
FROM object_owners oo
JOIN cleaning_objects co ON oo.object_id = co.id
JOIN admin_users au ON oo.admin_id = au.id
ORDER BY co.name, au.name;

-- 4. Test RPC function for a specific object (replace with actual object ID)
-- SELECT * FROM get_object_owners_with_chat_ids('YOUR-OBJECT-ID-HERE');

-- 5. Check which admins have telegram_chat_id
SELECT 
    id,
    name,
    role,
    telegram_chat_id
FROM admin_users
WHERE telegram_chat_id IS NOT NULL
ORDER BY role, name;
