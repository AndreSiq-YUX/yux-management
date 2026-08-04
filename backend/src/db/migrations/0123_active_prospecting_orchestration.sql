-- Governed state for the internal YUX active-prospecting journey.
-- Reuses Radar, CRM sequences, Omnichannel and the transactional outbox.

ALTER TABLE public.radar_enrichment_runs
  ADD COLUMN IF NOT EXISTS run_kind TEXT NOT NULL DEFAULT 'enrichment'
    CHECK (run_kind IN ('discovery', 'enrichment', 'analysis'));

ALTER TABLE public.radar_enrichment_runs
  DROP CONSTRAINT IF EXISTS radar_enrichment_runs_provider_check;

ALTER TABLE public.radar_enrichment_runs
  ADD CONSTRAINT radar_enrichment_runs_provider_check
  CHECK (provider IN (
    'manual', 'csv', 'jina_reader', 'jina_search', 'web_search',
    'opencnpj', 'public_registry', 'cnpja_advanced_search',
    'cnpja_office_lookup', 'future_paid_api', 'yux_agent_runtime'
  ));

ALTER TABLE public.radar_outreach_events
  DROP CONSTRAINT IF EXISTS radar_outreach_events_event_type_check;

ALTER TABLE public.radar_outreach_events
  ADD CONSTRAINT radar_outreach_events_event_type_check
  CHECK (event_type IN (
    'company_added', 'company_enriched',
    'analysis_requested', 'analysis_completed', 'analysis_failed',
    'diagnostic_generated', 'score_generated', 'message_generated',
    'message_approved', 'message_rejected',
    'opportunity_approved', 'opportunity_rejected',
    'plan_approved', 'prospecting_started',
    'contact_queued', 'contact_sent', 'contact_delivered', 'contact_read',
    'contact_replied', 'contact_failed', 'contact_blocked',
    'opt_out_registered', 'converted_to_lead', 'manual_note_added'
  ));

ALTER TABLE public.crm_sequence_steps
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(metadata) = 'object');

ALTER TABLE public.agent_execution_runs
  DROP CONSTRAINT IF EXISTS agent_execution_runs_run_source_check;

ALTER TABLE public.agent_execution_runs
  ADD CONSTRAINT agent_execution_runs_run_source_check
  CHECK (run_source IN (
    'whatsapp', 'strategy_admin', 'marketing_studio', 'scheduled',
    'runtime', 'test', 'radar', 'prospecting'
  ));

CREATE TABLE IF NOT EXISTS public.prospecting_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  default_sequence_id UUID REFERENCES public.crm_sequences(id) ON DELETE SET NULL,
  whatsapp_connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  kill_switch BOOLEAN NOT NULL DEFAULT TRUE,
  require_human_first_contact BOOLEAN NOT NULL DEFAULT TRUE,
  require_whatsapp_permission BOOLEAN NOT NULL DEFAULT TRUE,
  require_template_outside_window BOOLEAN NOT NULL DEFAULT TRUE,
  daily_limit INTEGER NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 10000),
  max_attempts_per_lead INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts_per_lead BETWEEN 1 AND 100),
  quiet_hours JSONB NOT NULL DEFAULT '{"timezone":"America/Sao_Paulo","start":"20:00","end":"08:00"}'::JSONB
    CHECK (jsonb_typeof(quiet_hours) = 'object'),
  policy_version TEXT NOT NULL DEFAULT '1.0' CHECK (BTRIM(policy_version) <> ''),
  legal_reviewed_at TIMESTAMPTZ,
  legal_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.lead_channel_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'phone')),
  address TEXT NOT NULL CHECK (BTRIM(address) <> ''),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'granted', 'revoked')),
  permission_category TEXT NOT NULL DEFAULT 'commercial_prospecting'
    CHECK (BTRIM(permission_category) <> ''),
  source TEXT NOT NULL CHECK (BTRIM(source) <> ''),
  notice_code TEXT,
  notice_version TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, channel, address),
  CHECK (status <> 'granted' OR granted_at IS NOT NULL),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.prospecting_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  radar_opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES public.crm_sequences(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  primary_channel TEXT NOT NULL CHECK (primary_channel IN ('email', 'whatsapp', 'phone', 'task')),
  fallback_channel TEXT CHECK (fallback_channel IS NULL OR fallback_channel IN ('email', 'whatsapp', 'phone', 'task')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'active', 'paused', 'blocked', 'opted_out', 'completed', 'failed')),
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  blocked_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  idempotency_key TEXT NOT NULL UNIQUE CHECK (BTRIM(idempotency_key) <> ''),
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (radar_opportunity_id),
  CHECK (status NOT IN ('approved', 'active') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_radar_enrichment_runs_kind_status
  ON public.radar_enrichment_runs(run_kind, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_one_active_analysis_per_opportunity
  ON public.radar_enrichment_runs(opportunity_id)
  WHERE run_kind = 'analysis' AND status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_prospecting_plans_org_status
  ON public.prospecting_plans(organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospecting_plans_lead
  ON public.prospecting_plans(lead_id, updated_at DESC)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_channel_permissions_lead
  ON public.lead_channel_permissions(lead_id, channel, status)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.prospecting_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospecting_policies_internal ON public.prospecting_policies;
CREATE POLICY prospecting_policies_internal ON public.prospecting_policies
  FOR ALL USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());

ALTER TABLE public.lead_channel_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_channel_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_channel_permissions_internal ON public.lead_channel_permissions;
CREATE POLICY lead_channel_permissions_internal ON public.lead_channel_permissions
  FOR ALL USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());

ALTER TABLE public.prospecting_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospecting_plans_internal ON public.prospecting_plans;
CREATE POLICY prospecting_plans_internal ON public.prospecting_plans
  FOR ALL USING (private.rls_is_internal())
  WITH CHECK (private.rls_is_internal());
