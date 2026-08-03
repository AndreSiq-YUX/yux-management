-- Transactional outbox and delivery ledger for the integrated lead journey.
-- The application records domain_events in the same transaction as the
-- business mutation. A worker later fans each event out to independent
-- consumers.

CREATE TABLE IF NOT EXISTS public.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  aggregate_type TEXT NOT NULL CHECK (BTRIM(aggregate_type) <> ''),
  aggregate_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL,
  causation_id UUID,
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 12),
  actor JSONB NOT NULL CHECK (jsonb_typeof(actor) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  automation_trace UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  dispatch_status TEXT NOT NULL DEFAULT 'pending' CHECK (dispatch_status IN ('pending', 'dispatching', 'dispatched', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.domain_event_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.domain_events(id) ON DELETE CASCADE,
  consumer_key TEXT NOT NULL CHECK (BTRIM(consumer_key) <> ''),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, consumer_key)
);

CREATE TABLE IF NOT EXISTS public.automation_action_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.automation_execution_runs(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.automation_actions(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (BTRIM(idempotency_key) <> ''),
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep the latest active enrollment and make retries/concurrent requests safe.
WITH ranked_active_enrollments AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lead_id, sequence_id
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rank_number
  FROM public.crm_sequence_enrollments
  WHERE status IN ('active', 'paused', 'manual')
)
UPDATE public.crm_sequence_enrollments enrollment
SET status = 'cancelled', updated_at = NOW()
FROM ranked_active_enrollments ranked
WHERE enrollment.id = ranked.id
  AND ranked.rank_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_sequence_one_active_enrollment
  ON public.crm_sequence_enrollments(lead_id, sequence_id)
  WHERE status IN ('active', 'paused', 'manual');

ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS allow_reentry BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reentry_cooldown_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (reentry_cooldown_minutes >= 0);

ALTER TABLE public.automation_execution_runs
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.domain_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flow_version_id UUID REFERENCES public.automation_flow_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS automation_trace UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_execution_runs_flow_event
  ON public.automation_execution_runs(flow_id, event_id)
  WHERE flow_id IS NOT NULL AND event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_dispatch
  ON public.domain_events(dispatch_status, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_domain_events_org_occurred
  ON public.domain_events(organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_lead_occurred
  ON public.domain_events(lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_correlation
  ON public.domain_events(correlation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_event_deliveries_pending
  ON public.domain_event_deliveries(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_domain_event_deliveries_event
  ON public.domain_event_deliveries(event_id, consumer_key);

CREATE INDEX IF NOT EXISTS idx_automation_action_effects_run
  ON public.automation_action_effects(run_id, created_at);

ALTER TABLE public.email_send_requests
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.email_send_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_events_provider_identity
  ON public.email_send_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_send_requests_lead
  ON public.email_send_requests(lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

-- Tenant visibility is retained for authenticated users; writes to the
-- orchestration ledger are restricted to backend contexts configured by the
-- API/worker (yux_admin and yux_operator).
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domain_events_read ON public.domain_events;
DROP POLICY IF EXISTS domain_events_backend_write ON public.domain_events;
DROP POLICY IF EXISTS domain_events_backend_update ON public.domain_events;
CREATE POLICY domain_events_read ON public.domain_events
  FOR SELECT USING (private.rls_can_access_organization(organization_id));
CREATE POLICY domain_events_backend_write ON public.domain_events
  FOR INSERT WITH CHECK (private.rls_is_internal());
CREATE POLICY domain_events_backend_update ON public.domain_events
  FOR UPDATE USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());

ALTER TABLE public.domain_event_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_event_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domain_event_deliveries_read ON public.domain_event_deliveries;
DROP POLICY IF EXISTS domain_event_deliveries_backend_write ON public.domain_event_deliveries;
CREATE POLICY domain_event_deliveries_read ON public.domain_event_deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.domain_events event
      WHERE event.id = domain_event_deliveries.event_id
        AND private.rls_can_access_organization(event.organization_id)
    )
  );
CREATE POLICY domain_event_deliveries_backend_write ON public.domain_event_deliveries
  FOR ALL USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());

ALTER TABLE public.automation_action_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_action_effects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_action_effects_read ON public.automation_action_effects;
DROP POLICY IF EXISTS automation_action_effects_backend_write ON public.automation_action_effects;
CREATE POLICY automation_action_effects_read ON public.automation_action_effects
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.automation_execution_runs run
      WHERE run.id = automation_action_effects.run_id
        AND private.rls_can_access_organization(run.organization_id)
    )
  );
CREATE POLICY automation_action_effects_backend_write ON public.automation_action_effects
  FOR ALL USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());
