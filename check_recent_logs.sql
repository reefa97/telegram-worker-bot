-- Check system logs for recent errors or warnings
select * from system_logs where created_at > (now() - interval '1 hour') order by created_at desc;
