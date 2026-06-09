-- Create keywords table
CREATE TABLE public.keywords (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    landing_page TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;

-- Keyword RLS Policies
CREATE POLICY "Users can view keywords for their clients"
    ON public.keywords FOR SELECT
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

CREATE POLICY "Users can insert keywords for their clients"
    ON public.keywords FOR INSERT
    WITH CHECK (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

CREATE POLICY "Users can update keywords for their clients"
    ON public.keywords FOR UPDATE
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

CREATE POLICY "Users can delete keywords for their clients"
    ON public.keywords FOR DELETE
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );


-- Create backlinks table
CREATE TABLE public.backlinks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    keyword_id UUID REFERENCES public.keywords(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    da NUMERIC,
    pa NUMERIC,
    spam_score NUMERIC,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'verified')),
    result_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.backlinks ENABLE ROW LEVEL SECURITY;

-- Backlink RLS Policies
CREATE POLICY "Users can view backlinks for their clients"
    ON public.backlinks FOR SELECT
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

CREATE POLICY "Users can insert backlinks for their clients"
    ON public.backlinks FOR INSERT
    WITH CHECK (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

CREATE POLICY "Users can update backlinks for their clients"
    ON public.backlinks FOR UPDATE
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );

CREATE POLICY "Users can delete backlinks for their clients"
    ON public.backlinks FOR DELETE
    USING (
        client_id IN (SELECT client_id FROM client_members WHERE user_id = auth.uid())
        OR get_user_role() = 'admin'
    );
