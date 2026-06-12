-- ============================================================
-- 016_target_sites_template_id.sql
-- Agentic SEO — Site Template Identification
-- ============================================================
-- Adds a site_id column to target_sites so the VPS worker knows
-- which automation script to route a task to.
-- The detect-site-templates edge function fills this in automatically.
-- ============================================================

-- Create the ENUM for supported automation template types
CREATE TYPE public.site_template AS ENUM (
    'pligg',      -- Pligg CMS / Kliqqi social bookmarker
    'phpld',      -- PHP Link Directory
    'scuttle',    -- Scuttle / SemanticScuttle bookmarking
    'drigg',      -- Drupal Drigg bookmarking module
    'unknown'     -- Detected but no matching template available
);

-- Add site_id column to target_sites
-- NULL = not yet fingerprinted by the edge function
ALTER TABLE public.target_sites
    ADD COLUMN IF NOT EXISTS site_id public.site_template;

-- Optional index for worker queries filtering by site_id
CREATE INDEX IF NOT EXISTS idx_target_sites_site_id
    ON public.target_sites (site_id);
