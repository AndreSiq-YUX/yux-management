-- Strategy Packs and internal YUX growth workspace.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_internal_growth_workspace BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workspace_purpose TEXT NOT NULL DEFAULT 'client_delivery',
  ADD COLUMN IF NOT EXISTS strategy_pack_scope TEXT NOT NULL DEFAULT 'client';

CREATE TABLE IF NOT EXISTS public.yux_strategy_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'internal',
  visibility TEXT NOT NULL DEFAULT 'internal_only',
  source_kind TEXT NOT NULL DEFAULT 'manual',
  source_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  target_profile_keys TEXT[] NOT NULL DEFAULT '{}',
  target_modules TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_pack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.yux_strategy_packs(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  profile_keys TEXT[] NOT NULL DEFAULT '{}',
  stage_tags TEXT[] NOT NULL DEFAULT '{}',
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}',
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  priority INTEGER NOT NULL DEFAULT 100,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_pack_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.yux_strategy_packs(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT,
  module_key TEXT,
  channel TEXT,
  workflow_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 100,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID REFERENCES public.yux_strategy_packs(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.yux_strategy_source_documents(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'document',
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  current_step TEXT NOT NULL DEFAULT 'upload',
  proposed_counts JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_pack_items_pack_status
  ON public.yux_strategy_pack_items(pack_id, status);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_pack_items_type
  ON public.yux_strategy_pack_items(item_type);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_pack_bindings_pack
  ON public.yux_strategy_pack_bindings(pack_id);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_pack_bindings_org
  ON public.yux_strategy_pack_bindings(organization_id);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_ingestion_jobs_pack
  ON public.yux_strategy_ingestion_jobs(pack_id);

DROP TRIGGER IF EXISTS update_yux_strategy_packs_updated_at ON public.yux_strategy_packs;
CREATE TRIGGER update_yux_strategy_packs_updated_at
  BEFORE UPDATE ON public.yux_strategy_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_yux_strategy_pack_items_updated_at ON public.yux_strategy_pack_items;
CREATE TRIGGER update_yux_strategy_pack_items_updated_at
  BEFORE UPDATE ON public.yux_strategy_pack_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_yux_strategy_pack_bindings_updated_at ON public.yux_strategy_pack_bindings;
CREATE TRIGGER update_yux_strategy_pack_bindings_updated_at
  BEFORE UPDATE ON public.yux_strategy_pack_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_yux_strategy_ingestion_jobs_updated_at ON public.yux_strategy_ingestion_jobs;
CREATE TRIGGER update_yux_strategy_ingestion_jobs_updated_at
  BEFORE UPDATE ON public.yux_strategy_ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.clients (
  id,
  company_name,
  contact_name,
  email,
  phone,
  website,
  sector,
  size,
  lead_source,
  status,
  notes,
  tags,
  communication_preferences
)
VALUES (
  '550e8400-e29b-41d4-a716-44665544a001',
  'YUX Solucoes em IA',
  'Equipe YUX',
  'crescimento@yux.com.br',
  NULL,
  'https://yux.com.br',
  'Consultoria, IA e crescimento comercial',
  'small',
  'internal',
  'active',
  'Workspace interno para operar CRM, atendimento, marketing e relatorios da propria YUX com Strategy Harness e RAG proprietario.',
  ARRAY['internal_growth','strategy_harness','blackbook_doctrine']::TEXT[],
  ARRAY['email','whatsapp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  website = EXCLUDED.website,
  sector = EXCLUDED.sector,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  tags = EXCLUDED.tags,
  communication_preferences = EXCLUDED.communication_preferences,
  updated_at = NOW();

UPDATE public.organizations
SET
  client_id = '550e8400-e29b-41d4-a716-44665544a001',
  is_internal_growth_workspace = true,
  workspace_purpose = 'yux_growth',
  strategy_pack_scope = 'internal'
WHERE id = '650e8400-e29b-41d4-a716-446655440001';

INSERT INTO public.packages (id, key, name, description)
VALUES (
  '770e8400-e29b-41d4-a716-44665544a001',
  'yux_internal_growth',
  'Crescimento YUX',
  'Pacote interno para operar a propria YUX com CRM, Omnichannel IA, Marketing Studio, propostas, relatorios, automacoes, suporte e financeiro.'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO public.package_modules (package_id, module_key)
SELECT '770e8400-e29b-41d4-a716-44665544a001', pm.key
FROM public.platform_modules pm
ON CONFLICT (package_id, module_key) DO NOTHING;

INSERT INTO public.contracts (
  id,
  client_id,
  package_id,
  name,
  status,
  starts_at,
  value,
  billing_cycle,
  notes
)
VALUES (
  '660e8400-e29b-41d4-a716-44665544a001',
  '550e8400-e29b-41d4-a716-44665544a001',
  '770e8400-e29b-41d4-a716-44665544a001',
  'Operacao interna Crescimento YUX',
  'active',
  '2026-07-01',
  0,
  'monthly',
  'Contrato tecnico interno para liberar os modulos operacionais da YUX como se fosse um cliente operavel.'
)
ON CONFLICT (id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  package_id = EXCLUDED.package_id,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  value = EXCLUDED.value,
  billing_cycle = EXCLUDED.billing_cycle,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO public.contract_modules (contract_id, module_key, enabled)
SELECT '660e8400-e29b-41d4-a716-44665544a001', pm.key, true
FROM public.platform_modules pm
ON CONFLICT (contract_id, module_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

INSERT INTO public.yux_strategy_packs (
  id,
  pack_key,
  name,
  description,
  scope,
  visibility,
  source_kind,
  source_title,
  status,
  version,
  target_profile_keys,
  target_modules,
  metadata
)
VALUES (
  '880e8400-e29b-41d4-a716-44665544a001',
  'blackbook_yux_growth_doctrine',
  'Doutrina YUX Growth Blackbook',
  'Pacote interno que transforma conhecimento estrategico estudado pela YUX em regras, cards, playbooks e contexto operacional para agentes de marketing e vendas.',
  'internal',
  'internal_only',
  'private_book',
  'The Black Book',
  'published',
  1,
  ARRAY[
    'growth_strategist',
    'crm_controller',
    'ai_sdr_comercial_1',
    'ai_closer',
    'customer_growth_comercial_2',
    'revenue_recovery',
    'offer_conversion',
    'marketing_strategist',
    'metrics_cash_mroi',
    'proposal_delivery'
  ]::TEXT[],
  ARRAY[
    'crm',
    'whatsapp_ai',
    'omnichannel',
    'marketing_studio',
    'campaigns',
    'landing_pages',
    'automations',
    'proposals',
    'bi_reports'
  ]::TEXT[],
  jsonb_build_object(
    'governance', 'admin_approved',
    'copyrightBoundary', 'derived_methodology_no_long_quotes',
    'defaultWorkspace', 'crescimento_yux'
  )
)
ON CONFLICT (pack_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  visibility = EXCLUDED.visibility,
  source_kind = EXCLUDED.source_kind,
  source_title = EXCLUDED.source_title,
  status = EXCLUDED.status,
  target_profile_keys = EXCLUDED.target_profile_keys,
  target_modules = EXCLUDED.target_modules,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH pack AS (
  SELECT id FROM public.yux_strategy_packs WHERE pack_key = 'blackbook_yux_growth_doctrine'
), seed_items(item_type, title, summary, body, profile_keys, stage_tags, retrieval_tags, priority, payload) AS (
  VALUES
    (
      'concept_card',
      'Sistema comercial antes de aquisicao fria',
      'Antes de pedir mais leads, o agente deve auditar base atual, follow-up, oportunidades paradas, recorrencia, ticket, CAC e perdas operacionais.',
      'Regra operacional: nunca recomendar aquisicao fria como primeira resposta sem verificar vazamentos de caixa dentro da base existente. A recomendacao deve comparar impacto em caixa, velocidade de implantacao e complexidade operacional.',
      ARRAY['growth_strategist','metrics_cash_mroi','crm_controller']::TEXT[],
      ARRAY['lead_cold','raised_hand','qualified_opportunity','non_customer','ex_customer']::TEXT[],
      ARRAY['priorizacao','caixa','diagnostico','aquisicao']::TEXT[],
      10,
      jsonb_build_object('antiPatterns', ARRAY['pedir mais leads sem auditar funil','campanha fria sem CRM disciplinado'])
    ),
    (
      'concept_card',
      'CRM como centro de controle comercial',
      'CRM nao e cadastro; e o cockpit de oportunidades, follow-up, objeções, tarefas, proxima acao e decisao comercial.',
      'Regra operacional: toda recomendacao comercial precisa virar dado estruturado ou tarefa rastreavel. Lead parado, objecao sem registro e proxima acao ausente devem gerar alerta do agente controlador.',
      ARRAY['crm_controller','ai_sdr_comercial_1','ai_closer']::TEXT[],
      ARRAY['raised_hand','qualified_opportunity','almost_customer','non_customer']::TEXT[],
      ARRAY['crm','follow_up','disciplina_comercial']::TEXT[],
      20,
      jsonb_build_object('requiredOutput', ARRAY['objetivo','responsavel','prazo','metrica','proximo_passo'])
    ),
    (
      'playbook',
      'Separar Comercial 1 e Comercial 2',
      'O agente de primeira compra qualifica e agenda. O agente de carteira aumenta LTV, recorrencia, indicacoes e segunda venda.',
      'Regra operacional: SDR/Comercial 1 nao deve operar carteira como prioridade principal. Customer Growth/Comercial 2 nao deve tratar cliente ativo como lead frio. Cada fluxo precisa ter cadencia, metricas e handoff proprios.',
      ARRAY['ai_sdr_comercial_1','customer_growth_comercial_2','revenue_recovery']::TEXT[],
      ARRAY['raised_hand','first_purchase_customer','recurring_customer','ex_customer']::TEXT[],
      ARRAY['comercial_1','comercial_2','ltv','recorrencia']::TEXT[],
      30,
      jsonb_build_object('handoffBoundary', 'primeira_compra_para_carteira')
    ),
    (
      'playbook',
      'Objecoes alimentam oferta, copy e treinamento',
      'Toda objecao real deve retroalimentar playbook comercial, scripts, landing pages, conteudo e proposta.',
      'Regra operacional: o agente deve registrar objeções como dado estruturado, classificar categoria, sugerir resposta e acionar melhorias nos ativos de conversao quando o padrao se repetir.',
      ARRAY['ai_closer','offer_conversion','marketing_strategist','crm_controller']::TEXT[],
      ARRAY['almost_customer','non_customer','qualified_opportunity']::TEXT[],
      ARRAY['objecoes','copy','oferta','proposta']::TEXT[],
      40,
      jsonb_build_object('feedbackLoop', ARRAY['crm','script','landing_page','conteudo','proposta'])
    ),
    (
      'rubric',
      'SPIN antes de pitch',
      'Conversas de venda devem diagnosticar situacao, problema, implicacao e necessidade antes de apresentar solucao.',
      'Rubrica: a resposta do agente falha se pular direto para pitch quando faltam dados de contexto, problema, consequencia ou proximo passo. A saida deve conter pergunta diagnostica ou encaminhamento claro.',
      ARRAY['ai_sdr_comercial_1','ai_closer','growth_strategist']::TEXT[],
      ARRAY['lead_warm','raised_hand','qualified_opportunity']::TEXT[],
      ARRAY['spin','diagnostico','qualificacao']::TEXT[],
      50,
      jsonb_build_object('verification', ARRAY['situacao','problema','implicacao','necessidade','proximo_passo'])
    )
)
INSERT INTO public.yux_strategy_pack_items (
  pack_id,
  item_type,
  title,
  summary,
  body,
  profile_keys,
  stage_tags,
  retrieval_tags,
  status,
  priority,
  payload
)
SELECT
  pack.id,
  seed_items.item_type,
  seed_items.title,
  seed_items.summary,
  seed_items.body,
  seed_items.profile_keys,
  seed_items.stage_tags,
  seed_items.retrieval_tags,
  'approved',
  seed_items.priority,
  seed_items.payload
FROM pack
CROSS JOIN seed_items
WHERE NOT EXISTS (
  SELECT 1
  FROM public.yux_strategy_pack_items existing
  WHERE existing.pack_id = pack.id
    AND existing.title = seed_items.title
);

INSERT INTO public.yux_strategy_pack_bindings (
  id,
  pack_id,
  organization_id,
  profile_key,
  module_key,
  channel,
  workflow_key,
  status,
  priority,
  config
)
SELECT
  '990e8400-e29b-41d4-a716-44665544a001',
  p.id,
  '650e8400-e29b-41d4-a716-446655440001',
  NULL,
  NULL,
  NULL,
  NULL,
  'active',
  1,
  jsonb_build_object('scope','workspace_default','workspace','crescimento_yux')
FROM public.yux_strategy_packs p
WHERE p.pack_key = 'blackbook_yux_growth_doctrine'
ON CONFLICT (id) DO UPDATE SET
  pack_id = EXCLUDED.pack_id,
  organization_id = EXCLUDED.organization_id,
  profile_key = EXCLUDED.profile_key,
  module_key = EXCLUDED.module_key,
  channel = EXCLUDED.channel,
  workflow_key = EXCLUDED.workflow_key,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  config = EXCLUDED.config,
  updated_at = NOW();
