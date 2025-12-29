-- Check admin_users telegram_chat_id
SELECT id, name, email, role, telegram_chat_id, is_active 
FROM admin_users 
ORDER BY created_at DESC;

-- Check legacy bot_admins
SELECT id, name, telegram_chat_id, is_active 
FROM bot_admins 
ORDER BY created_at DESC;

-- Check workers and their creators
SELECT w.id, w.first_name, w.last_name, w.created_by, 
       a.name as creator_name, a.telegram_chat_id as creator_chat_id
FROM workers w
LEFT JOIN admin_users a ON w.created_by = a.id
ORDER BY w.created_at DESC
LIMIT 5;
