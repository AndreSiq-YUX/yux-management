-- Mission-owned, versioned drafts for the Funnel + Nurture vertical.

CREATE TABLE IF NOT EXISTS public.action_mission_command_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  command_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, command_key, idempotency_key)
);

ALTER TABLE public.crm_pipeline_versions
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS action_run_id UUID REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS action_run_id UUID REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.email_template_versions
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.crm_sequences
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS action_run_id UUID REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS active_version_id UUID;

CREATE TABLE IF NOT EXISTS public.crm_sequence_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  sequence_id UUID NOT NULL REFERENCES public.crm_sequences(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  action_run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sequence_id, version_number),
  UNIQUE (sequence_id, content_hash)
);

ALTER TABLE public.crm_sequences DROP CONSTRAINT IF EXISTS crm_sequences_active_version_fk;
ALTER TABLE public.crm_sequences ADD CONSTRAINT crm_sequences_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES public.crm_sequence_versions(id) ON DELETE SET NULL;

ALTER TABLE public.crm_sequence_steps
  ADD COLUMN IF NOT EXISTS template_version_id UUID REFERENCES public.email_template_versions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_action_mission_command_results_mission ON public.action_mission_command_results(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_sequence_versions_mission ON public.crm_sequence_versions(mission_id, created_at);

ALTER TABLE public.action_mission_command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_mission_command_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_mission_command_results_internal ON public.action_mission_command_results;
CREATE POLICY action_mission_command_results_internal ON public.action_mission_command_results
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

ALTER TABLE public.crm_sequence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequence_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_sequence_versions_tenant ON public.crm_sequence_versions;
CREATE POLICY crm_sequence_versions_tenant ON public.crm_sequence_versions
  FOR SELECT USING (private.rls_is_internal() OR private.rls_can_access_organization(organization_id));
DROP POLICY IF EXISTS crm_sequence_versions_internal_write ON public.crm_sequence_versions;
CREATE POLICY crm_sequence_versions_internal_write ON public.crm_sequence_versions
  FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());
