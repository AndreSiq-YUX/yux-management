CREATE TABLE IF NOT EXISTS public.radar_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL CHECK (BTRIM(source_key) <> ''),
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry','future_paid_api')),
  display_name TEXT NOT NULL CHECK (BTRIM(display_name) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  requires_secret BOOLEAN NOT NULL DEFAULT FALSE,
  terms_notes TEXT,
  default_cost_per_unit NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (default_cost_per_unit >= 0),
  rate_limit_per_day INTEGER NOT NULL DEFAULT 50 CHECK (rate_limit_per_day > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.radar_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  campaign_type TEXT NOT NULL DEFAULT 'local_niche' CHECK (campaign_type IN ('local_niche')),
  target_segment TEXT NOT NULL CHECK (BTRIM(target_segment) <> ''),
  target_city TEXT NOT NULL CHECK (BTRIM(target_city) <> ''),
  target_state TEXT NOT NULL CHECK (BTRIM(target_state) <> ''),
  target_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  target_cnaes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  offer_type TEXT NOT NULL CHECK (BTRIM(offer_type) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','archived')),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  budget_limit NUMERIC(12,2) CHECK (budget_limit IS NULL OR budget_limit >= 0),
  daily_limit INTEGER NOT NULL DEFAULT 10 CHECK (daily_limit > 0),
  automation_level TEXT NOT NULL DEFAULT 'human_review_required' CHECK (automation_level IN ('human_review_required')),
  strategy_profile_key TEXT NOT NULL DEFAULT 'ai_sdr_comercial_1',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_company_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cnpj TEXT,
  legal_name TEXT,
  trade_name TEXT,
  cnae_main TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  phone_raw TEXT,
  email_raw TEXT,
  website_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  source_collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key TEXT NOT NULL CHECK (BTRIM(dedupe_key) <> ''),
  dedupe_status TEXT NOT NULL DEFAULT 'unique' CHECK (dedupe_status IN ('unique','possible_duplicate','duplicate')),
  record_status TEXT NOT NULL DEFAULT 'active' CHECK (record_status IN ('active','duplicate_review','merged','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS public.radar_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw','enriching','enriched','diagnosing','diagnosed','message_drafted','review_pending','approved','rejected','discarded','opted_out','converted')),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  latest_score_id UUID,
  latest_diagnostic_id UUID,
  latest_message_suggestion_id UUID,
  converted_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, company_record_id)
);

CREATE TABLE IF NOT EXISTS public.radar_duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  duplicate_company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('cnpj','domain','phone','name_city','manual')),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed','merged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (company_record_id <> duplicate_company_record_id)
);

CREATE TABLE IF NOT EXISTS public.radar_enrichment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.radar_data_sources(id) ON DELETE SET NULL,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed')),
  provider TEXT NOT NULL CHECK (provider IN ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry')),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_company_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  website_url TEXT,
  instagram_url TEXT,
  linkedin_url TEXT,
  facebook_url TEXT,
  google_business_url TEXT,
  whatsapp TEXT,
  public_email TEXT,
  public_phone TEXT,
  has_site BOOLEAN NOT NULL DEFAULT FALSE,
  has_form BOOLEAN NOT NULL DEFAULT FALSE,
  has_whatsapp_cta BOOLEAN NOT NULL DEFAULT FALSE,
  has_booking BOOLEAN NOT NULL DEFAULT FALSE,
  has_meta_pixel BOOLEAN NOT NULL DEFAULT FALSE,
  has_google_tag BOOLEAN NOT NULL DEFAULT FALSE,
  review_rating NUMERIC(3,2) CHECK (review_rating IS NULL OR review_rating BETWEEN 0 AND 5),
  review_count INTEGER CHECK (review_count IS NULL OR review_count >= 0),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id)
);

CREATE TABLE IF NOT EXISTS public.radar_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  summary TEXT NOT NULL CHECK (BTRIM(summary) <> ''),
  detected_services TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  detected_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  pain_hypotheses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  recommended_offer TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence_json) = 'array'),
  risk_flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  strategy_profile_key TEXT NOT NULL DEFAULT 'ai_sdr_comercial_1',
  retrieval_query_id UUID REFERENCES public.yux_strategy_retrieval_queries(id) ON DELETE SET NULL,
  ai_model TEXT,
  ai_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (ai_cost_estimate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  timing_score INTEGER NOT NULL CHECK (timing_score BETWEEN 0 AND 100),
  pain_score INTEGER NOT NULL CHECK (pain_score BETWEEN 0 AND 100),
  contactability_score INTEGER NOT NULL CHECK (contactability_score BETWEEN 0 AND 100),
  budget_score INTEGER NOT NULL CHECK (budget_score BETWEEN 0 AND 100),
  personalization_score INTEGER NOT NULL CHECK (personalization_score BETWEEN 0 AND 100),
  explanation TEXT NOT NULL CHECK (BTRIM(explanation) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_message_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID NOT NULL REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','linkedin','phone','whatsapp_manual','task')),
  subject TEXT,
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  personalization_notes TEXT,
  evidence_used JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(evidence_used) = 'array'),
  policy_decision JSONB NOT NULL DEFAULT '{"status":"requires_human_approval","canSendAutomatically":false,"canConvertToLead":true,"blockedReasons":[],"requiredReviewFields":["message","evidence","risk_flags"]}'::JSONB CHECK (jsonb_typeof(policy_decision) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','converted')),
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  channel TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('company_added','company_enriched','diagnostic_generated','score_generated','message_generated','message_approved','message_rejected','opportunity_approved','opportunity_rejected','opt_out_registered','converted_to_lead','manual_note_added')),
  event_status TEXT NOT NULL DEFAULT 'succeeded',
  message_id UUID REFERENCES public.radar_message_suggestions(id) ON DELETE SET NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  data_source TEXT NOT NULL,
  legal_basis TEXT NOT NULL DEFAULT 'legitimate_interest_b2b_public_data',
  data_categories TEXT[] NOT NULL DEFAULT ARRAY['business_public_contact']::TEXT[],
  purpose TEXT NOT NULL DEFAULT 'commercial_prospecting_review',
  opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  opt_out_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.radar_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.radar_data_sources(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1 CHECK (units > 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  provider TEXT,
  agent_execution_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.radar_opportunities
  ADD CONSTRAINT radar_opportunities_latest_score_fk
  FOREIGN KEY (latest_score_id) REFERENCES public.radar_scores(id) ON DELETE SET NULL;

ALTER TABLE public.radar_opportunities
  ADD CONSTRAINT radar_opportunities_latest_diagnostic_fk
  FOREIGN KEY (latest_diagnostic_id) REFERENCES public.radar_diagnostics(id) ON DELETE SET NULL;

ALTER TABLE public.radar_opportunities
  ADD CONSTRAINT radar_opportunities_latest_message_fk
  FOREIGN KEY (latest_message_suggestion_id) REFERENCES public.radar_message_suggestions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_radar_data_sources_org_enabled ON public.radar_data_sources(organization_id, enabled, source_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_data_sources_global_source_key ON public.radar_data_sources(source_key) WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_radar_campaigns_org_status ON public.radar_campaigns(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_company_records_org_dedupe ON public.radar_company_records(organization_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_radar_duplicate_candidates_org_status ON public.radar_duplicate_candidates(organization_id, status, confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_radar_enrichment_runs_opportunity ON public.radar_enrichment_runs(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_company_enrichment_opportunity ON public.radar_company_enrichment(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_radar_diagnostics_opportunity ON public.radar_diagnostics(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_scores_opportunity ON public.radar_scores(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_messages_opportunity ON public.radar_message_suggestions(opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_opportunities_campaign_status ON public.radar_opportunities(campaign_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_opportunities_org_status ON public.radar_opportunities(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_events_opportunity ON public.radar_outreach_events(opportunity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_radar_compliance_opportunity ON public.radar_compliance_logs(opportunity_id, opt_out);
CREATE INDEX IF NOT EXISTS idx_radar_cost_logs_campaign ON public.radar_cost_logs(campaign_id, created_at DESC);

INSERT INTO public.radar_data_sources (
  source_key, source_type, display_name, enabled, is_paid, requires_secret, terms_notes, rate_limit_per_day
)
VALUES
  ('manual', 'manual', 'Cadastro manual', TRUE, FALSE, FALSE, 'Entrada manual por operador YUX.', 1000),
  ('csv', 'csv', 'Importacao CSV', TRUE, FALSE, FALSE, 'Importacao operacional revisada por humano.', 1000),
  ('jina_reader', 'jina_reader', 'Jina Reader', FALSE, FALSE, FALSE, 'Leitura publica provider-neutral; habilitar somente com revisao de termos.', 50),
  ('jina_search', 'jina_search', 'Jina Search', FALSE, FALSE, FALSE, 'Busca publica provider-neutral; habilitar somente com revisao de termos.', 50),
  ('web_search', 'web_search', 'Busca web', FALSE, FALSE, TRUE, 'Reservado para provedor configurado.', 50),
  ('opencnpj', 'opencnpj', 'OpenCNPJ', FALSE, FALSE, FALSE, 'Reservado para enriquecimento cadastral publico.', 50),
  ('public_registry', 'public_registry', 'Cadastro publico', FALSE, FALSE, FALSE, 'Reservado para fontes publicas futuras.', 50)
ON CONFLICT DO NOTHING;
