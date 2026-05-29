-- Migrate clients.communication_preference (TEXT) to communication_preferences (TEXT[]) with backfill, constraints, and index
BEGIN;

-- 1) Add new column with default
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS communication_preferences TEXT[] NOT NULL DEFAULT ARRAY['whatsapp']::text[];

-- 2) Backfill from old column if present
UPDATE public.clients
SET communication_preferences = ARRAY[communication_preference]
WHERE communication_preference IS NOT NULL
  AND communication_preference <> '';

-- 3) Add CHECK constraint to restrict allowed values (including 'slack')
ALTER TABLE public.clients
  ADD CONSTRAINT clients_communication_preferences_allowed
  CHECK (communication_preferences <@ ARRAY['whatsapp','email','phone','slack','other']::text[]);

-- 4) Create GIN index for efficient querying
CREATE INDEX IF NOT EXISTS idx_clients_communication_preferences
  ON public.clients USING GIN (communication_preferences);

-- 5) Drop old CHECK constraint on communication_preference if exists (best-effort)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'clients'
      AND c.conname = 'clients_communication_preference_check'
  ) THEN
    ALTER TABLE public.clients DROP CONSTRAINT clients_communication_preference_check;
  END IF;
END$$;

-- 6) Drop old column
ALTER TABLE public.clients
  DROP COLUMN IF EXISTS communication_preference;

COMMIT;