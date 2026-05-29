-- Migration: add currency column to public.projects (idempotent)
-- Purpose: Ensure projects.currency exists with VARCHAR(3) NOT NULL DEFAULT 'BRL' and a format CHECK
-- Safety: Idempotent, skips if table/column/constraint already exist

-- If your PostgREST cache is stale, the NOTIFY at the end will trigger a schema reload

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'Table public.projects does not exist; skipping currency migration.';
  ELSE
    -- 1) Add column if it does not exist yet, with DEFAULT and NOT NULL to backfill existing rows efficiently
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'projects'
        AND column_name  = 'currency'
    ) THEN
      ALTER TABLE public.projects
        ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'BRL';
    ELSE
      -- Column already exists: ensure default/backfill and not-null without changing type
      -- Backfill null/empty values to 'BRL'
      UPDATE public.projects
         SET currency = 'BRL'
       WHERE currency IS NULL OR currency = '';

      -- Ensure default is set
      ALTER TABLE public.projects
        ALTER COLUMN currency SET DEFAULT 'BRL';

      -- Ensure NOT NULL (with safety retry if needed)
      BEGIN
        ALTER TABLE public.projects
          ALTER COLUMN currency SET NOT NULL;
      EXCEPTION
        WHEN not_null_violation THEN
          UPDATE public.projects SET currency = 'BRL' WHERE currency IS NULL;
          ALTER TABLE public.projects ALTER COLUMN currency SET NOT NULL;
      END;
    END IF;

    -- 2) Add CHECK constraint enforcing ISO 4217-like format (3 uppercase letters), only if missing
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.conname = 'projects_currency_is_iso3'
        AND n.nspname = 'public'
        AND t.relname = 'projects'
    ) THEN
      ALTER TABLE public.projects
        ADD CONSTRAINT projects_currency_is_iso3
        CHECK (currency ~ '^[A-Z]{3}$');
    END IF;

    -- Optional: document the column
    COMMENT ON COLUMN public.projects.currency IS 'ISO 4217 currency code (3-letter uppercase), default BRL.';
  END IF;
END
$$;

-- Ask PostgREST to refresh schema cache (helps avoid PGRST204 after DDL)
NOTIFY pgrst, 'reload schema';