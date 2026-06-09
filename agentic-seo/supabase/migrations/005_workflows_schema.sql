-- Create workflow_templates table
CREATE TABLE public.workflow_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read workflow templates (they are global for the agency)
CREATE POLICY "Users can view workflow templates"
    ON public.workflow_templates FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Only admins can create/update/delete workflow templates
CREATE POLICY "Admins can manage workflow templates"
    ON public.workflow_templates FOR ALL
    USING (get_user_role() = 'admin');

-- Create task_runs table
CREATE TABLE public.task_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    workflow_template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'waiting_approval', 'completed', 'failed')),
    current_step_index INTEGER NOT NULL DEFAULT 0,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.task_runs ENABLE ROW LEVEL SECURITY;

-- Users can view task_runs for their clients
CREATE POLICY "Users can view task runs for their clients"
    ON public.task_runs FOR SELECT
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

-- Users can insert task_runs for their clients
CREATE POLICY "Users can insert task runs for their clients"
    ON public.task_runs FOR INSERT
    WITH CHECK (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

-- Users can update task_runs for their clients
CREATE POLICY "Users can update task runs for their clients"
    ON public.task_runs FOR UPDATE
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

-- Users can delete task_runs for their clients
CREATE POLICY "Users can delete task runs for their clients"
    ON public.task_runs FOR DELETE
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );


-- Insert Seed Data for Workflow Templates
INSERT INTO public.workflow_templates (id, name, description, steps) VALUES 
(
    '11111111-1111-1111-1111-111111111111', 
    'Backlink Campaign', 
    'End-to-end backlink building campaign including prospecting, approval, submission, and verification.',
    '[
        {"type": "hermes_task", "skill": "find_backlink_opportunities", "name": "Research & Prospecting"},
        {"type": "approval", "name": "Review Opportunities"},
        {"type": "browser_use_task", "skill": "submit_bookmarks", "name": "Submission"},
        {"type": "hermes_task", "skill": "verify_backlinks", "name": "Verification & Reporting"}
    ]'::jsonb
);
