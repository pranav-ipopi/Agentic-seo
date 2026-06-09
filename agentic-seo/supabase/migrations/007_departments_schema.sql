-- ============================================================
-- 007_departments_schema.sql
-- Agency OS Foundation — Multi-Department Support
-- ============================================================
-- This migration adds the department layer to the existing
-- multi-client, multi-user architecture. It is fully additive
-- and non-breaking — all Phase 1 (SEO) data is preserved.
-- ============================================================


-- -----------------------------------------------
-- DEPARTMENTS (global agency departments)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,   -- 'seo', 'execution', 'design'
  description TEXT,
  icon        TEXT,                   -- lucide icon name e.g. 'search', 'megaphone', 'palette'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read departments
CREATE POLICY "All authenticated users can view departments"
  ON public.departments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can manage departments
CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  USING (get_user_role() = 'admin');


-- -----------------------------------------------
-- DEPARTMENT MEMBERS
-- Scopes a user to a specific department within a client.
-- A user can be SEO Manager for Client A but Designer for Client B.
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.department_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Generic positional role hierarchy (not department-specific)
  dept_role     TEXT NOT NULL DEFAULT 'employee'
                  CHECK (dept_role IN ('department_head', 'team_lead', 'employee', 'client_viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, department_id, client_id)
);

-- Enable RLS
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own department memberships"
  ON public.department_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Admins can manage department members"
  ON public.department_members FOR ALL
  USING (get_user_role() = 'admin');

CREATE POLICY "Department heads can add members to their department"
  ON public.department_members FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'seo_manager')
  );


-- -----------------------------------------------
-- ADD department_id to EXISTING TABLES
-- All columns are nullable to avoid breaking Phase 1 data.
-- A NULL department_id means "global / unscoped" (legacy SEO dept data).
-- -----------------------------------------------

-- task_runs
ALTER TABLE public.task_runs
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- approvals
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- chat_sessions
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- workflow_templates
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;


-- -----------------------------------------------
-- INDEXES
-- -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_departments_slug        ON public.departments(slug);
CREATE INDEX IF NOT EXISTS idx_dept_members_user       ON public.department_members(user_id);
CREATE INDEX IF NOT EXISTS idx_dept_members_dept       ON public.department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_members_client     ON public.department_members(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_department        ON public.tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_task_runs_department    ON public.task_runs(department_id);
CREATE INDEX IF NOT EXISTS idx_approvals_department    ON public.approvals(department_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_dept      ON public.chat_sessions(department_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_dept ON public.workflow_templates(department_id);


-- -----------------------------------------------
-- SEED DATA — The 3 Agency Departments
-- -----------------------------------------------
INSERT INTO public.departments (id, name, slug, description, icon) VALUES
(
  'aaaaaaaa-0001-0001-0001-000000000001',
  'SEO Department',
  'seo',
  'Handles keyword research, backlink building, content strategy, rank tracking, and technical SEO.',
  'search'
),
(
  'aaaaaaaa-0002-0002-0002-000000000002',
  'Execution Department',
  'execution',
  'Handles social media scheduling, content publishing, email campaigns, and client communication.',
  'megaphone'
),
(
  'aaaaaaaa-0003-0003-0003-000000000003',
  'Design Department',
  'design',
  'Handles creative requests, brand assets, image generation, video production, and design approvals.',
  'palette'
)
ON CONFLICT (slug) DO NOTHING;


-- -----------------------------------------------
-- BACKFILL: Link the existing Backlink Campaign workflow to SEO
-- -----------------------------------------------
UPDATE public.workflow_templates
  SET department_id = 'aaaaaaaa-0001-0001-0001-000000000001'
  WHERE department_id IS NULL;


-- -----------------------------------------------
-- REALTIME: enable for departments
-- -----------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.departments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.department_members;
