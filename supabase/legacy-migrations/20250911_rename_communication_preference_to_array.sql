-- Migration: Convert clients.communication_preference (TEXT) to clients.communication_preferences (TEXT[])
-- Safe, idempotent-ish approach with transactional guards.

BEGIN;

-- 1) Add new column if not exists
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS communication_preferences TEXT[];

-- 2) Backfill from single-value column if array is null and old column has value
UPDATE public.clients
SET communication_preferences = ARRAY[communication_preference]
WHERE communication_preferences IS NULL AND communication_preference IS NOT NULL;

-- 3) Add CHECK constraint to ensure only allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_communication_preferences_allowed_values'
  ) THEN
    ALTER TABLE public.clients
    ADD CONSTRAINT clients_communication_preferences_allowed_values
    CHECK (
      communication_preferences IS NULL OR
      NOT EXISTS (
        SELECT 1 FROM unnest(communication_preferences) v
        WHERE v NOT IN ('email','phone','whatsapp','teams','slack','other')
      )
    );
  END IF;
END$$;

-- 4) Create GIN index for faster search/filter if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_clients_comm_prefs_gin'
  ) THEN
    CREATE INDEX idx_clients_comm_prefs_gin ON public.clients USING GIN (communication_preferences);
  END IF;
END$$;

-- 5) Optional: drop old column only if explicitly desired (kept for now)
-- ALTER TABLE public.clients DROP COLUMN communication_preference;

COMMIT;