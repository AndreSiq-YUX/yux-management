-- Intelligent automation foundation: flow versioning, risk metadata and simulation runs.

ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS automation_kind TEXT NOT NULL DEFAULT 'flow' CHECK (automation_kind IN ('flow', 'sequence')),
  ADD COLUMN IF NOT EXISTS builder_mode TEXT NOT NULL DEFAULT 'guided' CHECK (builder_mode IN ('guided', 'technical')),
  ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  ADD COLUMN IF NOT EXISTS active_version_id UUID,
  ADD COLUMN IF NOT EXISTS daily_run_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_run_limit >= 0),
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high'));

ALTER TABLE public.automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_action_type_check;

ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_type_check CHECK (
    action_type IN (
      'create_task',
      'change_stage',
      'assign_owner',
      'send_whatsapp',
      'send_email',
      'create_ticket',
      'update_field',
      'register_activity',
      'webhook',
      'call_api',
      'convert_proposal',
      'create_project',
      'create_invoice',
      'ai_classify_lead',
      'ai_generate_message',
      'ai_generate_proposal'
    )
  );

CREATE TABLE IF NOT EXISTS public.automation_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, version_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'automation_flows_active_version_fkey'
      AND conrelid = 'public.automation_flows'::regclass
  ) THEN
    ALTER TABLE public.automation_flows
      ADD CONSTRAINT automation_flows_active_version_fkey
      FOREIGN KEY (active_version_id) REFERENCES public.automation_flow_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.automation_simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  sample_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sample_payload) = 'object'),
  matched BOOLEAN NOT NULL DEFAULT false,
  condition_results JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(condition_results) = 'array'),
  planned_actions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(planned_actions) = 'array'),
  blocked_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  estimated_ai_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (estimated_ai_cost >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_flow_versions_flow ON public.automation_flow_versions(flow_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_automation_simulation_runs_org ON public.automation_simulation_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_simulation_runs_flow ON public.automation_simulation_runs(flow_id, created_at DESC);

ALTER TABLE public.automation_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_simulation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Omnichannel users read automation flow versions" ON public.automation_flow_versions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.automation_flows f
      WHERE f.id = flow_id
        AND private.can_access_omnichannel_organization(f.organization_id, 'read')
    )
  );

CREATE POLICY "Omnichannel configurators manage automation flow versions" ON public.automation_flow_versions
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.automation_flows f
      WHERE f.id = flow_id
        AND private.can_access_omnichannel_organization(f.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.automation_flows f
      WHERE f.id = flow_id
        AND private.can_access_omnichannel_organization(f.organization_id, 'configure')
    )
  );

CREATE POLICY "Omnichannel configurators manage automation simulations" ON public.automation_simulation_runs
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

REVOKE ALL ON public.automation_flow_versions FROM anon;
REVOKE ALL ON public.automation_simulation_runs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_flow_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_simulation_runs TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
