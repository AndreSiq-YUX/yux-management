-- YUX Marketing Studio foundation: module contract, content pipeline, calendar,
-- approvals, agent metadata, and AI credits.

CREATE OR REPLACE FUNCTION private.has_active_marketing_studio_contract(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts c
    JOIN public.contract_modules cm
      ON cm.contract_id = c.id
     AND cm.module_key = 'marketing_studio'
     AND cm.enabled = TRUE
    WHERE c.client_id = target_organization_id
      AND c.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.has_marketing_studio_permission(target_organization_id UUID, target_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_permission IN (
      'marketing_studio.read',
      'marketing_studio.write',
      'marketing_studio.configure',
      'marketing_studio.supervise'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.memberships m
        JOIN public.roles r ON r.key = m.role_key AND r.scope = 'internal'
        JOIN public.role_permissions rp ON rp.role_key = m.role_key
        WHERE m.user_id = (SELECT auth.uid())
          AND rp.permission_key IN (target_permission, 'platform.manage')
      )
      OR (
        private.has_active_marketing_studio_contract(target_organization_id)
        AND EXISTS (
          SELECT 1
          FROM public.memberships m
          JOIN public.role_permissions rp ON rp.role_key = m.role_key
          WHERE m.organization_id = target_organization_id
            AND m.user_id = (SELECT auth.uid())
            AND rp.permission_key = target_permission
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_access_marketing_studio_organization(target_organization_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE target_action
    WHEN 'read' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.read')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.write')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.configure')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    WHEN 'write' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.write')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.configure')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    WHEN 'configure' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.configure')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    WHEN 'supervise' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    ELSE FALSE
  END;
$$;

REVOKE ALL ON FUNCTION private.has_active_marketing_studio_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_marketing_studio_permission(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_marketing_studio_organization(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_active_marketing_studio_contract(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_marketing_studio_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_marketing_studio_organization(UUID, TEXT) TO authenticated, service_role;

CREATE TABLE public.marketing_studio_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  operation_mode TEXT NOT NULL DEFAULT 'managed_by_yux'
    CHECK (operation_mode IN ('managed_by_yux', 'assisted_client', 'advanced_partner')),
  monthly_credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credit_limit >= 0),
  current_credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_credit_balance >= 0),
  approval_policy JSONB NOT NULL DEFAULT jsonb_build_object(
    'publishSocial', true,
    'publishWordPress', true,
    'paidCampaignDraft', true,
    'premiumImage', true,
    'regulatedContent', true
  ) CHECK (jsonb_typeof(approval_policy) = 'object'),
  allowed_channels TEXT[] NOT NULL DEFAULT ARRAY['linkedin','instagram','blog','newsletter']::TEXT[],
  tone_of_voice TEXT,
  persona TEXT,
  visual_preferences TEXT,
  forbidden_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  priority_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE public.marketing_agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  default_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  default_model TEXT,
  fallback_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.marketing_agent_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  agent_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  base_prompt TEXT,
  default_model TEXT,
  fallback_model TEXT,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  max_cost_per_run NUMERIC(12,4),
  max_runs_per_day INTEGER CHECK (max_runs_per_day IS NULL OR max_runs_per_day >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss','blog','news','youtube','competitor','crm','omnichannel','campaign','manual')),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','failed','archived')),
  last_read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.marketing_sources(id) ON DELETE SET NULL,
  source_reference_id UUID,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'captured' CHECK (status IN ('captured','curated','approved','rejected','converted')),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','radar','crm','omnichannel','campaign','report')),
  source_url TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  opportunity_score INTEGER NOT NULL DEFAULT 0 CHECK (opportunity_score BETWEEN 0 AND 100),
  suggested_channel TEXT,
  rejection_reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  content_type TEXT NOT NULL CHECK (content_type IN ('social_post','blog_article','newsletter','email','ad_copy','video_script','carousel_text','creative_brief')),
  channel TEXT NOT NULL CHECK (BTRIM(channel) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','changes_requested','approved','scheduled','published','rejected','archived')),
  brief TEXT,
  body TEXT,
  cta TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  source_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  body TEXT,
  change_summary TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_item_id, version_number)
);

CREATE TABLE public.content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes_requested','rejected')),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  comments TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(checklist) = 'object'),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.editorial_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  channel TEXT NOT NULL CHECK (BTRIM(channel) <> ''),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','scheduled','published','missed','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  responsible_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ai_credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  monthly_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
  current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  monthly_used INTEGER NOT NULL DEFAULT 0 CHECK (monthly_used >= 0),
  reset_day INTEGER NOT NULL DEFAULT 1 CHECK (reset_day BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE public.ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.ai_credit_wallets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  workflow_run_id UUID,
  action TEXT NOT NULL CHECK (BTRIM(action) <> ''),
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  tool_name TEXT,
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketing_settings_org_contract ON public.marketing_studio_settings(organization_id, contract_id);
CREATE INDEX idx_marketing_agents_org_type_status ON public.marketing_agents(organization_id, agent_type, status);
CREATE INDEX idx_marketing_sources_contract_status ON public.marketing_sources(contract_id, status);
CREATE INDEX idx_marketing_ideas_contract_status ON public.marketing_ideas(contract_id, status, priority);
CREATE INDEX idx_content_items_contract_status ON public.content_items(contract_id, status, channel);
CREATE INDEX idx_content_items_campaign_id ON public.content_items(campaign_id);
CREATE INDEX idx_content_items_landing_page_id ON public.content_items(landing_page_id);
CREATE INDEX idx_content_versions_item_version ON public.content_versions(content_item_id, version_number DESC);
CREATE INDEX idx_content_reviews_item_status ON public.content_reviews(content_item_id, status);
CREATE INDEX idx_editorial_calendar_contract_start ON public.editorial_calendar_items(contract_id, starts_at);
CREATE INDEX idx_ai_credit_wallets_contract ON public.ai_credit_wallets(contract_id);
CREATE INDEX idx_ai_usage_ledger_contract_created ON public.ai_usage_ledger(contract_id, created_at DESC);
CREATE INDEX idx_ai_usage_ledger_agent_created ON public.ai_usage_ledger(agent_id, created_at DESC);

CREATE TRIGGER update_marketing_studio_settings_updated_at BEFORE UPDATE ON public.marketing_studio_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_agent_templates_updated_at BEFORE UPDATE ON public.marketing_agent_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_agents_updated_at BEFORE UPDATE ON public.marketing_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_sources_updated_at BEFORE UPDATE ON public.marketing_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_ideas_updated_at BEFORE UPDATE ON public.marketing_ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_content_items_updated_at BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_content_reviews_updated_at BEFORE UPDATE ON public.content_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_editorial_calendar_items_updated_at BEFORE UPDATE ON public.editorial_calendar_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ai_credit_wallets_updated_at BEFORE UPDATE ON public.ai_credit_wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_calendar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing users read settings" ON public.marketing_studio_settings
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage settings" ON public.marketing_studio_settings
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Authenticated users read marketing agent templates" ON public.marketing_agent_templates
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Internal users manage marketing agent templates" ON public.marketing_agent_templates
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Marketing users read agents" ON public.marketing_agents
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage agents" ON public.marketing_agents
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read sources" ON public.marketing_sources
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage sources" ON public.marketing_sources
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read ideas" ON public.marketing_ideas
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers manage ideas" ON public.marketing_ideas
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));

CREATE POLICY "Marketing users read content" ON public.content_items
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers manage content" ON public.content_items
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));

CREATE POLICY "Marketing users read content versions" ON public.content_versions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id
        AND private.can_access_marketing_studio_organization(c.organization_id, 'read')
    )
  );
CREATE POLICY "Marketing writers manage content versions" ON public.content_versions
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id
        AND private.can_access_marketing_studio_organization(c.organization_id, 'write')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id
        AND private.can_access_marketing_studio_organization(c.organization_id, 'write')
    )
  );

CREATE POLICY "Marketing users read content reviews" ON public.content_reviews
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id
        AND private.can_access_marketing_studio_organization(c.organization_id, 'read')
    )
  );
CREATE POLICY "Marketing writers manage content reviews" ON public.content_reviews
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id
        AND private.can_access_marketing_studio_organization(c.organization_id, 'write')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id
        AND private.can_access_marketing_studio_organization(c.organization_id, 'write')
    )
  );

CREATE POLICY "Marketing users read calendar" ON public.editorial_calendar_items
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers manage calendar" ON public.editorial_calendar_items
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));

CREATE POLICY "Marketing users read credit wallets" ON public.ai_credit_wallets
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing configurators manage credit wallets" ON public.ai_credit_wallets
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing users read usage ledger" ON public.ai_usage_ledger
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers create usage ledger" ON public.ai_usage_ledger
  FOR INSERT TO authenticated WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));
CREATE POLICY "Marketing supervisors update usage ledger" ON public.ai_usage_ledger
  FOR UPDATE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

REVOKE ALL ON public.marketing_studio_settings FROM anon;
REVOKE ALL ON public.marketing_agent_templates FROM anon;
REVOKE ALL ON public.marketing_agents FROM anon;
REVOKE ALL ON public.marketing_sources FROM anon;
REVOKE ALL ON public.marketing_ideas FROM anon;
REVOKE ALL ON public.content_items FROM anon;
REVOKE ALL ON public.content_versions FROM anon;
REVOKE ALL ON public.content_reviews FROM anon;
REVOKE ALL ON public.editorial_calendar_items FROM anon;
REVOKE ALL ON public.ai_credit_wallets FROM anon;
REVOKE ALL ON public.ai_usage_ledger FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_studio_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_agent_templates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_agents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_sources TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ideas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_versions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reviews TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editorial_calendar_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_credit_wallets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_ledger TO authenticated, service_role;

INSERT INTO public.marketing_agent_templates (agent_type, name, description, default_tools, requires_human_approval)
VALUES
  ('content_radar', 'Radar de Conteudo', 'Encontra oportunidades de conteudo a partir de fontes curadas e internas.', ARRAY['jina_reader','jina_search','curated_sources']::TEXT[], TRUE),
  ('strategic_curator', 'Curador Estrategico', 'Filtra, prioriza e rejeita ideias com justificativa.', ARRAY['curated_sources','rag_search']::TEXT[], TRUE),
  ('content_strategist', 'Estrategista de Conteudo', 'Transforma ideias aprovadas em briefings multicanal.', ARRAY['curated_sources','rag_search']::TEXT[], TRUE),
  ('multichannel_writer', 'Redator Multicanal', 'Gera textos adaptados por canal e tom de voz.', ARRAY['rag_search']::TEXT[], TRUE),
  ('brand_quality_reviewer', 'Revisor de Marca e Qualidade', 'Revisa seguranca, qualidade, tom e necessidade de grounding.', ARRAY['rag_search','jina_grounding']::TEXT[], TRUE),
  ('campaign_strategist', 'Estrategista de Campanhas', 'Sugere angulos, copies, publicos, CTAs e campanhas rascunho.', ARRAY['campaign_draft','rag_search']::TEXT[], TRUE),
  ('visual_creative_generator', 'Gerador de Criativos Visuais', 'Cria prompts, conceitos visuais e variacoes com limites de credito.', ARRAY['image_generation','rag_search']::TEXT[], TRUE),
  ('editorial_calendar_manager', 'Gestor de Calendario Editorial', 'Organiza conteudos aprovados em calendario e tarefas.', ARRAY['create_task']::TEXT[], TRUE),
  ('controlled_publisher', 'Publicador Controlado', 'Cria rascunhos e publica somente apos aprovacao.', ARRAY['create_task','create_wordpress_draft']::TEXT[], TRUE),
  ('performance_analyst', 'Analista de Performance', 'Analisa resultados e retroalimenta novos ciclos.', ARRAY['rag_search']::TEXT[], TRUE)
ON CONFLICT (agent_type) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_tools = EXCLUDED.default_tools,
    requires_human_approval = EXCLUDED.requires_human_approval,
    updated_at = NOW();

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES (
  'marketing_studio',
  'Marketing Studio',
  FALSE,
  '/marketing-studio',
  '/portal/marketing-studio',
  ARRAY['marketing_studio.read']::TEXT[]
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    internal_route = EXCLUDED.internal_route,
    portal_route = EXCLUDED.portal_route,
    required_permissions = EXCLUDED.required_permissions,
    updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'marketing_studio.read'),
  ('yux_admin', 'marketing_studio.write'),
  ('yux_admin', 'marketing_studio.configure'),
  ('yux_admin', 'marketing_studio.supervise'),
  ('yux_manager', 'marketing_studio.read'),
  ('yux_manager', 'marketing_studio.write'),
  ('yux_manager', 'marketing_studio.configure'),
  ('yux_manager', 'marketing_studio.supervise'),
  ('yux_member', 'marketing_studio.read'),
  ('yux_member', 'marketing_studio.write'),
  ('client_admin', 'marketing_studio.read'),
  ('client_admin', 'marketing_studio.write'),
  ('client_admin', 'marketing_studio.configure'),
  ('client_member', 'marketing_studio.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
