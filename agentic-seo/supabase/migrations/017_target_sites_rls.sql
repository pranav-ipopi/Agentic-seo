-- 017_target_sites_rls.sql

-- Enable RLS
ALTER TABLE public.target_sites ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all target sites
CREATE POLICY "Allow authenticated users to read target_sites"
ON public.target_sites FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert target sites
CREATE POLICY "Allow authenticated users to insert target_sites"
ON public.target_sites FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update target sites
CREATE POLICY "Allow authenticated users to update target_sites"
ON public.target_sites FOR UPDATE TO authenticated USING (true);

-- Allow authenticated users to delete target sites
CREATE POLICY "Allow authenticated users to delete target_sites"
ON public.target_sites FOR DELETE TO authenticated USING (true);
