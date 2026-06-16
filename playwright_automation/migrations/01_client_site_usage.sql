-- Migration: Create client_site_usage table to track and distribute target sites evenly

CREATE TABLE IF NOT EXISTS public.client_site_usage (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    site_url text NOT NULL,
    usage_count integer NOT NULL DEFAULT 0,
    last_used_at timestamp with time zone DEFAULT now(),
    CONSTRAINT client_site_usage_pkey PRIMARY KEY (id),
    CONSTRAINT client_site_usage_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE,
    CONSTRAINT client_site_usage_client_site_unique UNIQUE (client_id, site_url)
);

-- Optional: Enable RLS if you are using it (by default, if it's internal API, it might not be strictly required)
ALTER TABLE public.client_site_usage ENABLE ROW LEVEL SECURITY;

-- Allow read/write access for authenticated users/service role
CREATE POLICY "Enable all access for authenticated users" ON public.client_site_usage
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
