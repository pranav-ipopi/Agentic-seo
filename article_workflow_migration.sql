-- Step 1: Add type column to task_runs to differentiate job types
ALTER TABLE public.task_runs 
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'backlink';

-- Backfill all existing rows (should auto-apply via DEFAULT, but explicit is safer)
UPDATE public.task_runs 
  SET type = 'backlink' 
  WHERE type IS NULL OR type = '';

-- Step 2: Insert Article Submission workflow template
INSERT INTO public.workflow_templates (name, description, steps) VALUES (
  'Article Submission',
  'Auto-submits keyword-optimized articles to high-DA platforms (Blogger, Tumblr, SlideShare, etc.) using BrowserUse cloud profiles. LLM generates article body from your title + description + keywords.',
  '[
    {"name": "Article Submission", "type": "browser_use_task", "skill": null},
    {"name": "Verify & Log", "type": "hermes_task", "skill": null}
  ]'::jsonb
);
