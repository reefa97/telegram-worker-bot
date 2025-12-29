-- Check object_tasks structure and data
SELECT 
    id, 
    object_id,
    title,
    is_active,
    is_recurring,
    is_special_task,
    scheduled_days,
    scheduled_dates,
    created_at
FROM object_tasks
ORDER BY created_at DESC
LIMIT 10;

-- Check if there are any tasks at all
SELECT COUNT(*) as total_tasks FROM object_tasks;
SELECT COUNT(*) as active_tasks FROM object_tasks WHERE is_active = true;
