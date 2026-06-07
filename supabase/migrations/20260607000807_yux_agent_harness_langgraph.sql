-- YUX Marketing Studio Phase 4: LangGraph runtime contracts, agent harness
-- governance, prompt layering, tool permissions, model routing and run logs.

ALTER TABLE public.marketing_agents
  ADD COLUMN IF NOT EXISTS prompt_config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(prompt_config) = 'object'),
  ADD COLUMN IF NOT EXISTS context_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context_policy) = 'object'),
  ADD COLUMN IF NOT EXISTS quality_gates JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(quality_gates) = 'object'),
  ADD COLUMN IF NOT EXISTS model_parameters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(model_parameters) = 'object'),
  ADD COLUMN IF NOT EXISTS prompt_version INTEGER NOT NULL DEFAULT 1 CHECK (prompt_version > 0);

CREATE TABLE public.marketing_agent_global_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketing_agent_templates(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL CHECK (BTRIM(system_prompt) <> ''),
  prompt_version INTEGER NOT NULL DEFAULT 1 CHECK (prompt_version > 0),
  default_context_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_context_policy) = 'object'),
  default_model_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_model_policy) = 'object'),
  default_quality_gates JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_quality_gates) = 'object'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id),
  UNIQUE (agent_type)
);

CREATE TABLE public.marketing_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL CHECK (BTRIM(workflow_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','scheduled','event','webhook')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, workflow_key)
);

CREATE TABLE public.marketing_workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.marketing_workflows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL CHECK (BTRIM(node_key) <> ''),
  node_type TEXT NOT NULL CHECK (node_type IN ('agent','tool','gate','approval','output')),
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  tool_key TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  position_x NUMERIC(10,2) NOT NULL DEFAULT 0,
  position_y NUMERIC(10,2) NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, node_key)
);

CREATE TABLE public.marketing_workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.marketing_workflows(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES public.marketing_workflow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.marketing_workflow_nodes(id) ON DELETE CASCADE,
  condition_key TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, source_node_id, target_node_id, condition_key)
);

CREATE TABLE public.marketing_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.marketing_workflows(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  run_type TEXT NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual','scheduled','event','retry')),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  context_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context_snapshot) = 'object'),
  result_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(result_payload) = 'object'),
  credit_debit INTEGER NOT NULL DEFAULT 0 CHECK (credit_debit >= 0),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  error_message TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.marketing_workflow_runs(id) ON DELETE CASCADE,
  workflow_node_id UUID REFERENCES public.marketing_workflow_nodes(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.marketing_agent_templates(id) ON DELETE SET NULL,
  global_prompt_id UUID REFERENCES public.marketing_agent_global_prompts(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  agent_prompt_snapshot TEXT,
  prompt_config_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(prompt_config_snapshot) = 'object'),
  context_summary TEXT,
  compiled_prompt_hash TEXT,
  model_provider TEXT,
  model_name TEXT,
  fallback_model_name TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.marketing_workflow_runs(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL CHECK (BTRIM(tool_key) <> ''),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.agent_budget_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  agent_type TEXT,
  max_cost_per_run NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_run >= 0),
  max_credits_per_run INTEGER NOT NULL DEFAULT 0 CHECK (max_credits_per_run >= 0),
  max_runs_per_day INTEGER NOT NULL DEFAULT 0 CHECK (max_runs_per_day >= 0),
  monthly_credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credit_limit >= 0),
  require_approval_over_credits INTEGER NOT NULL DEFAULT 0 CHECK (require_approval_over_credits >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agent_id IS NOT NULL OR agent_type IS NOT NULL)
);

CREATE TABLE public.model_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  agent_type TEXT,
  routing_tier TEXT NOT NULL DEFAULT 'default' CHECK (routing_tier IN ('cheap','default','premium','fallback')),
  provider TEXT NOT NULL CHECK (BTRIM(provider) <> ''),
  model_name TEXT NOT NULL CHECK (BTRIM(model_name) <> ''),
  fallback_model_name TEXT,
  max_input_tokens INTEGER NOT NULL DEFAULT 8000 CHECK (max_input_tokens > 0),
  max_output_tokens INTEGER NOT NULL DEFAULT 2000 CHECK (max_output_tokens > 0),
  temperature NUMERIC(4,3) NOT NULL DEFAULT 0.4 CHECK (temperature >= 0 AND temperature <= 2),
  max_cost_per_run NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_run >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agent_id IS NOT NULL OR agent_type IS NOT NULL)
);

CREATE TABLE public.marketing_agent_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  agent_type TEXT,
  tool_key TEXT NOT NULL CHECK (BTRIM(tool_key) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requires_human_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_calls_per_run INTEGER NOT NULL DEFAULT 1 CHECK (max_calls_per_run >= 0),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agent_id IS NOT NULL OR agent_type IS NOT NULL)
);

CREATE INDEX idx_marketing_global_prompts_type_status ON public.marketing_agent_global_prompts(agent_type, status);
CREATE INDEX idx_marketing_agents_contract_type_status ON public.marketing_agents(contract_id, agent_type, status);
CREATE INDEX idx_marketing_workflows_contract_status ON public.marketing_workflows(contract_id, status);
CREATE INDEX idx_marketing_workflow_nodes_workflow ON public.marketing_workflow_nodes(workflow_id, node_type);
CREATE INDEX idx_marketing_workflow_edges_workflow ON public.marketing_workflow_edges(workflow_id);
CREATE INDEX idx_marketing_workflow_runs_contract_status ON public.marketing_workflow_runs(contract_id, status, created_at DESC);
CREATE INDEX idx_marketing_agent_runs_workflow_status ON public.marketing_agent_runs(workflow_run_id, status, created_at DESC);
CREATE INDEX idx_marketing_tool_runs_workflow_status ON public.marketing_tool_runs(workflow_run_id, status, created_at DESC);
CREATE INDEX idx_agent_budget_policies_contract_agent ON public.agent_budget_policies(contract_id, agent_id, agent_type);
CREATE INDEX idx_model_routing_rules_contract_agent ON public.model_routing_rules(contract_id, agent_id, agent_type, routing_tier);
CREATE INDEX idx_marketing_agent_tool_policies_contract_agent ON public.marketing_agent_tool_policies(contract_id, agent_id, agent_type, tool_key);

CREATE TRIGGER update_marketing_agent_global_prompts_updated_at BEFORE UPDATE ON public.marketing_agent_global_prompts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_workflows_updated_at BEFORE UPDATE ON public.marketing_workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_workflow_nodes_updated_at BEFORE UPDATE ON public.marketing_workflow_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_workflow_runs_updated_at BEFORE UPDATE ON public.marketing_workflow_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_budget_policies_updated_at BEFORE UPDATE ON public.agent_budget_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_model_routing_rules_updated_at BEFORE UPDATE ON public.model_routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_agent_tool_policies_updated_at BEFORE UPDATE ON public.marketing_agent_tool_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_agent_global_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_tool_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_budget_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_agent_tool_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage marketing global prompts" ON public.marketing_agent_global_prompts
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Marketing configurators read workflows" ON public.marketing_workflows
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'));
CREATE POLICY "Marketing configurators manage workflows" ON public.marketing_workflows
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing configurators read workflow nodes" ON public.marketing_workflow_nodes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflows w
      WHERE w.id = workflow_id
        AND private.can_access_marketing_studio_organization(w.organization_id, 'configure')
    )
  );
CREATE POLICY "Marketing configurators manage workflow nodes" ON public.marketing_workflow_nodes
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflows w
      WHERE w.id = workflow_id
        AND private.can_access_marketing_studio_organization(w.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketing_workflows w
      WHERE w.id = workflow_id
        AND private.can_access_marketing_studio_organization(w.organization_id, 'configure')
    )
  );

CREATE POLICY "Marketing configurators read workflow edges" ON public.marketing_workflow_edges
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflows w
      WHERE w.id = workflow_id
        AND private.can_access_marketing_studio_organization(w.organization_id, 'configure')
    )
  );
CREATE POLICY "Marketing configurators manage workflow edges" ON public.marketing_workflow_edges
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflows w
      WHERE w.id = workflow_id
        AND private.can_access_marketing_studio_organization(w.organization_id, 'configure')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketing_workflows w
      WHERE w.id = workflow_id
        AND private.can_access_marketing_studio_organization(w.organization_id, 'configure')
    )
  );

CREATE POLICY "Marketing users read workflow runs" ON public.marketing_workflow_runs
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers create workflow runs" ON public.marketing_workflow_runs
  FOR INSERT TO authenticated WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));
CREATE POLICY "Marketing supervisors update workflow runs" ON public.marketing_workflow_runs
  FOR UPDATE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

CREATE POLICY "Marketing configurators read agent runs" ON public.marketing_agent_runs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflow_runs r
      WHERE r.id = workflow_run_id
        AND private.can_access_marketing_studio_organization(r.organization_id, 'configure')
    )
  );
CREATE POLICY "Marketing supervisors manage agent runs" ON public.marketing_agent_runs
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflow_runs r
      WHERE r.id = workflow_run_id
        AND private.can_access_marketing_studio_organization(r.organization_id, 'supervise')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketing_workflow_runs r
      WHERE r.id = workflow_run_id
        AND private.can_access_marketing_studio_organization(r.organization_id, 'supervise')
    )
  );

CREATE POLICY "Marketing configurators read tool runs" ON public.marketing_tool_runs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflow_runs r
      WHERE r.id = workflow_run_id
        AND private.can_access_marketing_studio_organization(r.organization_id, 'configure')
    )
  );
CREATE POLICY "Marketing supervisors manage tool runs" ON public.marketing_tool_runs
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.marketing_workflow_runs r
      WHERE r.id = workflow_run_id
        AND private.can_access_marketing_studio_organization(r.organization_id, 'supervise')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketing_workflow_runs r
      WHERE r.id = workflow_run_id
        AND private.can_access_marketing_studio_organization(r.organization_id, 'supervise')
    )
  );

CREATE POLICY "Marketing configurators read budget policies" ON public.agent_budget_policies
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'));
CREATE POLICY "Marketing configurators manage budget policies" ON public.agent_budget_policies
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

CREATE POLICY "Marketing configurators read model routing" ON public.model_routing_rules
  FOR SELECT TO authenticated USING (
    (organization_id IS NOT NULL AND private.can_access_marketing_studio_organization(organization_id, 'configure'))
    OR private.is_internal_user()
  );
CREATE POLICY "Marketing configurators manage model routing" ON public.model_routing_rules
  FOR ALL TO authenticated USING (
    (organization_id IS NOT NULL AND private.can_access_marketing_studio_organization(organization_id, 'configure'))
    OR private.is_internal_user()
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND private.can_access_marketing_studio_organization(organization_id, 'configure'))
    OR private.is_internal_user()
  );

CREATE POLICY "Marketing configurators read tool policies" ON public.marketing_agent_tool_policies
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'));
CREATE POLICY "Marketing configurators manage tool policies" ON public.marketing_agent_tool_policies
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

REVOKE ALL ON public.marketing_agent_global_prompts FROM anon;
REVOKE ALL ON public.marketing_workflows FROM anon;
REVOKE ALL ON public.marketing_workflow_nodes FROM anon;
REVOKE ALL ON public.marketing_workflow_edges FROM anon;
REVOKE ALL ON public.marketing_workflow_runs FROM anon;
REVOKE ALL ON public.marketing_agent_runs FROM anon;
REVOKE ALL ON public.marketing_tool_runs FROM anon;
REVOKE ALL ON public.agent_budget_policies FROM anon;
REVOKE ALL ON public.model_routing_rules FROM anon;
REVOKE ALL ON public.marketing_agent_tool_policies FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_agent_global_prompts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_workflows TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_workflow_nodes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_workflow_edges TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_workflow_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_agent_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_tool_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_budget_policies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_routing_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_agent_tool_policies TO authenticated, service_role;

ALTER TABLE public.ai_usage_ledger
  ADD CONSTRAINT ai_usage_ledger_workflow_run_id_fkey
  FOREIGN KEY (workflow_run_id)
  REFERENCES public.marketing_workflow_runs(id)
  ON DELETE SET NULL
  NOT VALID;

INSERT INTO public.marketing_agent_global_prompts (
  template_id,
  agent_type,
  system_prompt,
  prompt_version,
  default_context_policy,
  default_model_policy,
  default_quality_gates
)
SELECT
  t.id,
  t.agent_type,
  CASE t.agent_type
    WHEN 'content_radar' THEN 'Voce e o Radar de Conteudo da YUX. Encontre oportunidades de marketing usando apenas fontes e ferramentas autorizadas. Nunca publique, compre midia ou afirme dados sem fonte.'
    WHEN 'strategic_curator' THEN 'Voce e o Curador Estrategico da YUX. Priorize ideias por impacto comercial, aderencia ao cliente e risco. Explique rejeicoes de forma objetiva.'
    WHEN 'content_strategist' THEN 'Voce e o Estrategista de Conteudo da YUX. Transforme ideias aprovadas em briefings claros, com objetivo, publico, funil, canal, CTA e criterios de qualidade.'
    WHEN 'multichannel_writer' THEN 'Voce e o Redator Multicanal da YUX. Escreva com base no tom da marca, RAG e restricoes do contrato. Evite promessas absolutas e preserve clareza comercial.'
    WHEN 'brand_quality_reviewer' THEN 'Voce e o Revisor de Marca e Qualidade da YUX. Avalie tom, clareza, riscos, LGPD, promessas comerciais, grounding necessario e criterios do canal.'
    WHEN 'campaign_strategist' THEN 'Voce e o Estrategista de Campanhas da YUX. Crie apenas rascunhos e hipoteses de campanha, com publicos, copies, CTA, UTM e riscos. Nunca ative campanha.'
    WHEN 'visual_creative_generator' THEN 'Voce e o Gerador de Criativos Visuais da YUX. Produza conceitos e prompts visuais aderentes a marca, com limites de creditos e aprovacao humana quando exigida.'
    WHEN 'editorial_calendar_manager' THEN 'Voce e o Gestor de Calendario Editorial da YUX. Distribua conteudos com equilibrio de temas, canais e prazos. Nunca publique sem aprovacao.'
    WHEN 'controlled_publisher' THEN 'Voce e o Publicador Controlado da YUX. Crie rascunhos e tarefas somente quando autorizado. Publicacao final sempre depende da politica de aprovacao.'
    WHEN 'performance_analyst' THEN 'Voce e o Analista de Performance da YUX. Analise resultados, gere hipoteses e recomende proximos temas com base em dados disponiveis e rastreaveis.'
    ELSE 'Voce e um agente de marketing da YUX. Siga as permissoes, contexto e limites do contrato.'
  END,
  1,
  jsonb_build_object('includeBrandProfile', true, 'includeProducts', true, 'includeKnowledge', true, 'includeRecentContent', true),
  jsonb_build_object('routingTier', 'default'),
  jsonb_build_object('requiresHumanApproval', t.requires_human_approval, 'minimumQualityScore', 70)
FROM public.marketing_agent_templates t
ON CONFLICT (template_id) DO UPDATE
SET agent_type = EXCLUDED.agent_type,
    system_prompt = EXCLUDED.system_prompt,
    default_context_policy = EXCLUDED.default_context_policy,
    default_model_policy = EXCLUDED.default_model_policy,
    default_quality_gates = EXCLUDED.default_quality_gates,
    updated_at = NOW();

INSERT INTO public.model_routing_rules (
  agent_type,
  routing_tier,
  provider,
  model_name,
  fallback_model_name,
  max_input_tokens,
  max_output_tokens,
  temperature,
  max_cost_per_run
)
VALUES
  ('content_radar', 'cheap', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 8000, 1200, 0.2, 0),
  ('strategic_curator', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 8000, 1200, 0.3, 0),
  ('content_strategist', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 12000, 1800, 0.4, 0),
  ('multichannel_writer', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 12000, 2200, 0.7, 0),
  ('brand_quality_reviewer', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 12000, 1200, 0.2, 0),
  ('campaign_strategist', 'premium', 'openrouter', 'openai/gpt-4o', 'openai/gpt-4o-mini', 16000, 2200, 0.5, 0),
  ('visual_creative_generator', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 8000, 1200, 0.6, 0),
  ('editorial_calendar_manager', 'cheap', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 8000, 1000, 0.2, 0),
  ('controlled_publisher', 'cheap', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 4000, 800, 0.1, 0),
  ('performance_analyst', 'premium', 'openrouter', 'openai/gpt-4o', 'openai/gpt-4o-mini', 16000, 2400, 0.3, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
