-- Debug: Check object_tasks for a specific object
-- Run this in Supabase SQL Editor to see what tasks exist

-- 1. See all objects with their IDs
SELECT id, name, requires_tasks 
FROM cleaning_objects 
ORDER BY created_at DESC;

-- 2. See all tasks for all objects
SELECT 
    ot.id,
    ot.object_id,
    co.name as object_name,
    ot.title,
    ot.is_active,
    ot.is_recurring,
    ot.is_special_task,
    ot.scheduled_days,
    ot.scheduled_dates,
    ot.created_at
FROM object_tasks ot
LEFT JOIN cleaning_objects co ON ot.object_id = co.id
ORDER BY ot.created_at DESC;

-- 3. Count tasks by object
SELECT 
    co.name as object_name,
    COUNT(ot.id) as total_tasks,
    SUM(CASE WHEN ot.is_active THEN 1 ELSE 0 END) as active_tasks
FROM cleaning_objects co
LEFT JOIN object_tasks ot ON co.id = ot.object_id
GROUP BY co.id, co.name
ORDER BY co.name;

-- 4. If you want to activate all tasks:
-- UPDATE object_tasks SET is_active = true;

-- 5. To manually add a test task to an object (replace OBJECT_ID):
/*
INSERT INTO object_tasks (object_id, title, is_active, is_recurring, is_special_task)
VALUES ('OBJECT_ID', 'Тестовая задача', true, false, false);
*/
