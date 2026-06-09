-- Migration: 010_task_run_logs
-- Description: Create table to store logs for task runs

CREATE TABLE IF NOT EXISTS public.task_run_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_run_id UUID NOT NULL REFERENCES public.task_runs(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries on logs per task run
CREATE INDEX IF NOT EXISTS idx_task_run_logs_task_run_id ON public.task_run_logs(task_run_id);
CREATE INDEX IF NOT EXISTS idx_task_run_logs_created_at ON public.task_run_logs(created_at);

-- Set up RLS policies
ALTER TABLE public.task_run_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view logs for tasks that belong to their clients
CREATE POLICY "Users can view logs for their clients' task runs"
    ON public.task_run_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.task_runs tr
            JOIN public.client_members cm ON tr.client_id = cm.client_id
            WHERE tr.id = task_run_logs.task_run_id
            AND cm.user_id = auth.uid()
        )
    );

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE task_run_logs;
