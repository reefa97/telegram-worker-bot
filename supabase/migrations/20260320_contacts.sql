-- Contacts: useful people, subcontractors, service providers
CREATE TABLE IF NOT EXISTS contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    company TEXT,
    category TEXT,
    notes TEXT,
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contacts" ON contacts
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Service role full access contacts" ON contacts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
