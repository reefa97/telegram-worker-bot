-- Client courtesy calls tracking
-- Each client gets a call every 6 weeks from their object coordinator

CREATE TABLE IF NOT EXISTS client_courtesy_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  called_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_call_due TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '42 days'),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_courtesy_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage courtesy calls" ON client_courtesy_calls
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Add next_courtesy_call_due to admin_users for easy querying
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS next_courtesy_call_due TIMESTAMPTZ;

-- Initialize: set next_courtesy_call_due = now() for all existing clients (they need a call)
UPDATE admin_users SET next_courtesy_call_due = now() WHERE role = 'client' AND next_courtesy_call_due IS NULL;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_courtesy_call ON admin_users(next_courtesy_call_due) WHERE role = 'client';
CREATE INDEX IF NOT EXISTS idx_courtesy_calls_client ON client_courtesy_calls(client_id);
