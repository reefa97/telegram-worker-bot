-- Create worker_roles table
CREATE TABLE IF NOT EXISTS worker_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for worker_roles
ALTER TABLE worker_roles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view worker_roles
CREATE POLICY "Enable read access for authenticated users" ON worker_roles
    FOR SELECT TO authenticated USING (true);

-- Allow admins to manage worker_roles (simplified for now, anyone authenticated can insert/update for this specific app usage pattern, or restrict to admin like others)
CREATE POLICY "Enable write access for authenticated users" ON worker_roles
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add role_id to workers table
ALTER TABLE workers ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES worker_roles(id) ON DELETE SET NULL;

-- Insert default roles (optional)
INSERT INTO worker_roles (name) VALUES ('Уборщик'), ('Менеджер') ON CONFLICT (name) DO NOTHING;
