-- Salary adjustments: overtime and advances
CREATE TABLE IF NOT EXISTS salary_adjustments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    type TEXT NOT NULL CHECK (type IN ('overtime', 'advance')),
    amount NUMERIC(10,2) NOT NULL,
    hours NUMERIC(6,2),
    hourly_rate NUMERIC(10,2),
    description TEXT,
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_salary_adjustments_worker_period
ON salary_adjustments(worker_id, year, month);

-- RLS
ALTER TABLE salary_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage salary_adjustments" ON salary_adjustments
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Service role full access salary_adjustments" ON salary_adjustments
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
