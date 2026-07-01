-- SQL Migration to add Campaign Keywords and Clusters tables for the new Keyword Dashboard

-- 1. Campaign Keywords Table
CREATE TABLE public.campaign_keywords (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid, -- Foreign key to campaigns
  client_id uuid NOT NULL, -- To enforce RLS
  keyword text NOT NULL,
  volume integer,
  difficulty integer,
  cpc numeric,
  trend text,
  potential text,
  cluster text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_keywords_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_keywords_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT campaign_keywords_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id)
);

-- RLS Policies (Assuming you use them based on standard Supabase setup)
ALTER TABLE public.campaign_keywords ENABLE ROW LEVEL SECURITY;

-- Optional: Add policies (adjust to your specific auth logic if needed)
CREATE POLICY "Enable read access for authenticated users" ON public.campaign_keywords FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert access for authenticated users" ON public.campaign_keywords FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update access for authenticated users" ON public.campaign_keywords FOR UPDATE USING (auth.role() = 'authenticated');
