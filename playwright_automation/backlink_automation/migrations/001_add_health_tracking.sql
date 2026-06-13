-- Migration: Add health tracking columns to target_sites
-- 
-- These columns enable the failure handler to track per-site health status.
-- All columns are nullable/defaulted so this is safe to run on existing data.
--
-- Run this in your Supabase SQL Editor.

ALTER TABLE public.target_sites
  ADD COLUMN IF NOT EXISTS last_success_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_type        text,
  ADD COLUMN IF NOT EXISTS consecutive_failures   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_status          text NOT NULL DEFAULT 'active'
    CHECK (health_status = ANY (ARRAY['active'::text, 'failing'::text, 'down'::text, 'disabled'::text]));

-- Index for quickly finding unhealthy sites
CREATE INDEX IF NOT EXISTS idx_target_sites_health_status
  ON public.target_sites USING btree (health_status)
  WHERE health_status != 'active';

-- Index for finding sites by failure count
CREATE INDEX IF NOT EXISTS idx_target_sites_consecutive_failures
  ON public.target_sites USING btree (consecutive_failures DESC)
  WHERE consecutive_failures > 0;
