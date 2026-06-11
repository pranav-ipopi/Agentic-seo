-- Add target_site_id to tasks and task_runs tables

ALTER TABLE public.tasks
ADD COLUMN target_site_id UUID REFERENCES public.target_sites(id);

ALTER TABLE public.task_runs
ADD COLUMN target_site_id UUID REFERENCES public.target_sites(id);
