create table if not exists jobs (
  id uuid default gen_random_uuid() primary key,
  url text not null,
  action text default 'visit',
  selector text,
  fields jsonb,
  submit_selector text,
  status text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  retry_count int default 0,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_jobs_status_created_at on jobs(status, created_at);
