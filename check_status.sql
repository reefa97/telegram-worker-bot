-- 1. Check if bot is active in settings
select * from bot_settings;

-- 2. Check system error logs (run this separate from the above if needed, but here it is)
select * from system_logs where level = 'error' order by created_at desc limit 20;
