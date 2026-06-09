-- Add metadata column to backlinks table to store AI outputs like title, username, etc.
ALTER TABLE public.backlinks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
