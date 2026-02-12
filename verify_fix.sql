-- Check processed updates count and recent errors
SELECT 'processed_updates_total' as metric, count(*)::text as value FROM processed_updates
UNION ALL
SELECT 'recent_errors', count(*)::text FROM system_logs WHERE created_at > (now() - interval '10 minutes') AND level = 'error'
UNION ALL
SELECT 'last_update_id', max(update_id)::text FROM processed_updates;
