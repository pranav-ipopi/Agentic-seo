-- Add backlink_limit to clients table
-- NULL means unlimited. Any integer means the client is capped at that number of successful backlinks.
ALTER TABLE public.clients
ADD COLUMN backlink_limit integer DEFAULT NULL;

-- Update the existing view or logic if needed (No other schema changes required for this)
