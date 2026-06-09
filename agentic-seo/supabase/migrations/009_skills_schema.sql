-- Create skills table
CREATE TABLE public.skills (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    skill_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    compatible_types TEXT[] NOT NULL DEFAULT '{}',
    is_inbuilt BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read skills
CREATE POLICY "Users can view skills"
    ON public.skills FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Allow all authenticated users to manage skills (as per user request: no security or role configuration)
CREATE POLICY "Users can insert skills"
    ON public.skills FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update skills"
    ON public.skills FOR UPDATE
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete skills"
    ON public.skills FOR DELETE
    USING (auth.uid() IS NOT NULL);
