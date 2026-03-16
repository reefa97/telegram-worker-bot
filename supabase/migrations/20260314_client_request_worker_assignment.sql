-- Add worker assignment fields to client_requests
ALTER TABLE client_requests
  ADD COLUMN IF NOT EXISTS assigned_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_message text,
  ADD COLUMN IF NOT EXISTS worker_task_status text CHECK (worker_task_status IN ('pending', 'confirmed', 'failed'));
