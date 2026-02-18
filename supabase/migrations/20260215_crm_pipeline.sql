-- Create helper function for updated_at if not exists
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create CRM Leads Table
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new', -- new, contacted, proposal, negotiation, won, lost
    value NUMERIC DEFAULT 0,
    contact_info JSONB DEFAULT '{}'::jsonb, -- { name, email, phone, role }
    description TEXT,
    
    assigned_to UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

-- Add updated_at trigger
CREATE TRIGGER update_crm_leads_modtime
    BEFORE UPDATE ON public.crm_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Add lead_id to admin_tasks to link tasks to leads
ALTER TABLE public.admin_tasks 
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL;

-- Policies for crm_leads

-- Super Admins: Full Access
CREATE POLICY "Super Admins can manage all leads" 
ON public.crm_leads 
FOR ALL 
TO authenticated 
USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Sub Admins: Document Owners (Assigned or Created) can View/Edit
CREATE POLICY "Users can view their own leads" 
ON public.crm_leads 
FOR SELECT 
TO authenticated 
USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
);

CREATE POLICY "Users can insert their own leads" 
ON public.crm_leads 
FOR INSERT 
TO authenticated 
WITH CHECK (
    created_by = auth.uid()
);

CREATE POLICY "Users can update their own leads" 
ON public.crm_leads 
FOR UPDATE 
TO authenticated 
USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
);

-- Allow users to see tasks linked to leads they have access to
-- (Existing policies on admin_tasks might be enough if they cover assigned_to/created_by logic for tasks themselves, 
-- but might need extension if we want people to see tasks purely because they see the lead. 
-- For now, we assume task assignment rules are sufficient.)
