-- ============================================================
-- 008_task_run_approvals.sql
-- Link approvals back to the workflow task_run that created them
-- so that approving/rejecting can automatically resume execution.
-- ============================================================

-- Add task_run_id to approvals (nullable — legacy approvals have no task_run)
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS task_run_id UUID REFERENCES public.task_runs(id) ON DELETE SET NULL;

-- Index for fast lookup when resuming a workflow
CREATE INDEX IF NOT EXISTS idx_approvals_task_run ON public.approvals(task_run_id);
