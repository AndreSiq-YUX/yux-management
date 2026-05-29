-- Stabilize the current CRM schema used by the React/Supabase frontend.
-- This migration is intentionally idempotent so it can be applied after the
-- historical migrations, which contain mixed legacy schemas.

-- Project status must include every status the frontend can write.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'PAUSED';
    ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'ARCHIVED';
  END IF;
END
$$;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'OTHER';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BRL';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completed_tasks INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS total_tasks INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS team_members UUID[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (status::text IN ('PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'PAUSED', 'CANCELLED', 'ARCHIVED'));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_priority_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT'));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_check CHECK (type IN ('WEBSITE', 'ECOMMERCE', 'MOBILE_APP', 'MARKETING', 'BRANDING', 'CONSULTING', 'OTHER'));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_progress_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_progress_check CHECK (progress >= 0 AND progress <= 100);

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_currency_is_iso3;
ALTER TABLE public.projects ADD CONSTRAINT projects_currency_is_iso3 CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS budget DECIMAL(15,2) DEFAULT 0;
ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(15,2) DEFAULT 0;
ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.project_phases ALTER COLUMN status SET DEFAULT 'planning';
ALTER TABLE public.project_phases DROP CONSTRAINT IF EXISTS project_phases_status_check;
ALTER TABLE public.project_phases ADD CONSTRAINT project_phases_status_check CHECK (status::text IN ('planning', 'in_progress', 'completed', 'on_hold'));

ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(8,2);
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(8,2);
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_status_check CHECK (status::text IN ('pending', 'in_progress', 'completed', 'cancelled'));
ALTER TABLE public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_priority_check;
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_priority_check CHECK (priority::text IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS platform VARCHAR(20) NOT NULL DEFAULT 'GOOGLE';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS spent DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS impressions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS conversions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS cpc DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS ctr DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS roas DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_platform_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_platform_check CHECK (platform::text IN ('GOOGLE', 'META'));
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK (status::text IN ('ACTIVE', 'PAUSED', 'ENDED'));

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage VARCHAR(30) NOT NULL DEFAULT 'NEW';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS value DECIMAL(15,2);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

UPDATE public.leads
SET stage = UPPER(COALESCE(stage, status::text, 'NEW'))
WHERE stage IS NULL OR stage = '';

NOTIFY pgrst, 'reload schema';
