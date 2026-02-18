-- Create admin_tasks table for the "My Cabinet" Task Dashboard

CREATE TABLE IF NOT EXISTS public.admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ NOT NULL,
    
    assigned_to UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE SET NULL,
    
    is_completed BOOLEAN DEFAULT FALSE,
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_notification_sent BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;

-- Policies
-- Super Admins can do everything
CREATE POLICY "Super Admins can manage all tasks" 
ON public.admin_tasks 
FOR ALL 
TO authenticated 
USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Guardians (Sub-admins) can view tasks assigned to them or created by them
CREATE POLICY "Guardians can view their own tasks" 
ON public.admin_tasks 
FOR SELECT 
TO authenticated 
USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
);

-- Guardians can create tasks for themselves
CREATE POLICY "Guardians can create tasks for themselves" 
ON public.admin_tasks 
FOR INSERT 
TO authenticated 
WITH CHECK (
    created_by = auth.uid() AND assigned_to = auth.uid() 
    -- Guardians cannot assign tasks to others (handled by UI, but good to enforce)
    -- Actually, if they are sub-admins, maybe they can assign to themselves only?
    -- Let's stick to "created_by = auth.uid()" and if they try to assign to someone else, check assigned_to.
);

-- Guardians can update their own tasks (e.g. mark as completed)
CREATE POLICY "Guardians can update their own tasks" 
ON public.admin_tasks 
FOR UPDATE 
TO authenticated 
USING (
    assigned_to = auth.uid() OR created_by = auth.uid()
);

-- Guardians can delete tasks they created
CREATE POLICY "Guardians can delete their own tasks" 
ON public.admin_tasks 
FOR DELETE 
TO authenticated 
USING (
    created_by = auth.uid()
);

-- Grant permissions
GRANT ALL ON public.admin_tasks TO authenticated;
GRANT ALL ON public.admin_tasks TO service_role;
