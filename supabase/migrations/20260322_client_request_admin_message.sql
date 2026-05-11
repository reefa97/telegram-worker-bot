-- Admin can edit the client message before sending to worker
ALTER TABLE client_requests
ADD COLUMN IF NOT EXISTS admin_message TEXT;
