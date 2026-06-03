-- Configurable AI assistant settings for omnichannel conversations.

CREATE TABLE IF NOT EXISTS public.ai_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'consultivo',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  summary_enabled BOOLEAN NOT NULL DEFAULT true,
  classification_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, client_id, contract_id, name)
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  objective_type TEXT NOT NULL CHECK (objective_type IN ('lead_qualification', 'support_triage', 'scheduling', 'sales_conversion', 'retention')),
  label TEXT NOT NULL,
  instructions TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assistant_id, objective_type)
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_required_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'contact' CHECK (source IN ('contact', 'lead', 'conversation', 'custom')),
  is_required BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assistant_id, field_key)
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_handoff_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('human_request', 'sentiment_intent', 'low_confidence', 'missing_required_field', 'safety')),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  min_confidence NUMERIC(4,3) CHECK (min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_safety_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  instructions TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_knowledge_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  knowledge_entry_id UUID NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assistant_id, knowledge_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_assistants_org_scope
  ON public.ai_assistants(organization_id, client_id, contract_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_objectives_assistant_priority
  ON public.ai_assistant_objectives(assistant_id, priority);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_required_fields_assistant_order
  ON public.ai_assistant_required_fields(assistant_id, order_index);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_handoff_rules_assistant_enabled
  ON public.ai_assistant_handoff_rules(assistant_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_safety_rules_assistant_enabled
  ON public.ai_assistant_safety_rules(assistant_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_knowledge_links_entry
  ON public.ai_assistant_knowledge_links(knowledge_entry_id);

ALTER TABLE public.ai_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_required_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_handoff_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_safety_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_knowledge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Omnichannel users read ai assistants" ON public.ai_assistants
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));
CREATE POLICY "Omnichannel configurators manage ai assistants" ON public.ai_assistants
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

CREATE POLICY "Omnichannel users read ai assistant objectives" ON public.ai_assistant_objectives
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'read')
    )
  );
CREATE POLICY "Omnichannel configurators manage ai assistant objectives" ON public.ai_assistant_objectives
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  );

CREATE POLICY "Omnichannel users read ai assistant required fields" ON public.ai_assistant_required_fields
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'read')
    )
  );
CREATE POLICY "Omnichannel configurators manage ai assistant required fields" ON public.ai_assistant_required_fields
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  );

CREATE POLICY "Omnichannel users read ai assistant handoff rules" ON public.ai_assistant_handoff_rules
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'read')
    )
  );
CREATE POLICY "Omnichannel configurators manage ai assistant handoff rules" ON public.ai_assistant_handoff_rules
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  );

CREATE POLICY "Omnichannel users read ai assistant safety rules" ON public.ai_assistant_safety_rules
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'read')
    )
  );
CREATE POLICY "Omnichannel configurators manage ai assistant safety rules" ON public.ai_assistant_safety_rules
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  );

CREATE POLICY "Omnichannel users read ai assistant knowledge links" ON public.ai_assistant_knowledge_links
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'read')
    )
  );
CREATE POLICY "Omnichannel configurators manage ai assistant knowledge links" ON public.ai_assistant_knowledge_links
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'configure')
    )
  );

REVOKE ALL ON public.ai_assistants FROM anon;
REVOKE ALL ON public.ai_assistant_objectives FROM anon;
REVOKE ALL ON public.ai_assistant_required_fields FROM anon;
REVOKE ALL ON public.ai_assistant_handoff_rules FROM anon;
REVOKE ALL ON public.ai_assistant_safety_rules FROM anon;
REVOKE ALL ON public.ai_assistant_knowledge_links FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistants TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_objectives TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_required_fields TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_handoff_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_safety_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_knowledge_links TO authenticated, service_role;
