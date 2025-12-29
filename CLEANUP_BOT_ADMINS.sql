-- =====================================================
-- CLEAN UP BOT_ADMINS AND VERIFY ADMIN_USERS
-- =====================================================
-- Execute this in Supabase SQL Editor to fix notifications

-- Step 1: Check what's currently in bot_admins
SELECT 
    id, 
    name, 
    telegram_chat_id, 
    is_active, 
    created_at 
FROM bot_admins 
ORDER BY created_at DESC;

-- Step 2: Check admin_users telegram_chat_id values
SELECT 
    id, 
    name, 
    email, 
    role, 
    telegram_chat_id, 
    is_active,
    created_at
FROM admin_users 
ORDER BY created_at DESC;

-- Step 3: DEACTIVATE all bot_admins (RECOMMENDED)
-- This will stop them from being used but keeps data for reference
UPDATE bot_admins SET is_active = false;

-- Step 4 (OPTIONAL): If you want to delete bot_admins completely
-- Uncomment the line below ONLY if you're sure
-- DELETE FROM bot_admins;

-- Step 5: Verify no active bot_admins remain
SELECT COUNT(*) as active_bot_admins 
FROM bot_admins 
WHERE is_active = true;
-- Should return 0

-- Step 6: Verify admin_users have telegram_chat_id set
SELECT 
    name,
    email,
    role,
    CASE 
        WHEN telegram_chat_id IS NULL THEN '❌ NOT SET'
        ELSE '✅ ' || telegram_chat_id
    END as telegram_status
FROM admin_users
WHERE is_active = true
ORDER BY role, name;
