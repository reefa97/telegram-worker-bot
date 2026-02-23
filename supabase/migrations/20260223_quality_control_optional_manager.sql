-- Drop the NOT NULL constraint on manager_id in quality_check_schedules
ALTER TABLE quality_check_schedules ALTER COLUMN manager_id DROP NOT NULL;

-- Update existing schedules to use NULL where manager_id is already the object's owner
UPDATE quality_check_schedules qs
SET manager_id = NULL
WHERE manager_id = (
    SELECT admin_id 
    FROM object_owners 
    WHERE object_id = qs.object_id 
    LIMIT 1
);
