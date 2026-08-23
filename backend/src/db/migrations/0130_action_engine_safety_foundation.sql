-- Cross-cutting safety primitives required before the general Mission Supervisor.
-- This migration is additive and preserves every existing Action Engine row.

ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS capability_manifest JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(capability_manifest) = 'array'),
  ADD COLUMN IF NOT EXISTS capability_manifest_hash TEXT NOT NULL
    DEFAULT '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e1694018417eb71d718210b'
    CHECK (capability_manifest_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.action_plan_steps
  ADD COLUMN IF NOT EXISTS capability_definition_hash TEXT
    CHECK (capability_definition_hash IS NULL OR capability_definition_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.action_mission_metrics
  ADD COLUMN IF NOT EXISTS attribution_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (attribution_status IN ('not_applicable','legacy_unversioned','versioned')),
  ADD COLUMN IF NOT EXISTS attribution_policy_version INTEGER
    CHECK (attribution_policy_version IS NULL OR attribution_policy_version > 0),
  ADD COLUMN IF NOT EXISTS attribution_policy_hash TEXT
    CHECK (attribution_policy_hash IS NULL OR attribution_policy_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS attribution_event_ids JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(attribution_event_ids) = 'array');

UPDATE public.action_mission_metrics
SET attribution_status = 'legacy_unversioned'
WHERE metric_key IN ('signed_revenue','recovered_revenue_brl')
  AND value_kind = 'known' AND attribution_status = 'not_applicable';

CREATE OR REPLACE FUNCTION private.guard_action_plan_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('approved','active','superseded','completed')
     AND (NEW.parameters IS DISTINCT FROM OLD.parameters
       OR NEW.deviations IS DISTINCT FROM OLD.deviations
       OR NEW.plan_hash IS DISTINCT FROM OLD.plan_hash
       OR NEW.pack_content_hash IS DISTINCT FROM OLD.pack_content_hash
       OR NEW.capability_manifest IS DISTINCT FROM OLD.capability_manifest
       OR NEW.capability_manifest_hash IS DISTINCT FROM OLD.capability_manifest_hash) THEN
    RAISE EXCEPTION 'action_plan_immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.action_external_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  plan_id UUID REFERENCES public.action_plans(id) ON DELETE RESTRICT,
  run_id UUID NOT NULL REFERENCES public.action_runs(id) ON DELETE RESTRICT,
  attempt_id UUID REFERENCES public.action_run_attempts(id) ON DELETE RESTRICT,
  capability_key TEXT NOT NULL CHECK (BTRIM(capability_key) <> ''),
  capability_version INTEGER NOT NULL CHECK (capability_version > 0),
  provider_key TEXT NOT NULL CHECK (BTRIM(provider_key) <> ''),
  provider_idempotency_key TEXT NOT NULL CHECK (BTRIM(provider_idempotency_key) <> ''),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  request_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_metadata) = 'object'),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN (
    'reserved','dispatched','confirmed_created','confirmed_failed','unknown','reconciling','manual_review'
  )),
  provider_reference TEXT,
  outcome_evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(outcome_evidence) = 'object'),
  last_error_code TEXT,
  next_reconcile_at TIMESTAMPTZ,
  reconciliation_deadline_at TIMESTAMPTZ NOT NULL,
  dispatched_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, capability_key, capability_version, provider_idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.action_resource_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  mission_label TEXT NOT NULL CHECK (BTRIM(mission_label) <> ''),
  resource_key TEXT NOT NULL CHECK (BTRIM(resource_key) <> ''),
  scope TEXT NOT NULL CHECK (BTRIM(scope) <> ''),
  mode TEXT NOT NULL CHECK (mode IN ('observe','shared','exclusive')),
  fencing_token BIGINT NOT NULL CHECK (fencing_token > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  last_renewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_planning_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  context_hash TEXT NOT NULL CHECK (context_hash ~ '^[a-f0-9]{64}$'),
  pack_key TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','exhausted','completed','cancelled')),
  budget JSONB NOT NULL CHECK (jsonb_typeof(budget) = 'object'),
  usage JSONB NOT NULL DEFAULT '{"calls":0,"inputTokens":0,"outputTokens":0,"costBrl":"0","latencyMs":0}'::JSONB,
  terminal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (mission_id, plan_revision)
);

CREATE TABLE IF NOT EXISTS public.action_planning_usage_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  cycle_id UUID NOT NULL REFERENCES public.action_planning_cycles(id) ON DELETE RESTRICT,
  specialist_profile TEXT NOT NULL,
  specialist_version INTEGER NOT NULL CHECK (specialist_version > 0),
  nature TEXT NOT NULL CHECK (nature IN ('reservation','actual','release')),
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_brl NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (cost_brl >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  reservation_id UUID REFERENCES public.action_planning_usage_entries(id) ON DELETE RESTRICT,
  provider_model_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_planning_artifact_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL CHECK (cache_key ~ '^[a-f0-9]{64}$'),
  context_hash TEXT NOT NULL CHECK (context_hash ~ '^[a-f0-9]{64}$'),
  pack_key TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  specialist_profile TEXT NOT NULL,
  specialist_version INTEGER NOT NULL CHECK (specialist_version > 0),
  artifact_schema TEXT NOT NULL,
  artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
  relevant_input_hash TEXT NOT NULL CHECK (relevant_input_hash ~ '^[a-f0-9]{64}$'),
  artifact JSONB NOT NULL CHECK (jsonb_typeof(artifact) = 'object'),
  source_ids JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(source_ids) = 'array'),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, cache_key)
);

CREATE TABLE IF NOT EXISTS public.action_external_effect_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  effect_id UUID NOT NULL REFERENCES public.action_external_effects(id) ON DELETE RESTRICT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.action_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES public.action_missions(id) ON DELETE RESTRICT,
  external_effect_id UUID REFERENCES public.action_external_effects(id) ON DELETE RESTRICT,
  incident_type TEXT NOT NULL CHECK (BTRIM(incident_type) <> ''),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','contained','resolved')),
  summary TEXT NOT NULL CHECK (BTRIM(summary) <> ''),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_action_external_effects_reconcile
  ON public.action_external_effects(status, next_reconcile_at, created_at)
  WHERE status IN ('unknown','reconciling');
CREATE INDEX IF NOT EXISTS idx_action_resource_claims_active
  ON public.action_resource_claims(organization_id, resource_key, scope, lease_expires_at)
  WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_action_resource_claims_mission
  ON public.action_resource_claims(mission_id, active, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_action_planning_cycles_mission
  ON public.action_planning_cycles(mission_id, plan_revision);
CREATE INDEX IF NOT EXISTS idx_action_planning_artifact_cache_expiry
  ON public.action_planning_artifact_cache(organization_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_action_external_effects_mission
  ON public.action_external_effects(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_action_external_effect_events_effect
  ON public.action_external_effect_events(effect_id, created_at);
CREATE INDEX IF NOT EXISTS idx_action_incidents_open
  ON public.action_incidents(organization_id, status, created_at)
  WHERE status IN ('open','investigating');

CREATE OR REPLACE FUNCTION private.guard_action_external_effect_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'action_external_effect_events_append_only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_external_effect_events_append_only ON public.action_external_effect_events;
CREATE TRIGGER action_external_effect_events_append_only
  BEFORE UPDATE OR DELETE ON public.action_external_effect_events
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_external_effect_events_append_only();

DROP TRIGGER IF EXISTS action_planning_usage_entries_append_only ON public.action_planning_usage_entries;
CREATE TRIGGER action_planning_usage_entries_append_only
  BEFORE UPDATE OR DELETE ON public.action_planning_usage_entries
  FOR EACH ROW EXECUTE FUNCTION private.guard_action_external_effect_events_append_only();

DO $action_engine_safety_rls$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'action_external_effects','action_external_effect_events','action_incidents','action_resource_claims',
    'action_planning_cycles','action_planning_usage_entries','action_planning_artifact_cache'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_read', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_write', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (private.rls_can_access_organization(organization_id))',
      table_name || '_read', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (private.rls_is_internal()) WITH CHECK (private.rls_is_internal())',
      table_name || '_write', table_name
    );
  END LOOP;
END;
$action_engine_safety_rls$;
