-- Flow Builder Lite for commercial automations.

CREATE TABLE IF NOT EXISTS public.automation_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived', 'failed')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sector_template_key TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.automation_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, trigger_type)
);

CREATE TABLE IF NOT EXISTS public.automation_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists')),
  value JSONB,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('create_task', 'change_stage', 'assign_owner', 'send_whatsapp', 'create_ticket', 'update_field', 'register_activity')),
  order_index INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'skipped')),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload) = 'object'),
  last_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.automation_execution_runs(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.automation_actions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'skipped')),
  sanitized_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_payload) = 'object'),
  sanitized_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  sector_template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_template JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(trigger_template) = 'object'),
  condition_templates JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(condition_templates) = 'array'),
  action_templates JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(action_templates) = 'array'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sector_template_key, name)
);

CREATE INDEX IF NOT EXISTS idx_automation_flows_org_status ON public.automation_flows(organization_id, status, is_enabled);
CREATE INDEX IF NOT EXISTS idx_automation_triggers_type ON public.automation_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_automation_conditions_flow_order ON public.automation_conditions(flow_id, order_index);
CREATE INDEX IF NOT EXISTS idx_automation_actions_flow_order ON public.automation_actions(flow_id, order_index);
CREATE INDEX IF NOT EXISTS idx_automation_execution_runs_flow_created ON public.automation_execution_runs(flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_execution_runs_lead_created ON public.automation_execution_runs(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_execution_steps_run ON public.automation_execution_steps(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_automation_templates_sector ON public.automation_templates(sector_template_key, is_active);

ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Omnichannel users read automation flows" ON public.automation_flows
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage automation flows" ON public.automation_flows
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read automation triggers" ON public.automation_triggers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'read'))
  );
CREATE POLICY "Omnichannel configurators manage automation triggers" ON public.automation_triggers
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  );

CREATE POLICY "Omnichannel users read automation conditions" ON public.automation_conditions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'read'))
  );
CREATE POLICY "Omnichannel configurators manage automation conditions" ON public.automation_conditions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  );

CREATE POLICY "Omnichannel users read automation actions" ON public.automation_actions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'read'))
  );
CREATE POLICY "Omnichannel configurators manage automation actions" ON public.automation_actions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND private.can_access_omnichannel_organization(f.organization_id, 'configure'))
  );

CREATE POLICY "Internal users supervise automation runs" ON public.automation_execution_runs
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());
CREATE POLICY "Internal users supervise automation steps" ON public.automation_execution_steps
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

CREATE POLICY "Omnichannel users read automation templates" ON public.automation_templates
  FOR SELECT TO authenticated USING (
    organization_id IS NULL OR private.can_access_omnichannel_organization(organization_id, 'read')
  );
CREATE POLICY "Omnichannel configurators manage automation templates" ON public.automation_templates
  FOR ALL TO authenticated USING (
    organization_id IS NOT NULL AND private.can_access_omnichannel_organization(organization_id, 'configure')
  )
  WITH CHECK (
    organization_id IS NOT NULL AND private.can_access_omnichannel_organization(organization_id, 'configure')
  );

REVOKE ALL ON public.automation_flows FROM anon;
REVOKE ALL ON public.automation_triggers FROM anon;
REVOKE ALL ON public.automation_conditions FROM anon;
REVOKE ALL ON public.automation_actions FROM anon;
REVOKE ALL ON public.automation_execution_runs FROM anon;
REVOKE ALL ON public.automation_execution_steps FROM anon;
REVOKE ALL ON public.automation_templates FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_flows TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_triggers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_conditions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_actions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_execution_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_execution_steps TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_templates TO authenticated, service_role;

INSERT INTO public.automation_templates (
  organization_id,
  sector_template_key,
  name,
  description,
  trigger_template,
  condition_templates,
  action_templates
) VALUES
  (NULL, 'clinic', 'Lead qualificado: tarefa e WhatsApp', 'Follow-up rapido para leads de clinicas.', '{"triggerType":"lead.stage_changed"}', '[{"field":"source","operator":"exists"}]', '[{"actionType":"create_task","payload":{"title":"Follow-up comercial"}},{"actionType":"send_whatsapp","payload":{"body":"Ola, podemos te ajudar com o agendamento?"}}]'),
  (NULL, 'agency', 'Briefing recebido: atividade interna', 'Registra atividade e atribui responsavel.', '{"triggerType":"lead.created"}', '[{"field":"source","operator":"not_equals","value":"spam"}]', '[{"actionType":"register_activity","payload":{"title":"Briefing recebido"}},{"actionType":"assign_owner","payload":{}}]')
ON CONFLICT (organization_id, sector_template_key, name) DO UPDATE SET
  description = EXCLUDED.description,
  trigger_template = EXCLUDED.trigger_template,
  condition_templates = EXCLUDED.condition_templates,
  action_templates = EXCLUDED.action_templates,
  is_active = true,
  updated_at = NOW();
