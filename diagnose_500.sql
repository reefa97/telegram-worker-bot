-- Check if processed_updates exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE  table_schema = 'public'
   AND    table_name   = 'processed_updates'
);

-- Check system logs for the last hour
SELECT * FROM system_logs 
WHERE created_at > (now() - interval '1 hour') 
ORDER BY created_at DESC 
LIMIT 10;
