-- SQL to check and optionally clean bot_admins table
-- Run this in Supabase SQL Editor to see what's in bot_admins

-- 1. Check what's in bot_admins
SELECT id, name, telegram_chat_id, is_active, created_at 
FROM bot_admins 
ORDER BY created_at DESC;

-- 2. Check admin_users telegram_chat_id
SELECT id, name, email, role, telegram_chat_id, is_active 
FROM admin_users 
ORDER BY created_at DESC;

-- 3. If you want to deactivate all bot_admins (recommended):
-- UPDATE bot_admins SET is_active = false;

-- 4. Or delete all bot_admins completely (use with caution):
-- DELETE FROM bot_admins;
