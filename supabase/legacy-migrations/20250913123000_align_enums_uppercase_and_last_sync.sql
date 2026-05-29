-- Align enums to uppercase values expected by the frontend and ensure campaigns.last_sync_at exists
-- This migration is idempotent and maps existing lowercase/legacy values to the new enums.

-- 1) Campaign status enum -> ACTIVE | PAUSED | ENDED
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status_new') THEN
    CREATE TYPE campaign_status_new AS ENUM ('ACTIVE','PAUSED','ENDED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='campaigns' AND column_name='status'
  ) THEN
    ALTER TABLE public.campaigns
      ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.campaigns
      ALTER COLUMN status TYPE campaign_status_new USING
        CASE
          WHEN status::text IN ('ACTIVE','PAUSED','ENDED') THEN status::text::campaign_status_new
          WHEN status::text = 'active' THEN 'ACTIVE'::campaign_status_new
          WHEN status::text = 'paused' THEN 'PAUSED'::campaign_status_new
          WHEN status::text IN ('completed','ended') THEN 'ENDED'::campaign_status_new
          WHEN status::text = 'cancelled' THEN 'ENDED'::campaign_status_new
          WHEN status::text = 'draft' THEN 'PAUSED'::campaign_status_new
          ELSE 'PAUSED'::campaign_status_new
        END;

    ALTER TABLE public.campaigns ALTER COLUMN status SET DEFAULT 'ACTIVE';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
    DROP TYPE campaign_status;
  END IF;
  ALTER TYPE campaign_status_new RENAME TO campaign_status;
END $$;

-- 2) Project status enum -> PLANNING | ACTIVE | REVIEW | COMPLETED | CANCELLED | ARCHIVED
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status_new') THEN
    CREATE TYPE project_status_new AS ENUM ('PLANNING','ACTIVE','REVIEW','COMPLETED','CANCELLED','ARCHIVED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='projects' AND column_name='status'
  ) THEN
    ALTER TABLE public.projects
      ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.projects
      ALTER COLUMN status TYPE project_status_new USING
        CASE
          WHEN status::text IN ('PLANNING','ACTIVE','REVIEW','COMPLETED','CANCELLED','ARCHIVED') THEN status::text::project_status_new
          WHEN status::text = 'planning' THEN 'PLANNING'::project_status_new
          WHEN status::text IN ('active','in_progress') THEN 'ACTIVE'::project_status_new
          WHEN status::text = 'review' THEN 'REVIEW'::project_status_new
          WHEN status::text = 'completed' THEN 'COMPLETED'::project_status_new
          WHEN status::text = 'cancelled' THEN 'CANCELLED'::project_status_new
          WHEN status::text = 'archived' THEN 'ARCHIVED'::project_status_new
          WHEN status::text = 'on_hold' THEN 'PLANNING'::project_status_new
          ELSE 'PLANNING'::project_status_new
        END;

    ALTER TABLE public.projects ALTER COLUMN status SET DEFAULT 'PLANNING';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    DROP TYPE project_status;
  END IF;
  ALTER TYPE project_status_new RENAME TO project_status;
END $$;

-- 3) Ensure campaigns.last_sync_at exists, has default and is not null
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
UPDATE public.campaigns SET last_sync_at = COALESCE(last_sync_at, NOW());
ALTER TABLE public.campaigns ALTER COLUMN last_sync_at SET DEFAULT NOW();
ALTER TABLE public.campaigns ALTER COLUMN last_sync_at SET NOT NULL;