CREATE TABLE IF NOT EXISTS public.campaign_mission_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','provider_paused','active','paused','archived')),
  snapshot_payload JSONB NOT NULL CHECK (jsonb_typeof(snapshot_payload)='object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  approved_subject_hash TEXT CHECK (approved_subject_hash IS NULL OR approved_subject_hash ~ '^[a-f0-9]{64}$'),
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id,mission_id,version_number)
);

CREATE TABLE IF NOT EXISTS public.campaign_creative_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  campaign_version_id UUID NOT NULL REFERENCES public.campaign_mission_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  snapshot_payload JSONB NOT NULL CHECK (jsonb_typeof(snapshot_payload)='object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_version_id,position)
);

CREATE TABLE IF NOT EXISTS public.campaign_acquisition_asset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  campaign_version_id UUID NOT NULL REFERENCES public.campaign_mission_versions(id) ON DELETE CASCADE,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('landing_page','lead_form','tracking')),
  source_entity_id UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','approved','archived')),
  snapshot_payload JSONB NOT NULL CHECK (jsonb_typeof(snapshot_payload)='object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_version_id,asset_kind)
);

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS active_mission_version_id UUID REFERENCES public.campaign_mission_versions(id) ON DELETE SET NULL;

ALTER TABLE public.ad_provider_mutation_runs ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE SET NULL;
ALTER TABLE public.ad_provider_mutation_runs ADD COLUMN IF NOT EXISTS action_run_id UUID REFERENCES public.action_runs(id) ON DELETE SET NULL;
ALTER TABLE public.ad_provider_mutation_runs ADD COLUMN IF NOT EXISTS request_hash TEXT CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE public.ad_provider_mutation_runs ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE public.ad_provider_mutation_runs ADD COLUMN IF NOT EXISTS approved_subject_hash TEXT CHECK (approved_subject_hash IS NULL OR approved_subject_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.ad_provider_mutation_runs DROP CONSTRAINT IF EXISTS ad_provider_mutation_runs_action_check;
ALTER TABLE public.ad_provider_mutation_runs ADD CONSTRAINT ad_provider_mutation_runs_action_check
  CHECK (action IN ('create_campaign','activate_campaign','update_budget','pause_campaign','sync_metrics'));
ALTER TABLE public.ad_provider_mutation_runs DROP CONSTRAINT IF EXISTS ad_provider_mutation_runs_status_check;
ALTER TABLE public.ad_provider_mutation_runs ADD CONSTRAINT ad_provider_mutation_runs_status_check
  CHECK (status IN ('pending','running','succeeded','failed','unknown','manual_review'));

CREATE INDEX IF NOT EXISTS idx_campaign_mission_versions_mission ON public.campaign_mission_versions(mission_id,version_number DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_creative_versions_campaign ON public.campaign_creative_versions(campaign_version_id,position);
CREATE INDEX IF NOT EXISTS idx_campaign_acquisition_versions_campaign ON public.campaign_acquisition_asset_versions(campaign_version_id,asset_kind);
CREATE INDEX IF NOT EXISTS idx_campaign_provider_mutations_mission ON public.ad_provider_mutation_runs(mission_id,created_at DESC);

CREATE OR REPLACE FUNCTION private.guard_campaign_mission_version_payload()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.snapshot_payload IS DISTINCT FROM OLD.snapshot_payload OR NEW.content_hash IS DISTINCT FROM OLD.content_hash) THEN
    RAISE EXCEPTION 'campaign_mission_version_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS campaign_mission_version_payload_immutable ON public.campaign_mission_versions;
CREATE TRIGGER campaign_mission_version_payload_immutable BEFORE UPDATE ON public.campaign_mission_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_campaign_mission_version_payload();

DO $campaign_mission_rls$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['campaign_mission_versions','campaign_creative_versions','campaign_acquisition_asset_versions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_read', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_write', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (private.rls_can_access_organization(organization_id))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal())', table_name || '_write', table_name);
  END LOOP;
END;
$campaign_mission_rls$;
