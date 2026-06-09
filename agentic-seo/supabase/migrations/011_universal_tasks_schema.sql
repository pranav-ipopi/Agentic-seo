-- ============================================================
-- 011_universal_tasks_schema.sql
-- Agentic SEO — Universal Task Queue Architecture
-- ============================================================

-- -----------------------------------------------
-- CAMPAIGNS
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  department_id  UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL, -- e.g., 'backlink_campaign', 'article_campaign'
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused')),
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Users can view campaigns for their clients/departments
CREATE POLICY "Users can view campaigns for their clients"
  ON public.campaigns FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM public.department_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

-- Users can insert campaigns for their clients
CREATE POLICY "Users can insert campaigns for their clients"
  ON public.campaigns FOR INSERT
  WITH CHECK (
    client_id IN (SELECT client_id FROM public.department_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

-- Users can update campaigns for their clients
CREATE POLICY "Users can update campaigns for their clients"
  ON public.campaigns FOR UPDATE
  USING (
    client_id IN (SELECT client_id FROM public.department_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "Users can delete campaigns for their clients"
  ON public.campaigns FOR DELETE
  USING (
    client_id IN (SELECT client_id FROM public.department_members WHERE user_id = auth.uid())
    OR get_user_role() = 'admin'
  );

-- -----------------------------------------------
-- UPDATE EXISTING TASKS TABLE
-- -----------------------------------------------
-- We evolve the existing `tasks` table to support the universal
-- job queue architecture without breaking existing chat tasks.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type TEXT, -- 'backlink_submission', 'article_creation'
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb, -- input configuration
  ADD COLUMN IF NOT EXISTS result JSONB DEFAULT '{}'::jsonb, -- output data (e.g. final_url)
  ADD COLUMN IF NOT EXISTS assigned_to TEXT; -- which worker/subagent is executing this

-- Add INDEX for fast queue polling
CREATE INDEX IF NOT EXISTS idx_tasks_campaign ON public.tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status_type ON public.tasks(status, type);

-- -----------------------------------------------
-- REALTIME
-- -----------------------------------------------
-- Ensure realtime is enabled for live UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
-- (Assuming public.tasks is already in supabase_realtime from 001_initial_schema.sql, but safely repeat)
-- We comment this out to prevent the ERROR: 42710 relation "tasks" is already member of publication.
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
