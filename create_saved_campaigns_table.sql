-- Migration script to create saved_campaign_configs table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.saved_campaign_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name text NOT NULL,
  template_id uuid NOT NULL,
  config jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saved_campaign_configs_pkey PRIMARY KEY (id),
  CONSTRAINT saved_campaign_configs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT saved_campaign_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- RLS Policies (enable if RLS is enforced)
ALTER TABLE public.saved_campaign_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select on saved_campaign_configs for authenticated users" 
ON public.saved_campaign_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert on saved_campaign_configs for authenticated users" 
ON public.saved_campaign_configs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update on saved_campaign_configs for creators" 
ON public.saved_campaign_configs FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Allow delete on saved_campaign_configs for creators" 
ON public.saved_campaign_configs FOR DELETE TO authenticated USING (auth.uid() = created_by);
