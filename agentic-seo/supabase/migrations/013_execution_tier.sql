-- Create an ENUM for execution_tier if you prefer, or just use TEXT constraint.
-- Let's use a simple TEXT CHECK constraint to keep it easy to modify.

ALTER TABLE target_sites 
ADD COLUMN IF NOT EXISTS execution_tier TEXT NOT NULL DEFAULT 'standard' 
CHECK (execution_tier IN ('standard', 'elite'));

-- Comment on column
COMMENT ON COLUMN target_sites.execution_tier IS 'Routing logic: standard runs on VPS, elite routes to Browser Use Cloud API';
