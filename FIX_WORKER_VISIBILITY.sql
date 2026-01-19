-- EXPAND WORKER VISIBILITY (V2 - Fix Trash)
-- Fixes "Unknown Worker" AND "Deleted Workers Visible"
-- 1. Allows seeing shared workers (name fix).
-- 2. Hides deleted workers (trash fix).

DROP POLICY IF EXISTS "Admins can view accessible workers" ON workers;

CREATE POLICY "Admins can view accessible workers" ON workers
    FOR SELECT
    TO authenticated
    USING (
        (
            -- 1. Standard check: I created the worker or Super Admin
            user_can_access_worker(auth.uid(), id)
            OR
            -- 2. Extended check: Worker is assigned to one of My Objects
            id IN (
                SELECT worker_id 
                FROM worker_objects wo
                INNER JOIN cleaning_objects co ON wo.object_id = co.id
                WHERE user_can_access_object(auth.uid(), co.id)
            )
        )
        -- 3. Trash filter: Only show existing workers
        AND deleted_at IS NULL
    );
