-- Check recent logs to see if the cron job is spamming or erroring
select * from notifications_log order by created_at desc limit 20;

-- Check if there are any active queries blocking
select pid, now() - query_start as duration, query, state
from pg_stat_activity
where state != 'idle'
order by duration desc;
