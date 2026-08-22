-- Outcome-first Action Engine foundation.
-- Postgres is the business source of truth; queues only schedule durable rows.

CREATE TABLE IF NOT EXISTS public.action_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_pack_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.action_packs(id) ON DELETE RESTRICT,
  semantic_version TEXT NOT NULL CHECK (semantic_version ~ '^\d+\.\d+\.\d+$'),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  outcome_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published_for_internal_pilot', 'published', 'retired')),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, semantic_version),
  UNIQUE (content_hash)
);

CREATE TABLE IF NOT EXISTS public.action_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE RESTRICT,
  pack_version_id UUID NOT NULL REFERENCES public.action_pack_versions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  objective TEXT NOT NULL CHECK (BTRIM(objective) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','qualifying','planning','pending_plan_approval','ready','active','paused','blocked','evaluating','pending_replan_approval','succeeded','failed','expired','cancelled')),
  mode TEXT NOT NULL DEFAULT 'assisted' CHECK (mode IN ('shadow','prepare','assisted')),
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(parameters) = 'object'),
  budget JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(budget) = 'object'),
  create_idempotency_key TEXT NOT NULL CHECK (BTRIM(create_idempotency_key) <> ''),
  deadline_at TIMESTAMPTZ,
  active_plan_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  blocked_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_missions_create_idempotency
  ON public.action_missions(organization_id, create_idempotency_key);

CREATE TABLE IF NOT EXISTS public.action_mission_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  metric_key TEXT NOT NULL,
  value_kind TEXT NOT NULL CHECK (value_kind IN ('known','unknown','not_applicable')),
  numeric_value NUMERIC(24,6),
  unit TEXT NOT NULL,
  reason TEXT,
  source_type TEXT,
  source_record_id UUID,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((value_kind = 'known' AND numeric_value IS NOT NULL) OR (value_kind <> 'known' AND numeric_value IS NULL))
);

CREATE TABLE IF NOT EXISTS public.action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','validating','invalid','pending_approval','approved','active','superseded','completed','cancelled')),
  pack_version_id UUID NOT NULL REFERENCES public.action_pack_versions(id) ON DELETE RESTRICT,
  pack_content_hash TEXT NOT NULL CHECK (pack_content_hash ~ '^[a-f0-9]{64}$'),
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[a-f0-9]{64}$'),
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(parameters) = 'object'),
  deviations JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(deviations) = 'array'),
  proposed_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(proposed_payload) = 'object'),
  compiled_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(compiled_payload) = 'object'),
  estimated_economics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(estimated_economics) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, revision),
  UNIQUE (mission_id, plan_hash)
);

ALTER TABLE public.action_missions
  DROP CONSTRAINT IF EXISTS action_missions_active_plan_id_fkey;
ALTER TABLE public.action_missions
  ADD CONSTRAINT action_missions_active_plan_id_fkey
  FOREIGN KEY (active_plan_id) REFERENCES public.action_plans(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.action_plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  step_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  capability_key TEXT NOT NULL,
  capability_version INTEGER NOT NULL CHECK (capability_version > 0),
  depends_on TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  parameters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(parameters) = 'object'),
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  extension_point TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, step_key),
  UNIQUE (plan_id, position)
);

CREATE TABLE IF NOT EXISTS public.action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  plan_step_id UUID NOT NULL REFERENCES public.action_plan_steps(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','waiting_approval','queued','running','retry_scheduled','succeeded','failed','blocked','skipped','cancelled')),
  idempotency_key TEXT NOT NULL CHECK (BTRIM(idempotency_key) <> ''),
  input JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input) = 'object'),
  output JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output) = 'object'),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claimed_by TEXT,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key),
  UNIQUE (plan_id, plan_step_id)
);

CREATE TABLE IF NOT EXISTS public.action_run_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','cancelled')),
  provider_request_id TEXT,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_snapshot) = 'object'),
  output_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_snapshot) = 'object'),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.action_cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  run_id UUID REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  attempt_id UUID REFERENCES public.action_run_attempts(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('ai','provider','media','human','external_service','infrastructure_variable')),
  nature TEXT NOT NULL CHECK (nature IN ('estimated','reserved','actual','reversal')),
  source_type TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (BTRIM(idempotency_key) <> ''),
  amount_original NUMERIC(24,6) NOT NULL,
  currency_original TEXT NOT NULL CHECK (currency_original ~ '^[A-Z]{3}$'),
  exchange_rate_to_brl NUMERIC(24,10) NOT NULL CHECK (exchange_rate_to_brl > 0),
  amount_brl NUMERIC(24,6) NOT NULL,
  human_minutes NUMERIC(12,2) CHECK (human_minutes IS NULL OR human_minutes >= 0),
  human_hourly_rate_brl NUMERIC(18,6) CHECK (human_hourly_rate_brl IS NULL OR human_hourly_rate_brl >= 0),
  reverses_entry_id UUID REFERENCES public.action_cost_entries(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key),
  UNIQUE (organization_id, source_type, source_event_key),
  CHECK ((nature = 'reversal' AND reverses_entry_id IS NOT NULL) OR (nature <> 'reversal' AND reverses_entry_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  plan_id UUID REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  run_id UUID REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('plan','action','budget_increase','scope_change','replan','exception','population','external_effect','canary')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','changes_requested','expired','cancelled')),
  subject_hash TEXT NOT NULL,
  requested_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(requested_payload) = 'object'),
  decision_reason TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  observation_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_record_id UUID,
  source_event_id UUID REFERENCES public.domain_events(id) ON DELETE SET NULL,
  correlation_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.action_mission_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  role TEXT NOT NULL,
  ownership_mode TEXT NOT NULL CHECK (ownership_mode IN ('observe','shared','exclusive')),
  conflict_policy TEXT NOT NULL DEFAULT 'mission_wins' CHECK (conflict_policy IN ('allow_disjoint','mission_wins','block_new')),
  allowed_action_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, entity_type, entity_id, role)
);

CREATE TABLE IF NOT EXISTS public.action_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  plan_id UUID REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  checkpoint_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('continue','pause','replan','succeed','fail','expire')),
  metric_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metric_snapshot) = 'object'),
  economics_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(economics_snapshot) = 'object'),
  rationale JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rationale) = 'object'),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key),
  UNIQUE (mission_id, checkpoint_key, evaluated_at)
);

CREATE TABLE IF NOT EXISTS public.action_capability_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL,
  capability_version INTEGER NOT NULL CHECK (capability_version > 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
  approval_override TEXT CHECK (approval_override IN ('never','risk_based','always')),
  configuration JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(configuration) = 'object'),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, capability_key, capability_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_plans_one_active_revision
  ON public.action_plans(mission_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_mission_entities_exclusive
  ON public.action_mission_entities(organization_id, entity_type, entity_id)
  WHERE active = TRUE AND ownership_mode = 'exclusive';
CREATE INDEX IF NOT EXISTS idx_action_missions_scheduler ON public.action_missions(status, deadline_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_action_runs_scheduler ON public.action_runs(status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_action_runs_mission ON public.action_runs(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_action_approvals_pending ON public.action_approvals(status, expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_action_observations_mission ON public.action_observations(mission_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_action_cost_entries_mission ON public.action_cost_entries(mission_id, occurred_at);

CREATE OR REPLACE FUNCTION private.guard_action_pack_version_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('published_for_internal_pilot','published','retired') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'action_pack_version_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_pack_versions_immutable ON public.action_pack_versions;
CREATE TRIGGER action_pack_versions_immutable BEFORE UPDATE OR DELETE ON public.action_pack_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_pack_version_immutability();

CREATE OR REPLACE FUNCTION private.guard_action_plan_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('approved','active','superseded','completed')
     AND (NEW.parameters IS DISTINCT FROM OLD.parameters
       OR NEW.deviations IS DISTINCT FROM OLD.deviations
       OR NEW.plan_hash IS DISTINCT FROM OLD.plan_hash
       OR NEW.pack_content_hash IS DISTINCT FROM OLD.pack_content_hash) THEN
    RAISE EXCEPTION 'action_plan_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_plans_immutable ON public.action_plans;
CREATE TRIGGER action_plans_immutable BEFORE UPDATE ON public.action_plans
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_plan_immutability();

CREATE OR REPLACE FUNCTION private.guard_action_cost_entries_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'action_cost_entries_append_only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_cost_entries_append_only ON public.action_cost_entries;
CREATE TRIGGER action_cost_entries_append_only BEFORE UPDATE OR DELETE ON public.action_cost_entries
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_cost_entries_append_only();

-- Tenant artifacts are readable inside the organization and mutable only by
-- internal API/worker contexts. Pack catalog is deliberately internal-only.
ALTER TABLE public.action_pack_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_pack_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_pack_versions_internal ON public.action_pack_versions;
CREATE POLICY action_pack_versions_internal ON public.action_pack_versions FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

ALTER TABLE public.action_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_packs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS action_packs_internal ON public.action_packs;
CREATE POLICY action_packs_internal ON public.action_packs FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal());

DO $action_engine_rls$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'action_missions','action_mission_metrics','action_plans','action_plan_steps',
    'action_runs','action_run_attempts','action_cost_entries','action_approvals',
    'action_observations','action_mission_entities','action_evaluations','action_capability_policies'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_read', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_write', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (private.rls_can_access_organization(organization_id))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal())', table_name || '_write', table_name);
  END LOOP;
END;
$action_engine_rls$;

INSERT INTO public.action_packs (key, name, description)
VALUES ('revenue_recovery', 'Revenue Recovery', 'Recuperação governada de receita sobre capacidades existentes do YUX Hub.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES ('action_engine', 'Missões', FALSE, '/missions', '/portal/missoes', ARRAY['action_engine.read']::TEXT[])
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route, required_permissions = EXCLUDED.required_permissions, updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'action_engine.read'), ('yux_admin', 'action_engine.write'), ('yux_admin', 'action_engine.economics.read'),
  ('yux_manager', 'action_engine.read'), ('yux_manager', 'action_engine.write'), ('yux_manager', 'action_engine.economics.read'),
  ('client_admin', 'action_engine.read'), ('client_member', 'action_engine.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
