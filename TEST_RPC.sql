-- Test RPC function for Sołtysowska 12A

-- Step 1: Get the object ID
SELECT id, name FROM cleaning_objects WHERE name = 'Sołtysowska 12A';

-- Step 2: Copy the ID from above and paste below (replace the placeholder)
-- Example result should show: telegram_chat_id = '5121127700'
SELECT * FROM get_object_owners_with_chat_ids('PASTE-OBJECT-ID-HERE');

-- Step 3: Verify data type - should be TEXT not BIGINT
SELECT 
    column_name, 
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'admin_users' 
AND column_name = 'telegram_chat_id';
