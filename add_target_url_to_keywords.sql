-- Migration script to add target_url to keywords table
-- Run this in your Supabase SQL Editor

ALTER TABLE public.keywords 
ADD COLUMN IF NOT EXISTS target_url text;

-- Optional: If you want to drop the old keywords that don't have a URL, or update them:
-- DELETE FROM public.keywords WHERE target_url IS NULL;
