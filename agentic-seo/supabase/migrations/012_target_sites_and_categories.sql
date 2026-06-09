-- ============================================================
-- 012_target_sites_and_categories.sql
-- Agentic SEO — Target Sites Inventory and Categories
-- ============================================================

-- Create ENUM for categories
CREATE TYPE public.backlink_category AS ENUM (
    'bookmarking', 
    'article_submission', 
    'web20', 
    'profile', 
    'guest_post'
);

-- Create target_sites inventory table
CREATE TABLE IF NOT EXISTS public.target_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    category public.backlink_category NOT NULL,
    da NUMERIC,
    pa NUMERIC,
    spam_score NUMERIC,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add category to existing backlinks table
ALTER TABLE public.backlinks 
ADD COLUMN IF NOT EXISTS category public.backlink_category;

-- Note: We are keeping the old status ENUM and structure for backwards compatibility
-- but we might want to migrate old rows to a default category later if needed.
