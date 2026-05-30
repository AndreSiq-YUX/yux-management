-- Commercial proposal drafts, immutable sends, decisions, and project presets.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS proposal_id UUID,
  ADD COLUMN IF NOT EXISTS proposal_version_id UUID;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS proposal_id UUID,
  ADD COLUMN IF NOT EXISTS proposal_version_id UUID;

CREATE TABLE public.commercial_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  pain_points TEXT[] NOT NULL DEFAULT '{}',
  goals TEXT[] NOT NULL DEFAULT '{}',
  budget_range TEXT,
  timeline TEXT,
  decision_process TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id)
);

CREATE TABLE public.proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  default_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  whatsapp_message TEXT NOT NULL DEFAULT '',
  email_subject TEXT NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, package_id, name)
);

CREATE TABLE public.proposal_price_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  minimum_value DECIMAL(15,2) NOT NULL CHECK (minimum_value >= 0),
  recommended_value DECIMAL(15,2) NOT NULL CHECK (recommended_value >= minimum_value),
  maximum_value DECIMAL(15,2) NOT NULL CHECK (maximum_value >= recommended_value),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, package_id, item_key)
);

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','adjustments_requested','approved','rejected','conversion_failed','converted')),
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  whatsapp_message TEXT NOT NULL DEFAULT '',
  email_subject TEXT NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('one_time','monthly','quarterly','yearly')),
  selected_module_keys TEXT[] NOT NULL DEFAULT '{}',
  final_value DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (final_value >= 0),
  override_reason TEXT,
  current_version_id UUID,
  converted_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_value DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (unit_value >= 0),
  total_value DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_value) STORED,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.proposal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','adjustments_requested','superseded')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, version_number)
);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;

CREATE TABLE public.proposal_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_version_id UUID NOT NULL REFERENCES public.proposal_versions(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','adjustments_requested')),
  source TEXT NOT NULL CHECK (source IN ('public_token','portal')),
  comment TEXT,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_version_id)
);

CREATE TABLE public.proposal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_version_id UUID NOT NULL REFERENCES public.proposal_versions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE TABLE public.ai_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed','fallback','failed')),
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.proposal_conversion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('completed','failed')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (proposal_id, attempt_number)
);

CREATE TABLE public.package_project_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE UNIQUE,
  phases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.blueprint_project_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE UNIQUE,
  phases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commercial_diagnostics_organization ON public.commercial_diagnostics(organization_id);
CREATE INDEX idx_proposal_templates_organization_package ON public.proposal_templates(organization_id, package_id);
CREATE INDEX idx_proposal_price_rules_organization_package ON public.proposal_price_rules(organization_id, package_id);
CREATE INDEX idx_proposals_organization_status ON public.proposals(organization_id, status, updated_at DESC);
CREATE INDEX idx_proposals_lead ON public.proposals(lead_id);
CREATE INDEX idx_proposals_client ON public.proposals(client_id);
CREATE INDEX idx_proposals_assigned_to ON public.proposals(assigned_to);
CREATE INDEX idx_proposals_package ON public.proposals(package_id);
CREATE INDEX idx_proposal_items_proposal ON public.proposal_items(proposal_id, order_index);
CREATE INDEX idx_proposal_versions_proposal ON public.proposal_versions(proposal_id, version_number DESC);
CREATE INDEX idx_proposal_decisions_version ON public.proposal_decisions(proposal_version_id);
CREATE INDEX idx_proposal_access_tokens_version ON public.proposal_access_tokens(proposal_version_id);
CREATE INDEX idx_ai_generation_runs_proposal ON public.ai_generation_runs(proposal_id, created_at DESC);
CREATE INDEX idx_proposal_conversion_runs_proposal ON public.proposal_conversion_runs(proposal_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.can_manage_proposal_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

CREATE OR REPLACE FUNCTION private.can_access_portal_proposal(target_proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposals p
    JOIN public.organizations o ON o.client_id = p.client_id AND o.kind = 'client'
    JOIN public.memberships m ON m.organization_id = o.id
    JOIN public.contracts c ON c.client_id = p.client_id
      AND c.status = 'active'
      AND c.starts_at <= CURRENT_DATE
      AND (c.ends_at IS NULL OR c.ends_at >= CURRENT_DATE)
    JOIN public.contract_modules cm ON cm.contract_id = c.id
      AND cm.module_key = 'proposals'
      AND cm.enabled
    WHERE p.id = target_proposal_id
      AND m.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_portal_proposal_version(target_version_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposal_versions v
    JOIN public.proposals p ON p.id = v.proposal_id
    WHERE v.id = target_version_id
      AND p.current_version_id = v.id
      AND v.status = 'pending'
      AND private.can_access_portal_proposal(p.id)
  );
$$;

REVOKE ALL ON FUNCTION private.can_manage_proposal_organization(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_portal_proposal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_portal_proposal_version(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_proposal_organization(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_portal_proposal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_portal_proposal_version(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.protect_proposal_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sent proposal versions are immutable';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'Sent proposal versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_proposal_version_send()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.proposal_versions
  SET status = 'superseded'
  WHERE proposal_id = NEW.proposal_id
    AND id <> NEW.id
    AND status = 'pending';

  UPDATE public.proposals
  SET current_version_id = NEW.id,
      status = 'sent',
      updated_at = NOW()
  WHERE id = NEW.proposal_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_proposal_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_proposal public.proposals%ROWTYPE;
BEGIN
  SELECT p.* INTO target_proposal
  FROM public.proposals p
  JOIN public.proposal_versions v ON v.proposal_id = p.id
  WHERE v.id = NEW.proposal_version_id
  FOR UPDATE OF p;

  IF target_proposal.current_version_id IS DISTINCT FROM NEW.proposal_version_id THEN
    RAISE EXCEPTION 'Proposal decision targets a stale version';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proposal_versions v
    WHERE v.id = NEW.proposal_version_id AND v.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Proposal version is not pending';
  END IF;

  IF NEW.decision = 'adjustments_requested' AND NULLIF(BTRIM(NEW.comment), '') IS NULL THEN
    RAISE EXCEPTION 'Adjustment requests require a comment';
  END IF;

  UPDATE public.proposal_versions
  SET status = NEW.decision,
      decided_at = NOW()
  WHERE id = NEW.proposal_version_id;

  UPDATE public.proposals
  SET status = NEW.decision,
      updated_at = NOW()
  WHERE id = target_proposal.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_proposal_version
  BEFORE UPDATE OR DELETE ON public.proposal_versions
  FOR EACH ROW EXECUTE FUNCTION private.protect_proposal_version();

CREATE TRIGGER apply_proposal_version_send
  AFTER INSERT ON public.proposal_versions
  FOR EACH ROW EXECUTE FUNCTION private.apply_proposal_version_send();

CREATE TRIGGER apply_proposal_decision
  BEFORE INSERT ON public.proposal_decisions
  FOR EACH ROW EXECUTE FUNCTION private.apply_proposal_decision();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'commercial_diagnostics', 'proposal_templates', 'proposal_price_rules',
    'proposals', 'proposal_items', 'package_project_presets', 'blueprint_project_presets'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'commercial_diagnostics', 'proposal_templates', 'proposal_price_rules', 'proposals',
    'proposal_items', 'proposal_versions', 'proposal_decisions', 'proposal_access_tokens',
    'ai_generation_runs', 'proposal_conversion_runs', 'package_project_presets',
    'blueprint_project_presets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
  END LOOP;
END
$$;

CREATE POLICY "Internal users manage commercial diagnostics" ON public.commercial_diagnostics
  FOR ALL USING (private.can_manage_proposal_organization(organization_id))
  WITH CHECK (private.can_manage_proposal_organization(organization_id));
CREATE POLICY "Internal users manage proposal templates" ON public.proposal_templates
  FOR ALL USING (private.can_manage_proposal_organization(organization_id))
  WITH CHECK (private.can_manage_proposal_organization(organization_id));
CREATE POLICY "Internal users manage proposal price rules" ON public.proposal_price_rules
  FOR ALL USING (private.can_manage_proposal_organization(organization_id))
  WITH CHECK (private.can_manage_proposal_organization(organization_id));
CREATE POLICY "Internal users manage proposals" ON public.proposals
  FOR ALL USING (private.can_manage_proposal_organization(organization_id))
  WITH CHECK (private.can_manage_proposal_organization(organization_id));
CREATE POLICY "Portal users read own proposals" ON public.proposals
  FOR SELECT USING (private.can_access_portal_proposal(id));
CREATE POLICY "Internal users manage proposal items" ON public.proposal_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_id AND private.can_manage_proposal_organization(p.organization_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_id AND private.can_manage_proposal_organization(p.organization_id)
  ));
CREATE POLICY "Internal users manage proposal versions" ON public.proposal_versions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_id AND private.can_manage_proposal_organization(p.organization_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_id AND private.can_manage_proposal_organization(p.organization_id)
  ));
CREATE POLICY "Portal users read own proposal versions" ON public.proposal_versions
  FOR SELECT USING (private.can_access_portal_proposal(proposal_id));
CREATE POLICY "Internal users manage proposal decisions" ON public.proposal_decisions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.proposal_versions v
    JOIN public.proposals p ON p.id = v.proposal_id
    WHERE v.id = proposal_version_id AND private.can_manage_proposal_organization(p.organization_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposal_versions v
    JOIN public.proposals p ON p.id = v.proposal_id
    WHERE v.id = proposal_version_id AND private.can_manage_proposal_organization(p.organization_id)
  ));
CREATE POLICY "Portal users read own proposal decisions" ON public.proposal_decisions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.proposal_versions v
    WHERE v.id = proposal_version_id AND private.can_access_portal_proposal(v.proposal_id)
  ));
CREATE POLICY "Portal users decide current proposal version" ON public.proposal_decisions
  FOR INSERT WITH CHECK (
    source = 'portal'
    AND decided_by = (SELECT auth.uid())
    AND private.can_access_portal_proposal_version(proposal_version_id)
  );
CREATE POLICY "Internal users manage proposal tokens" ON public.proposal_access_tokens
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.proposal_versions v
    JOIN public.proposals p ON p.id = v.proposal_id
    WHERE v.id = proposal_version_id AND private.can_manage_proposal_organization(p.organization_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposal_versions v
    JOIN public.proposals p ON p.id = v.proposal_id
    WHERE v.id = proposal_version_id AND private.can_manage_proposal_organization(p.organization_id)
  ));
CREATE POLICY "Internal users read generation runs" ON public.ai_generation_runs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_id AND private.can_manage_proposal_organization(p.organization_id)
  ));
CREATE POLICY "Internal users read conversion runs" ON public.proposal_conversion_runs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = proposal_id AND private.can_manage_proposal_organization(p.organization_id)
  ));
CREATE POLICY "Internal users manage package presets" ON public.package_project_presets
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint presets" ON public.blueprint_project_presets
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_diagnostics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_price_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_access_tokens TO authenticated;
GRANT SELECT ON public.ai_generation_runs TO authenticated;
GRANT SELECT ON public.proposal_conversion_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_project_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_project_presets TO authenticated;

INSERT INTO public.proposal_templates (
  organization_id, package_id, name, scope, default_items, whatsapp_message, email_subject, email_body
)
SELECT
  o.id,
  p.id,
  'Padrao ' || p.name,
  'Implantacao do pacote ' || p.name || ' com configuracao, acompanhamento e entregas descritas no diagnostico comercial.',
  jsonb_build_array(jsonb_build_object(
    'itemKey', 'base',
    'label', p.name,
    'description', p.description,
    'quantity', 1,
    'unitValue', CASE p.key
      WHEN 'presenca_digital_ia' THEN 2500
      WHEN 'atendimento_inteligente' THEN 3500
      WHEN 'maquina_comercial' THEN 4500
      WHEN 'operacao_inteligente' THEN 6000
      ELSE 9000
    END
  )),
  'Preparamos uma proposta alinhada ao diagnostico da sua operacao. O link abaixo permite revisar o escopo e registrar sua decisao.',
  'Proposta comercial YUX - ' || p.name,
  'Segue a proposta comercial da YUX para revisao. O escopo permanece disponivel no link seguro enviado.'
FROM public.organizations o
CROSS JOIN public.packages p
WHERE o.slug = 'yux'
ON CONFLICT (organization_id, package_id, name) DO NOTHING;

INSERT INTO public.proposal_price_rules (
  organization_id, package_id, item_key, label, minimum_value, recommended_value, maximum_value
)
SELECT
  o.id,
  p.id,
  'base',
  p.name,
  CASE p.key
    WHEN 'presenca_digital_ia' THEN 1800
    WHEN 'atendimento_inteligente' THEN 2500
    WHEN 'maquina_comercial' THEN 3500
    WHEN 'operacao_inteligente' THEN 4500
    ELSE 7000
  END,
  CASE p.key
    WHEN 'presenca_digital_ia' THEN 2500
    WHEN 'atendimento_inteligente' THEN 3500
    WHEN 'maquina_comercial' THEN 4500
    WHEN 'operacao_inteligente' THEN 6000
    ELSE 9000
  END,
  CASE p.key
    WHEN 'presenca_digital_ia' THEN 4000
    WHEN 'atendimento_inteligente' THEN 5500
    WHEN 'maquina_comercial' THEN 7500
    WHEN 'operacao_inteligente' THEN 10000
    ELSE 18000
  END
FROM public.organizations o
CROSS JOIN public.packages p
WHERE o.slug = 'yux'
ON CONFLICT (organization_id, package_id, item_key) DO NOTHING;

INSERT INTO public.package_project_presets (package_id, phases)
SELECT p.id, jsonb_build_array(
  jsonb_build_object('name', 'Planejamento', 'orderIndex', 0, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Confirmar escopo contratado', 'orderIndex', 0),
    jsonb_build_object('title', 'Definir cronograma inicial', 'orderIndex', 1)
  )),
  jsonb_build_object('name', 'Implantacao', 'orderIndex', 1, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Executar configuracao inicial', 'orderIndex', 0),
    jsonb_build_object('title', 'Validar entrega com cliente', 'orderIndex', 1)
  ))
)
FROM public.packages p
ON CONFLICT (package_id) DO NOTHING;

INSERT INTO public.blueprint_project_presets (blueprint_id, phases)
SELECT b.id, jsonb_build_array(
  jsonb_build_object('name', 'Onboarding ' || b.name, 'orderIndex', 0, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Coletar dados do setor ' || b.sector, 'orderIndex', 0),
    jsonb_build_object('title', 'Aplicar configuracao do blueprint', 'orderIndex', 1)
  )),
  jsonb_build_object('name', 'Validacao operacional', 'orderIndex', 1, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Validar fluxo com equipe do cliente', 'orderIndex', 0)
  ))
)
FROM public.blueprints b
ON CONFLICT (blueprint_id) DO NOTHING;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD CONSTRAINT contracts_proposal_version_id_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD CONSTRAINT projects_proposal_version_id_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
