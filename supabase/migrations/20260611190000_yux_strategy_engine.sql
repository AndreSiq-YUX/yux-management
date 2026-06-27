-- YUX Strategy Engine foundation: shared commercial doctrine, strategy
-- profiles, action policies, commercial stage taxonomy and conversation role
-- ownership for cross-module AI agents.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.yux_strategy_doctrines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctrine_key TEXT NOT NULL UNIQUE CHECK (BTRIM(doctrine_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  rules JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(rules) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctrine_id UUID REFERENCES public.yux_strategy_doctrines(id) ON DELETE SET NULL,
  skill_key TEXT NOT NULL UNIQUE CHECK (BTRIM(skill_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  priority INTEGER NOT NULL DEFAULT 100,
  global_rules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  decision_rules JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(decision_rules) = 'array'),
  output_contract JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_contract) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_skill_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.yux_strategy_skills(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL CHECK (BTRIM(section_key) <> ''),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  body TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, section_key)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE CHECK (BTRIM(profile_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  purpose TEXT NOT NULL DEFAULT '',
  allowed_modules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  forbidden_actions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_approval_for TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  default_context_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_context_policy) = 'object'),
  approval_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(approval_policy) = 'object'),
  output_schema JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_schema) = 'object'),
  max_context_chars INTEGER NOT NULL DEFAULT 5000 CHECK (max_context_chars > 0),
  max_cards INTEGER NOT NULL DEFAULT 8 CHECK (max_cards >= 0),
  max_chunks INTEGER NOT NULL DEFAULT 4 CHECK (max_chunks >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_profile_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.yux_strategy_skills(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  context_weight NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (context_weight >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL CHECK (binding_type IN ('marketing_agent_type', 'marketing_agent', 'ai_assistant', 'workflow', 'system')),
  marketing_agent_type TEXT,
  marketing_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  ai_assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  workflow_key TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (binding_type = 'marketing_agent_type' AND marketing_agent_type IS NOT NULL AND marketing_agent_id IS NULL AND ai_assistant_id IS NULL)
    OR (binding_type = 'marketing_agent' AND marketing_agent_id IS NOT NULL)
    OR (binding_type = 'ai_assistant' AND ai_assistant_id IS NOT NULL)
    OR (binding_type = 'workflow' AND workflow_key IS NOT NULL)
    OR (binding_type = 'system')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_yux_strategy_bindings_marketing_type
  ON public.yux_strategy_agent_bindings(profile_id, marketing_agent_type)
  WHERE binding_type = 'marketing_agent_type' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_yux_strategy_bindings_marketing_agent
  ON public.yux_strategy_agent_bindings(profile_id, marketing_agent_id)
  WHERE binding_type = 'marketing_agent' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_yux_strategy_bindings_ai_assistant
  ON public.yux_strategy_agent_bindings(profile_id, ai_assistant_id)
  WHERE binding_type = 'ai_assistant' AND status = 'active';

CREATE TABLE IF NOT EXISTS public.yux_strategy_profile_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL CHECK (BTRIM(tool_key) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requires_human_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_calls_per_run INTEGER NOT NULL DEFAULT 1 CHECK (max_calls_per_run >= 0),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, tool_key)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_profile_action_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL CHECK (BTRIM(action_key) <> ''),
  policy TEXT NOT NULL CHECK (policy IN ('allow', 'require_approval', 'deny')),
  reason TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, action_key)
);

CREATE TABLE IF NOT EXISTS public.yux_commercial_stage_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key TEXT NOT NULL UNIQUE CHECK (BTRIM(stage_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  stage_group TEXT NOT NULL CHECK (stage_group IN ('audience', 'lead', 'opportunity', 'customer', 'recovery', 'excluded')),
  default_temperature TEXT CHECK (default_temperature IS NULL OR default_temperature IN ('cold', 'warm', 'hot', 'unknown')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_contact_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.omnichannel_contacts(id) ON DELETE SET NULL,
  previous_stage TEXT,
  new_stage TEXT NOT NULL CHECK (BTRIM(new_stage) <> ''),
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'crm', 'omnichannel', 'campaign', 'proposal', 'import')),
  source_record_id UUID,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS commercial_stage TEXT,
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold','warm','hot','unknown')),
  ADD COLUMN IF NOT EXISTS source_channel TEXT,
  ADD COLUMN IF NOT EXISTS last_meaningful_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_human_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_ai_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_best_action TEXT,
  ADD COLUMN IF NOT EXISTS main_objection TEXT,
  ADD COLUMN IF NOT EXISTS fit_status TEXT CHECK (fit_status IS NULL OR fit_status IN ('good_fit','unclear','bad_fit')),
  ADD COLUMN IF NOT EXISTS handoff_status TEXT CHECK (handoff_status IS NULL OR handoff_status IN ('none','suggested','pending','completed','rejected')),
  ADD COLUMN IF NOT EXISTS customer_lifecycle_stage TEXT;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS conversation_current_role TEXT CHECK (conversation_current_role IS NULL OR conversation_current_role IN ('sdr','closer','support','retention','custom')),
  ADD COLUMN IF NOT EXISTS conversation_current_strategy_profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_stage TEXT,
  ADD COLUMN IF NOT EXISTS last_handoff_id UUID,
  ADD COLUMN IF NOT EXISTS role_locked_until TIMESTAMPTZ;

ALTER TABLE public.ai_assistants
  ADD COLUMN IF NOT EXISTS assistant_role TEXT CHECK (assistant_role IS NULL OR assistant_role IN ('sdr','closer','support','retention','custom')),
  ADD COLUMN IF NOT EXISTS strategy_profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routing_priority INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS routing_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(routing_metadata) = 'object');

CREATE TABLE IF NOT EXISTS public.ai_assistant_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  channel TEXT CHECK (channel IS NULL OR channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  required_role TEXT CHECK (required_role IS NULL OR required_role IN ('sdr','closer','support','retention','custom')),
  stage_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  intent_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  keyword_patterns TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  default_rule BOOLEAN NOT NULL DEFAULT FALSE,
  score_weight INTEGER NOT NULL DEFAULT 10 CHECK (score_weight >= 0),
  lock_role_minutes INTEGER NOT NULL DEFAULT 0 CHECK (lock_role_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  doctrine_id UUID REFERENCES public.yux_strategy_doctrines(id) ON DELETE SET NULL,
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'docx', 'html', 'markdown', 'text', 'url', 'manual')),
  source_title TEXT NOT NULL CHECK (BTRIM(source_title) <> ''),
  source_hash TEXT NOT NULL CHECK (BTRIM(source_hash) <> ''),
  original_filename TEXT,
  storage_path TEXT,
  page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0),
  language TEXT NOT NULL DEFAULT 'pt-BR',
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.yux_strategy_source_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  page_hash TEXT NOT NULL CHECK (BTRIM(page_hash) <> ''),
  ocr_text TEXT,
  clean_text TEXT,
  image_storage_path TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, page_number),
  UNIQUE (page_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.yux_strategy_source_documents(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.yux_strategy_source_pages(id) ON DELETE SET NULL,
  section_key TEXT NOT NULL DEFAULT 'section',
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_hash TEXT NOT NULL CHECK (BTRIM(chunk_hash) <> ''),
  chunk_text TEXT NOT NULL CHECK (BTRIM(chunk_text) <> ''),
  token_estimate INTEGER NOT NULL DEFAULT 0 CHECK (token_estimate >= 0),
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.yux_strategy_source_documents(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.yux_strategy_source_pages(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('page_image', 'diagram', 'table', 'chart', 'screenshot', 'other')),
  asset_hash TEXT NOT NULL CHECK (BTRIM(asset_hash) <> ''),
  storage_path TEXT NOT NULL CHECK (BTRIM(storage_path) <> ''),
  mime_type TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_concept_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctrine_id UUID REFERENCES public.yux_strategy_doctrines(id) ON DELETE SET NULL,
  source_document_id UUID REFERENCES public.yux_strategy_source_documents(id) ON DELETE SET NULL,
  source_chunk_id UUID REFERENCES public.yux_strategy_source_chunks(id) ON DELETE SET NULL,
  concept TEXT NOT NULL CHECK (BTRIM(concept) <> ''),
  category TEXT NOT NULL CHECK (BTRIM(category) <> ''),
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  problem_solved TEXT NOT NULL DEFAULT '',
  trigger_signals TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  diagnosis_questions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  decision_rules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  anti_patterns TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  recommended_actions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  yux_modules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (concept, category)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_card_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.yux_strategy_concept_cards(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL CHECK (BTRIM(embedding_model) <> ''),
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding extensions.vector(1536),
  embedding_values JSONB CHECK (embedding_values IS NULL OR jsonb_typeof(embedding_values) = 'array'),
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, embedding_model, content_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES public.yux_strategy_source_chunks(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL CHECK (BTRIM(embedding_model) <> ''),
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding extensions.vector(1536),
  embedding_values JSONB CHECK (embedding_values IS NULL OR jsonb_typeof(embedding_values) = 'array'),
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chunk_id, embedding_model, content_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_asset_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.yux_strategy_source_assets(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL CHECK (BTRIM(embedding_model) <> ''),
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding extensions.vector(1536),
  embedding_values JSONB CHECK (embedding_values IS NULL OR jsonb_typeof(embedding_values) = 'array'),
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, embedding_model, content_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_retrieval_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL CHECK (BTRIM(profile_key) <> ''),
  query TEXT NOT NULL CHECK (BTRIM(query) <> ''),
  intent TEXT,
  stage TEXT,
  include_images BOOLEAN NOT NULL DEFAULT FALSE,
  portal_safe BOOLEAN NOT NULL DEFAULT FALSE,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(filters) = 'object'),
  result_card_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  result_chunk_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  result_asset_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  score_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(score_metadata) = 'object'),
  context_chars INTEGER NOT NULL DEFAULT 0 CHECK (context_chars >= 0),
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'empty', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_cash_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end DATE,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_margin NUMERIC(8,4),
  marketing_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  sales_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  operational_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  new_customers INTEGER NOT NULL DEFAULT 0 CHECK (new_customers >= 0),
  average_ticket NUMERIC(14,2) NOT NULL DEFAULT 0,
  ltv NUMERIC(14,2) NOT NULL DEFAULT 0,
  cac NUMERIC(14,2),
  roas NUMERIC(14,4),
  mroi NUMERIC(14,4),
  cash_priority TEXT NOT NULL DEFAULT 'monitor' CHECK (cash_priority IN ('low','monitor','high_priority','critical')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_funnel_stage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entered_count INTEGER NOT NULL DEFAULT 0 CHECK (entered_count >= 0),
  converted_count INTEGER NOT NULL DEFAULT 0 CHECK (converted_count >= 0),
  lost_count INTEGER NOT NULL DEFAULT 0 CHECK (lost_count >= 0),
  average_time_in_stage_hours NUMERIC(12,2),
  follow_up_response_rate NUMERIC(8,4),
  conversion_rate NUMERIC(8,4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_channel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  raised_hands INTEGER NOT NULL DEFAULT 0 CHECK (raised_hands >= 0),
  customers INTEGER NOT NULL DEFAULT 0 CHECK (customers >= 0),
  roas NUMERIC(14,4),
  mroi NUMERIC(14,4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_recovery_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('inactive_customer','lost_proposal','non_customer','ex_customer','stuck_opportunity')),
  stage_key TEXT,
  inactive_days INTEGER CHECK (inactive_days IS NULL OR inactive_days >= 0),
  average_ticket NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_recovery_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  recoverable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'monitor' CHECK (priority IN ('low','monitor','high_priority','critical')),
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','recovered','dismissed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_objection_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_playbook_action TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_objection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.yux_objection_categories(id) ON DELETE SET NULL,
  category_key TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  normalized_text TEXT NOT NULL DEFAULT '',
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  assistant_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  recommendation_id UUID,
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative','unknown')),
  source_channel TEXT,
  requires_follow_up BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_objection_playbook_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.yux_objection_categories(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  title TEXT NOT NULL,
  recommended_response TEXT NOT NULL DEFAULT '',
  recommended_action TEXT NOT NULL DEFAULT '',
  target_profiles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  visibility TEXT NOT NULL DEFAULT 'internal_only' CHECK (visibility IN ('internal_only','client_safe')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_offer_improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  repeated_count INTEGER NOT NULL DEFAULT 1 CHECK (repeated_count > 0),
  suggestion TEXT NOT NULL,
  target_surface TEXT NOT NULL DEFAULT 'offer' CHECK (target_surface IN ('offer','landing_page','proposal','script','content','campaign')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','implemented')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source_profile_key TEXT NOT NULL,
  target_profile_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_output TEXT NOT NULL DEFAULT '',
  related_module TEXT,
  related_record_id UUID,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','critical')),
  context_summary TEXT NOT NULL DEFAULT '',
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','rejected','cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  objective TEXT NOT NULL,
  audience TEXT NOT NULL,
  stage TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT NOT NULL,
  owner TEXT NOT NULL,
  metric TEXT NOT NULL,
  next_step TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  supporting_cards UUID[] NOT NULL DEFAULT '{}'::UUID[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','in_progress','completed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_outcome_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  recommendation_id UUID REFERENCES public.yux_strategy_agent_recommendations(id) ON DELETE SET NULL,
  handoff_id UUID REFERENCES public.yux_strategy_agent_handoffs(id) ON DELETE SET NULL,
  agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  ai_message_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  outcome_score NUMERIC(8,4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  skill_key TEXT,
  card_id UUID REFERENCES public.yux_strategy_concept_cards(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  commercial_stage TEXT,
  outcome_type TEXT NOT NULL,
  outcome_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  confidence_before NUMERIC(5,4),
  human_feedback TEXT,
  aggregation_window TEXT NOT NULL DEFAULT 'daily',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_doctrines_status ON public.yux_strategy_doctrines(status, visibility);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_skills_status ON public.yux_strategy_skills(status, visibility);
CREATE INDEX IF NOT EXISTS idx_yux_skill_sections_skill_priority ON public.yux_strategy_skill_sections(skill_id, priority);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_profiles_key_status ON public.yux_strategy_agent_profiles(profile_key, status);
CREATE INDEX IF NOT EXISTS idx_yux_profile_skills_profile_priority ON public.yux_strategy_agent_profile_skills(profile_id, priority);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_bindings_type_status ON public.yux_strategy_agent_bindings(binding_type, status);
CREATE INDEX IF NOT EXISTS idx_yux_tool_policies_profile ON public.yux_strategy_profile_tool_policies(profile_id, tool_key);
CREATE INDEX IF NOT EXISTS idx_yux_action_policies_profile ON public.yux_strategy_profile_action_policies(profile_id, action_key);
CREATE INDEX IF NOT EXISTS idx_yux_stage_definitions_group_order ON public.yux_commercial_stage_definitions(stage_group, sort_order);
CREATE INDEX IF NOT EXISTS idx_yux_stage_events_org_lead_created ON public.yux_contact_stage_events(organization_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_commercial_stage ON public.leads(organization_id, commercial_stage);
CREATE INDEX IF NOT EXISTS idx_leads_touch_next_action ON public.leads(organization_id, last_meaningful_touch_at, next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_conversations_strategy_role ON public.conversations(organization_id, conversation_current_role, conversation_stage);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_strategy_role ON public.ai_assistants(organization_id, assistant_role, status, routing_priority);
CREATE INDEX IF NOT EXISTS idx_ai_routing_rules_assistant_status ON public.ai_assistant_routing_rules(assistant_id, status);
CREATE INDEX IF NOT EXISTS idx_yux_source_documents_scope_visibility ON public.yux_strategy_source_documents(source_scope, visibility, human_review_status);
CREATE INDEX IF NOT EXISTS idx_yux_source_documents_org_contract ON public.yux_strategy_source_documents(organization_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_yux_source_pages_document_page ON public.yux_strategy_source_pages(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_document_section ON public.yux_strategy_source_chunks(document_id, section_key, chunk_index);
CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_tags ON public.yux_strategy_source_chunks USING gin(retrieval_tags);
CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_stage_tags ON public.yux_strategy_source_chunks USING gin(stage_tags);
CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_profiles ON public.yux_strategy_source_chunks USING gin(allowed_agent_profile_keys);
CREATE INDEX IF NOT EXISTS idx_yux_source_assets_document_type ON public.yux_strategy_source_assets(document_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_yux_source_assets_profiles ON public.yux_strategy_source_assets USING gin(allowed_agent_profile_keys);
CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_category_visibility ON public.yux_strategy_concept_cards(category, visibility, human_review_status);
CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_tags ON public.yux_strategy_concept_cards USING gin(retrieval_tags);
CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_stage_tags ON public.yux_strategy_concept_cards USING gin(stage_tags);
CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_profiles ON public.yux_strategy_concept_cards USING gin(allowed_agent_profile_keys);
CREATE INDEX IF NOT EXISTS idx_yux_card_embeddings_card_model ON public.yux_strategy_card_embeddings(card_id, embedding_model);
CREATE INDEX IF NOT EXISTS idx_yux_chunk_embeddings_chunk_model ON public.yux_strategy_chunk_embeddings(chunk_id, embedding_model);
CREATE INDEX IF NOT EXISTS idx_yux_asset_embeddings_asset_model ON public.yux_strategy_asset_embeddings(asset_id, embedding_model);
CREATE INDEX IF NOT EXISTS idx_yux_retrieval_queries_profile_created ON public.yux_strategy_retrieval_queries(profile_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_retrieval_queries_org_created ON public.yux_strategy_retrieval_queries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_card_embeddings_vector ON public.yux_strategy_card_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yux_chunk_embeddings_vector ON public.yux_strategy_chunk_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yux_asset_embeddings_vector ON public.yux_strategy_asset_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yux_metrics_cash_org_date ON public.yux_metrics_cash_snapshots(organization_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_yux_metrics_funnel_org_stage ON public.yux_metrics_funnel_stage_snapshots(organization_id, stage_key, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_yux_metrics_channel_org_channel ON public.yux_metrics_channel_snapshots(organization_id, channel_key, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_yux_metrics_recovery_org_status ON public.yux_metrics_recovery_opportunities(organization_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_yux_objection_events_org_category ON public.yux_objection_events(organization_id, category_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_objection_events_lead ON public.yux_objection_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_objection_playbook_category ON public.yux_objection_playbook_items(category_key, status, visibility);
CREATE INDEX IF NOT EXISTS idx_yux_offer_suggestions_org_status ON public.yux_offer_improvement_suggestions(organization_id, status, category_key);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_handoffs_target_status ON public.yux_strategy_agent_handoffs(target_profile_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_recommendations_profile_status ON public.yux_strategy_agent_recommendations(profile_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_outcomes_org_type ON public.yux_strategy_outcome_events(organization_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yux_strategy_learning_profile ON public.yux_strategy_learning_signals(profile_key, outcome_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.match_yux_strategy_concept_cards(
  query_embedding extensions.vector(1536),
  match_profile_key TEXT,
  match_stage TEXT DEFAULT NULL,
  match_portal_safe BOOLEAN DEFAULT FALSE,
  match_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  card_id UUID,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id AS card_id,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.yux_strategy_concept_cards c
  JOIN public.yux_strategy_card_embeddings e ON e.card_id = c.id
  WHERE e.embedding IS NOT NULL
    AND match_profile_key = ANY(c.allowed_agent_profile_keys)
    AND (match_stage IS NULL OR CARDINALITY(c.stage_tags) = 0 OR match_stage = ANY(c.stage_tags))
    AND (NOT match_portal_safe OR (c.visibility = 'client_safe' AND c.human_review_status = 'approved'))
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0)
$$;

CREATE OR REPLACE FUNCTION public.match_yux_strategy_source_chunks(
  query_embedding extensions.vector(1536),
  match_profile_key TEXT,
  match_stage TEXT DEFAULT NULL,
  match_portal_safe BOOLEAN DEFAULT FALSE,
  match_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  chunk_id UUID,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id AS chunk_id,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.yux_strategy_source_chunks c
  JOIN public.yux_strategy_chunk_embeddings e ON e.chunk_id = c.id
  WHERE e.embedding IS NOT NULL
    AND match_profile_key = ANY(c.allowed_agent_profile_keys)
    AND (match_stage IS NULL OR CARDINALITY(c.stage_tags) = 0 OR match_stage = ANY(c.stage_tags))
    AND (NOT match_portal_safe OR (c.visibility = 'client_safe' AND c.human_review_status = 'approved'))
  ORDER BY e.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0)
$$;

CREATE TRIGGER update_yux_strategy_doctrines_updated_at BEFORE UPDATE ON public.yux_strategy_doctrines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_skills_updated_at BEFORE UPDATE ON public.yux_strategy_skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_skill_sections_updated_at BEFORE UPDATE ON public.yux_strategy_skill_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_agent_profiles_updated_at BEFORE UPDATE ON public.yux_strategy_agent_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_agent_bindings_updated_at BEFORE UPDATE ON public.yux_strategy_agent_bindings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_profile_tool_policies_updated_at BEFORE UPDATE ON public.yux_strategy_profile_tool_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_profile_action_policies_updated_at BEFORE UPDATE ON public.yux_strategy_profile_action_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_commercial_stage_definitions_updated_at BEFORE UPDATE ON public.yux_commercial_stage_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ai_assistant_routing_rules_updated_at BEFORE UPDATE ON public.ai_assistant_routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_source_documents_updated_at BEFORE UPDATE ON public.yux_strategy_source_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_source_pages_updated_at BEFORE UPDATE ON public.yux_strategy_source_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_source_chunks_updated_at BEFORE UPDATE ON public.yux_strategy_source_chunks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_source_assets_updated_at BEFORE UPDATE ON public.yux_strategy_source_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_concept_cards_updated_at BEFORE UPDATE ON public.yux_strategy_concept_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_metrics_cash_snapshots_updated_at BEFORE UPDATE ON public.yux_metrics_cash_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_metrics_recovery_opportunities_updated_at BEFORE UPDATE ON public.yux_metrics_recovery_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_objection_categories_updated_at BEFORE UPDATE ON public.yux_objection_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_objection_playbook_items_updated_at BEFORE UPDATE ON public.yux_objection_playbook_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_offer_suggestions_updated_at BEFORE UPDATE ON public.yux_offer_improvement_suggestions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_handoffs_updated_at BEFORE UPDATE ON public.yux_strategy_agent_handoffs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_yux_strategy_recommendations_updated_at BEFORE UPDATE ON public.yux_strategy_agent_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.yux_strategy_doctrines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_skill_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_agent_profile_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_agent_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_profile_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_profile_action_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_commercial_stage_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_contact_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_concept_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_card_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_asset_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_retrieval_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_metrics_cash_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_metrics_funnel_stage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_metrics_channel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_metrics_recovery_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_objection_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_objection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_objection_playbook_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_offer_improvement_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_agent_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_agent_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_outcome_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_learning_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage strategy doctrines" ON public.yux_strategy_doctrines
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Client safe strategy doctrines are readable" ON public.yux_strategy_doctrines
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND status = 'active');

CREATE POLICY "Internal users manage strategy skills" ON public.yux_strategy_skills
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Client safe strategy skills are readable" ON public.yux_strategy_skills
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND status = 'active');

CREATE POLICY "Internal users manage strategy skill sections" ON public.yux_strategy_skill_sections
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Client safe strategy skill sections are readable" ON public.yux_strategy_skill_sections
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.yux_strategy_skills s
      WHERE s.id = skill_id
        AND s.visibility = 'client_safe'
        AND s.status = 'active'
    )
  );

CREATE POLICY "Internal users manage strategy profiles" ON public.yux_strategy_agent_profiles
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Authenticated users read active strategy profiles" ON public.yux_strategy_agent_profiles
  FOR SELECT TO authenticated USING (status = 'active');

CREATE POLICY "Internal users manage profile skills" ON public.yux_strategy_agent_profile_skills
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Authenticated users read profile skills" ON public.yux_strategy_agent_profile_skills
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.yux_strategy_agent_profiles p
      WHERE p.id = profile_id
        AND p.status = 'active'
    )
  );

CREATE POLICY "Internal users manage strategy bindings" ON public.yux_strategy_agent_bindings
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Internal users read tool policies" ON public.yux_strategy_profile_tool_policies
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Internal users manage tool policies" ON public.yux_strategy_profile_tool_policies
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Internal users read action policies" ON public.yux_strategy_profile_action_policies
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Internal users manage action policies" ON public.yux_strategy_profile_action_policies
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Authenticated users read commercial stages" ON public.yux_commercial_stage_definitions
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Internal users manage commercial stages" ON public.yux_commercial_stage_definitions
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "CRM users read contact stage events" ON public.yux_contact_stage_events
  FOR SELECT TO authenticated USING (private.can_access_crm_organization(organization_id));
CREATE POLICY "CRM users create contact stage events" ON public.yux_contact_stage_events
  FOR INSERT TO authenticated WITH CHECK (private.can_access_crm_organization(organization_id));
CREATE POLICY "Internal users manage contact stage events" ON public.yux_contact_stage_events
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Omnichannel users read assistant routing rules" ON public.ai_assistant_routing_rules
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.ai_assistants a
      WHERE a.id = assistant_id
        AND private.can_access_omnichannel_organization(a.organization_id, 'read')
    )
  );
CREATE POLICY "Omnichannel configurators manage assistant routing rules" ON public.ai_assistant_routing_rules
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

CREATE POLICY "Internal users manage strategy source documents" ON public.yux_strategy_source_documents
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Client safe strategy source documents are readable" ON public.yux_strategy_source_documents
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND human_review_status = 'approved');

CREATE POLICY "Internal users manage strategy source pages" ON public.yux_strategy_source_pages
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Client safe strategy source pages are readable" ON public.yux_strategy_source_pages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.yux_strategy_source_documents d
      WHERE d.id = document_id
        AND d.visibility = 'client_safe'
        AND d.human_review_status = 'approved'
    )
  );

CREATE POLICY "Internal users manage strategy source chunks" ON public.yux_strategy_source_chunks
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Client safe strategy source chunks are readable" ON public.yux_strategy_source_chunks
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND human_review_status = 'approved');

CREATE POLICY "Internal users manage strategy source assets" ON public.yux_strategy_source_assets
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Client safe strategy source assets are readable" ON public.yux_strategy_source_assets
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND human_review_status = 'approved');

CREATE POLICY "Internal users manage strategy concept cards" ON public.yux_strategy_concept_cards
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Client safe strategy concept cards are readable" ON public.yux_strategy_concept_cards
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND human_review_status = 'approved');

CREATE POLICY "Internal users manage strategy card embeddings" ON public.yux_strategy_card_embeddings
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage strategy chunk embeddings" ON public.yux_strategy_chunk_embeddings
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage strategy asset embeddings" ON public.yux_strategy_asset_embeddings
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "Internal users read strategy retrieval queries" ON public.yux_strategy_retrieval_queries
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages strategy retrieval queries" ON public.yux_strategy_retrieval_queries
  FOR ALL TO service_role USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Internal users manage strategy metrics cash" ON public.yux_metrics_cash_snapshots
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages strategy metrics cash" ON public.yux_metrics_cash_snapshots
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage strategy funnel metrics" ON public.yux_metrics_funnel_stage_snapshots
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages strategy funnel metrics" ON public.yux_metrics_funnel_stage_snapshots
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage strategy channel metrics" ON public.yux_metrics_channel_snapshots
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages strategy channel metrics" ON public.yux_metrics_channel_snapshots
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage recovery opportunities" ON public.yux_metrics_recovery_opportunities
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages recovery opportunities" ON public.yux_metrics_recovery_opportunities
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage objection categories" ON public.yux_objection_categories
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Authenticated users read active objection categories" ON public.yux_objection_categories
  FOR SELECT TO authenticated USING (is_active);

CREATE POLICY "Internal users manage objection events" ON public.yux_objection_events
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages objection events" ON public.yux_objection_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage objection playbooks" ON public.yux_objection_playbook_items
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Client safe objection playbooks are readable" ON public.yux_objection_playbook_items
  FOR SELECT TO authenticated USING (visibility = 'client_safe' AND status = 'active');

CREATE POLICY "Internal users manage offer improvement suggestions" ON public.yux_offer_improvement_suggestions
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages offer improvement suggestions" ON public.yux_offer_improvement_suggestions
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage strategy handoffs" ON public.yux_strategy_agent_handoffs
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages strategy handoffs" ON public.yux_strategy_agent_handoffs
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users manage strategy recommendations" ON public.yux_strategy_agent_recommendations
  FOR ALL TO authenticated USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());
CREATE POLICY "Service role manages strategy recommendations" ON public.yux_strategy_agent_recommendations
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read strategy outcomes" ON public.yux_strategy_outcome_events
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages strategy outcomes" ON public.yux_strategy_outcome_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Internal users read strategy learning signals" ON public.yux_strategy_learning_signals
  FOR SELECT TO authenticated USING (private.is_internal_user());
CREATE POLICY "Service role manages strategy learning signals" ON public.yux_strategy_learning_signals
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON public.yux_strategy_doctrines FROM anon;
REVOKE ALL ON public.yux_strategy_skills FROM anon;
REVOKE ALL ON public.yux_strategy_skill_sections FROM anon;
REVOKE ALL ON public.yux_strategy_agent_profiles FROM anon;
REVOKE ALL ON public.yux_strategy_agent_profile_skills FROM anon;
REVOKE ALL ON public.yux_strategy_agent_bindings FROM anon;
REVOKE ALL ON public.yux_strategy_profile_tool_policies FROM anon;
REVOKE ALL ON public.yux_strategy_profile_action_policies FROM anon;
REVOKE ALL ON public.yux_commercial_stage_definitions FROM anon;
REVOKE ALL ON public.yux_contact_stage_events FROM anon;
REVOKE ALL ON public.ai_assistant_routing_rules FROM anon;
REVOKE ALL ON public.yux_strategy_source_documents FROM anon;
REVOKE ALL ON public.yux_strategy_source_pages FROM anon;
REVOKE ALL ON public.yux_strategy_source_chunks FROM anon;
REVOKE ALL ON public.yux_strategy_source_assets FROM anon;
REVOKE ALL ON public.yux_strategy_concept_cards FROM anon;
REVOKE ALL ON public.yux_strategy_card_embeddings FROM anon;
REVOKE ALL ON public.yux_strategy_chunk_embeddings FROM anon;
REVOKE ALL ON public.yux_strategy_asset_embeddings FROM anon;
REVOKE ALL ON public.yux_strategy_retrieval_queries FROM anon;
REVOKE ALL ON public.yux_metrics_cash_snapshots FROM anon;
REVOKE ALL ON public.yux_metrics_funnel_stage_snapshots FROM anon;
REVOKE ALL ON public.yux_metrics_channel_snapshots FROM anon;
REVOKE ALL ON public.yux_metrics_recovery_opportunities FROM anon;
REVOKE ALL ON public.yux_objection_categories FROM anon;
REVOKE ALL ON public.yux_objection_events FROM anon;
REVOKE ALL ON public.yux_objection_playbook_items FROM anon;
REVOKE ALL ON public.yux_offer_improvement_suggestions FROM anon;
REVOKE ALL ON public.yux_strategy_agent_handoffs FROM anon;
REVOKE ALL ON public.yux_strategy_agent_recommendations FROM anon;
REVOKE ALL ON public.yux_strategy_outcome_events FROM anon;
REVOKE ALL ON public.yux_strategy_learning_signals FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_doctrines TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_skills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_skill_sections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_agent_profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_agent_profile_skills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_agent_bindings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_profile_tool_policies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_profile_action_policies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_commercial_stage_definitions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.yux_contact_stage_events TO authenticated, service_role;
GRANT UPDATE, DELETE ON public.yux_contact_stage_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_routing_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_source_documents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_source_pages TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_source_chunks TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_source_assets TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_concept_cards TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_card_embeddings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_chunk_embeddings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_asset_embeddings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_retrieval_queries TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_metrics_cash_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_metrics_funnel_stage_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_metrics_channel_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_metrics_recovery_opportunities TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_objection_categories TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_objection_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_objection_playbook_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_offer_improvement_suggestions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_agent_handoffs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_agent_recommendations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_outcome_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yux_strategy_learning_signals TO authenticated, service_role;

INSERT INTO public.yux_strategy_doctrines (
  doctrine_key,
  name,
  description,
  source_scope,
  visibility,
  status,
  rules,
  metadata
)
VALUES (
  'yux_growth_doctrine_core',
  'Doutrina YUX Growth Core',
  'Regras operacionais internas para diagnosticar gargalos comerciais, priorizar caixa e orientar agentes YUX.',
  'internal',
  'internal_only',
  'active',
  jsonb_build_array(
    'Diagnosticar antes de automatizar.',
    'Nao recomendar aquisicao fria antes de avaliar base atual, follow-up, CRM, ticket, recorrencia e oportunidades perdidas.',
    'Separar lead frio, levantada de mao, oportunidade, cliente e ex-cliente.',
    'Toda recomendacao deve ter objetivo, publico, acao, canal, responsavel, metrica e proximo passo.',
    'CRM e centro de controle comercial, nao cadastro passivo.'
  ),
  jsonb_build_object('versionLabel', 'v1')
)
ON CONFLICT (doctrine_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    rules = EXCLUDED.rules,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

WITH doctrine AS (
  SELECT id FROM public.yux_strategy_doctrines WHERE doctrine_key = 'yux_growth_doctrine_core'
)
INSERT INTO public.yux_strategy_skills (
  doctrine_id,
  skill_key,
  name,
  description,
  global_rules,
  decision_rules,
  output_contract
)
SELECT doctrine.id, skill_key, name, description, global_rules, decision_rules, output_contract
FROM doctrine
CROSS JOIN (
  VALUES
    ('yux_growth_strategy_core', 'YUX Growth Strategy Core', 'Skill central de diagnostico, priorizacao e decisao comercial.', ARRAY['priorizar caixa antes de complexidade', 'sempre classificar estagio comercial']::TEXT[], jsonb_build_array('avaliar gargalo antes de recomendar canal'), jsonb_build_object('requiresStructuredRecommendation', true)),
    ('yux_stage_classification', 'Classificacao de Estagios Comerciais', 'Classifica contatos por maturidade, oportunidade e ciclo de vida.', ARRAY['lead frio nao e oportunidade', 'levantada de mao exige acao comercial individual']::TEXT[], jsonb_build_array('usar commercial_stage e lead_temperature'), jsonb_build_object('requiresStage', true)),
    ('yux_spin_diagnosis', 'SPIN e Diagnostico Comercial', 'Orienta perguntas de situacao, problema, implicacao e necessidade.', ARRAY['perguntar antes de apresentar solucao']::TEXT[], jsonb_build_array('qualificar antes de vender'), jsonb_build_object('requiresQuestions', true)),
    ('yux_crm_controller', 'CRM Controller', 'Monitora oportunidades, follow-ups, tarefas e dados comerciais.', ARRAY['CRM precisa ter proxima acao', 'lead parado e perda potencial']::TEXT[], jsonb_build_array('criar tarefa quando nao houver proximo passo'), jsonb_build_object('requiresNextAction', true)),
    ('yux_comercial_1_sdr', 'Comercial 1 SDR', 'Qualificacao, triagem, levantada de mao e handoff.', ARRAY['SDR qualifica e agenda; nao promete entrega complexa']::TEXT[], jsonb_build_array('transferir para humano quando houver proposta ou objecao sensivel'), jsonb_build_object('requiresHandoffRules', true)),
    ('yux_comercial_2_customer_growth', 'Comercial 2 Customer Growth', 'Recorrencia, carteira, segunda venda, LTV e churn.', ARRAY['base atual vem antes de lead frio']::TEXT[], jsonb_build_array('avaliar cliente ativo, inativo e recorrente'), jsonb_build_object('requiresLifecycleStage', true)),
    ('yux_revenue_recovery', 'Revenue Recovery', 'Recuperacao de ex-clientes, nao-clientes e propostas perdidas.', ARRAY['reativar oportunidades perdidas antes de aumentar CAC']::TEXT[], jsonb_build_array('priorizar valor recuperavel'), jsonb_build_object('requiresRecoveryValue', true)),
    ('yux_offer_conversion', 'Offer And Conversion', 'Oferta, copy, landing page, proposta, objeções e conversao.', ARRAY['objecoes alimentam oferta e copy']::TEXT[], jsonb_build_array('mapear objecao para melhoria de oferta'), jsonb_build_object('requiresObjectionMap', true)),
    ('yux_objection_intelligence', 'Objection Intelligence', 'Registra e transforma objeções em playbooks, conteudos e ajustes comerciais.', ARRAY['objecao repetida vira melhoria de playbook']::TEXT[], jsonb_build_array('registrar categoria e acao recomendada'), jsonb_build_object('requiresObjectionCategory', true)),
    ('yux_marketing_by_funnel_stage', 'Marketing Por Estagio Do Funil', 'Cria conteudo e campanha por publico, consciencia e etapa comercial.', ARRAY['conteudo tem funcao comercial']::TEXT[], jsonb_build_array('alinhar canal e etapa'), jsonb_build_object('requiresFunnelStage', true)),
    ('yux_referral_growth', 'Referral Growth', 'Indicações, prova social e crescimento por clientes promotores.', ARRAY['pedir indicacao no momento correto']::TEXT[], jsonb_build_array('verificar satisfacao antes do pedido'), jsonb_build_object('requiresSatisfactionSignal', true)),
    ('yux_metrics_cash_mroi', 'Metrics Cash And MROI', 'CAC, ticket, LTV, MROI, margem e decisao de investimento.', ARRAY['avaliar lucro e caixa, nao apenas lead']::TEXT[], jsonb_build_array('comparar CAC, ticket, margem e LTV'), jsonb_build_object('requiresFinancialMetric', true)),
    ('yux_proposal_delivery_strategy', 'Proposal And Delivery Strategy', 'Proposta, escopo, implementacao e transicao para entrega.', ARRAY['proposta deve conectar diagnostico, acao e resultado esperado']::TEXT[], jsonb_build_array('explicitar escopo e proximo passo'), jsonb_build_object('requiresProposalNextStep', true))
) AS seed(skill_key, name, description, global_rules, decision_rules, output_contract)
ON CONFLICT (skill_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    global_rules = EXCLUDED.global_rules,
    decision_rules = EXCLUDED.decision_rules,
    output_contract = EXCLUDED.output_contract,
    updated_at = NOW();

INSERT INTO public.yux_strategy_agent_profiles (
  profile_key,
  name,
  description,
  purpose,
  allowed_modules,
  allowed_tools,
  forbidden_actions,
  requires_human_approval_for,
  default_context_policy,
  approval_policy,
  output_schema,
  max_context_chars,
  max_cards,
  max_chunks
)
VALUES
  ('growth_strategist', 'Growth Strategist', 'Diagnostico, priorizacao e roadmap comercial YUX.', 'Analisar gargalos e recomendar sequencia de implantacao.', ARRAY['crm','omnichannel','marketing_studio','campaigns','landing_pages','reports','automations','proposals']::TEXT[], ARRAY['strategy_retrieval','crm_read','metrics_read','recommendation_create']::TEXT[], ARRAY['send_external_message','activate_campaign','change_ads_budget']::TEXT[], ARRAY['client_visible_recommendation','proposal_scope_change']::TEXT[], jsonb_build_object('breadth','broad','includeMetrics',true), jsonb_build_object('humanRequired',true), jsonb_build_object('required', ARRAY['objective','audience','stage','action','channel','owner','metric','next_step']::TEXT[]), 9000, 12, 8),
  ('crm_controller', 'CRM Controller', 'Controle operacional de pipeline, follow-up e disciplina comercial.', 'Detectar leads parados, falta de proxima acao e inconsistencias de etapa.', ARRAY['crm','omnichannel','proposals','reports','automations']::TEXT[], ARRAY['strategy_retrieval','crm_read','task_create','recommendation_create']::TEXT[], ARRAY['activate_campaign','publish_content','promise_discount']::TEXT[], ARRAY['send_message','change_stage']::TEXT[], jsonb_build_object('breadth','focused','includeCrm',true), jsonb_build_object('humanRequiredForExternalMessage',true), jsonb_build_object('required', ARRAY['lead_id','action','owner','due_at','metric']::TEXT[]), 6500, 8, 4),
  ('ai_sdr_comercial_1', 'AI SDR / Comercial 1', 'Qualificacao, SPIN, levantada de mao e handoff.', 'Atender e qualificar leads sem tratar lead frio como oportunidade.', ARRAY['omnichannel','crm']::TEXT[], ARRAY['strategy_retrieval','conversation_read','crm_update_suggestion','handoff_create']::TEXT[], ARRAY['activate_campaign','promise_discount','send_contractual_commitment']::TEXT[], ARRAY['send_external_message','handoff_to_human']::TEXT[], jsonb_build_object('breadth','narrow','includeSpin',true), jsonb_build_object('humanRequiredForSensitive',true), jsonb_build_object('required', ARRAY['question','stage','next_step','handoff_required']::TEXT[]), 4500, 6, 3),
  ('ai_closer', 'AI Closer', 'Follow-up de proposta e tratamento de objecoes comerciais.', 'Ajudar fechamento sem prometer desconto ou alterar termos sem aprovacao.', ARRAY['omnichannel','crm','proposals']::TEXT[], ARRAY['strategy_retrieval','conversation_read','proposal_read','objection_create','handoff_create']::TEXT[], ARRAY['promise_discount_without_approved_offer','change_proposal_terms_without_approval','activate_campaign']::TEXT[], ARRAY['send_external_message','proposal_term_change']::TEXT[], jsonb_build_object('breadth','focused','includeObjections',true), jsonb_build_object('humanRequiredForDiscount',true), jsonb_build_object('required', ARRAY['objection','response_angle','next_step','approval_needed']::TEXT[]), 5500, 7, 4),
  ('support_assistant', 'Support Assistant', 'Atendimento receptivo, suporte e triagem.', 'Resolver duvidas e encaminhar suporte sem pressao comercial indevida.', ARRAY['omnichannel','support','knowledge_base']::TEXT[], ARRAY['knowledge_search','conversation_read','ticket_create','handoff_create']::TEXT[], ARRAY['send_sales_pressure_message','promise_discount','activate_campaign']::TEXT[], ARRAY['upsell_message','sensitive_support_answer']::TEXT[], jsonb_build_object('breadth','support','excludeSalesPressure',true), jsonb_build_object('humanRequiredForSensitive',true), jsonb_build_object('required', ARRAY['answer','ticket_needed','handoff_required']::TEXT[]), 4000, 4, 4),
  ('customer_growth_comercial_2', 'Comercial 2 / Customer Growth', 'Carteira, recorrencia, upsell, churn e LTV.', 'Expandir valor de clientes atuais e reduzir perda pos-venda.', ARRAY['crm','omnichannel','reports','automations','finance']::TEXT[], ARRAY['strategy_retrieval','crm_read','metrics_read','recommendation_create']::TEXT[], ARRAY['activate_campaign','change_financial_record']::TEXT[], ARRAY['upsell_message','reactivation_message']::TEXT[], jsonb_build_object('breadth','lifecycle','includeLtv',true), jsonb_build_object('humanRequiredForCommercialMessage',true), jsonb_build_object('required', ARRAY['customer_stage','action','metric','next_step']::TEXT[]), 6500, 8, 4),
  ('revenue_recovery', 'Revenue Recovery', 'Recuperacao de nao-clientes, ex-clientes e propostas perdidas.', 'Priorizar caixa escondido em oportunidades perdidas e clientes inativos.', ARRAY['crm','omnichannel','proposals','reports','automations']::TEXT[], ARRAY['strategy_retrieval','crm_read','proposal_read','metrics_read','recommendation_create']::TEXT[], ARRAY['activate_campaign','promise_discount_without_approved_offer']::TEXT[], ARRAY['recovery_message','offer_change']::TEXT[], jsonb_build_object('breadth','recovery','includeLostReasons',true), jsonb_build_object('humanRequiredForRecoveryOffer',true), jsonb_build_object('required', ARRAY['segment','recoverable_value','action','next_step']::TEXT[]), 6500, 8, 5),
  ('offer_conversion', 'Offer And Conversion', 'Oferta, copy, proposta, landing pages e conversao.', 'Transformar objecoes e sinais em melhoria de oferta e mensagem.', ARRAY['marketing_studio','landing_pages','campaigns','crm','proposals']::TEXT[], ARRAY['strategy_retrieval','objection_read','content_recommendation','recommendation_create']::TEXT[], ARRAY['publish_without_approval','activate_paid_campaign_without_approval']::TEXT[], ARRAY['client_visible_copy','offer_change']::TEXT[], jsonb_build_object('breadth','conversion','includeObjections',true), jsonb_build_object('humanRequiredForPublishing',true), jsonb_build_object('required', ARRAY['objection','copy_angle','asset','metric']::TEXT[]), 6500, 8, 4),
  ('marketing_strategist', 'Marketing Strategist', 'Orquestrador estrategico dos subagentes do Marketing Studio.', 'Direcionar pesquisa, curadoria, conteudo, criativos e performance por etapa comercial.', ARRAY['marketing_studio','campaigns','landing_pages','crm','reports']::TEXT[], ARRAY['strategy_retrieval','rag_search','jina_reader','jina_search','content_create','campaign_draft']::TEXT[], ARRAY['publish_without_approval','activate_paid_campaign_without_approval']::TEXT[], ARRAY['publish_content','paid_campaign_draft','client_visible_content']::TEXT[], jsonb_build_object('breadth','marketing','includeFunnelStage',true), jsonb_build_object('humanRequiredForPublishing',true), jsonb_build_object('required', ARRAY['funnel_stage','content_job','channel','metric']::TEXT[]), 7000, 8, 5),
  ('referral_growth', 'Referral Growth', 'Indicacoes, depoimentos e prova social.', 'Identificar clientes promotores e gerar indicacoes com timing adequado.', ARRAY['crm','omnichannel','marketing_studio']::TEXT[], ARRAY['strategy_retrieval','crm_read','recommendation_create']::TEXT[], ARRAY['send_message_without_satisfaction_signal']::TEXT[], ARRAY['referral_request_message']::TEXT[], jsonb_build_object('breadth','referral','includeSatisfaction',true), jsonb_build_object('humanRequiredForReferralAsk',true), jsonb_build_object('required', ARRAY['promoter_signal','ask_timing','next_step']::TEXT[]), 4500, 5, 3),
  ('metrics_cash_mroi', 'Metrics And Cash', 'CAC, LTV, MROI, margem, funil e decisao de investimento.', 'Orientar investimento e prioridade por caixa, lucro e eficiencia comercial.', ARRAY['reports','campaigns','crm','finance']::TEXT[], ARRAY['metrics_read','strategy_retrieval','recommendation_create']::TEXT[], ARRAY['change_ads_budget_without_approval','alter_financial_records']::TEXT[], ARRAY['budget_recommendation','client_visible_financial_claim']::TEXT[], jsonb_build_object('breadth','metrics','includeFinancials',true), jsonb_build_object('humanRequiredForBudgetChange',true), jsonb_build_object('required', ARRAY['metric','finding','risk','recommendation']::TEXT[]), 7000, 6, 6),
  ('proposal_delivery', 'Proposal And Delivery', 'Propostas, escopo, implantacao e transicao para entrega.', 'Gerar recomendacoes de escopo e transicao com base no diagnostico.', ARRAY['proposals','projects','crm','reports']::TEXT[], ARRAY['strategy_retrieval','proposal_read','project_plan_suggestion','recommendation_create']::TEXT[], ARRAY['change_proposal_terms_without_approval','promise_delivery_without_capacity_check']::TEXT[], ARRAY['proposal_scope_change','delivery_commitment']::TEXT[], jsonb_build_object('breadth','proposal','includeDeliveryRisk',true), jsonb_build_object('humanRequiredForCommitment',true), jsonb_build_object('required', ARRAY['scope','risk','delivery_step','approval_needed']::TEXT[]), 6000, 6, 4)
ON CONFLICT (profile_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    purpose = EXCLUDED.purpose,
    allowed_modules = EXCLUDED.allowed_modules,
    allowed_tools = EXCLUDED.allowed_tools,
    forbidden_actions = EXCLUDED.forbidden_actions,
    requires_human_approval_for = EXCLUDED.requires_human_approval_for,
    default_context_policy = EXCLUDED.default_context_policy,
    approval_policy = EXCLUDED.approval_policy,
    output_schema = EXCLUDED.output_schema,
    max_context_chars = EXCLUDED.max_context_chars,
    max_cards = EXCLUDED.max_cards,
    max_chunks = EXCLUDED.max_chunks,
    updated_at = NOW();

INSERT INTO public.yux_commercial_stage_definitions (
  stage_key,
  name,
  description,
  stage_group,
  default_temperature,
  sort_order,
  is_terminal
)
VALUES
  ('anonymous', 'Anonimo', 'Publico ainda nao identificado.', 'audience', 'cold', 10, FALSE),
  ('follower', 'Seguidor', 'Publico identificado em canal, ainda sem lead claro.', 'audience', 'cold', 20, FALSE),
  ('lead_cold', 'Lead frio', 'Contato capturado sem sinal comercial forte.', 'lead', 'cold', 30, FALSE),
  ('lead_warm', 'Lead morno', 'Contato com algum interesse ou interacao relevante.', 'lead', 'warm', 40, FALSE),
  ('raised_hand', 'Levantada de mao', 'Contato pediu conversa, proposta, agenda ou demonstrou intencao comercial.', 'opportunity', 'hot', 50, FALSE),
  ('qualified_opportunity', 'Oportunidade qualificada', 'Levantada de mao com fit, necessidade e proximo passo comercial.', 'opportunity', 'hot', 60, FALSE),
  ('almost_customer', 'Quase cliente', 'Proposta, negociacao ou fechamento em andamento.', 'opportunity', 'hot', 70, FALSE),
  ('non_customer', 'Nao-cliente', 'Contato que nao comprou apos tentativa comercial.', 'recovery', 'warm', 80, FALSE),
  ('first_purchase_customer', 'Cliente primeira compra', 'Cliente convertido com primeira compra/contrato.', 'customer', 'hot', 90, FALSE),
  ('recurring_customer', 'Cliente recorrente', 'Cliente ativo com recorrencia, recompra ou contrato continuo.', 'customer', 'hot', 100, FALSE),
  ('ex_customer', 'Ex-cliente', 'Cliente encerrado ou inativo por ciclo relevante.', 'recovery', 'warm', 110, FALSE),
  ('referral', 'Indicado', 'Contato vindo por indicacao.', 'lead', 'warm', 120, FALSE),
  ('bad_fit', 'Bad fit', 'Contato fora do perfil ou sem condicao de atendimento.', 'excluded', 'unknown', 130, TRUE)
ON CONFLICT (stage_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    stage_group = EXCLUDED.stage_group,
    default_temperature = EXCLUDED.default_temperature,
    sort_order = EXCLUDED.sort_order,
    is_terminal = EXCLUDED.is_terminal,
    updated_at = NOW();

INSERT INTO public.yux_objection_categories (category_key, name, description, default_playbook_action)
VALUES
  ('price', 'Preco', 'Objeção relacionada a valor, orçamento ou percepção de custo.', 'Reforcar valor percebido, prova e custo de inacao.'),
  ('timing', 'Timing', 'Lead diz que não é o momento certo.', 'Criar follow-up com gatilho temporal e implicacao.'),
  ('trust', 'Confiança', 'Falta de confiança na empresa, prova ou promessa.', 'Adicionar prova social, cases e garantias operacionais.'),
  ('authority', 'Autoridade', 'Contato nao decide sozinho ou precisa validar com terceiros.', 'Mapear decisores e criar material de apoio.'),
  ('urgency', 'Urgencia', 'Lead nao percebe prioridade para agir agora.', 'Explicitar consequencia da inacao e proximo passo simples.'),
  ('product_fit', 'Fit de Produto', 'Duvida se a oferta resolve o caso especifico.', 'Refinar diagnostico e ajustar proposta/escopo.'),
  ('competitor', 'Concorrente', 'Comparacao com alternativa ou fornecedor atual.', 'Criar comparativo etico e destacar diferencial comprovavel.'),
  ('implementation_effort', 'Esforco de Implantacao', 'Medo de complexidade, tempo ou trabalho para implantar.', 'Reduzir friccao com roadmap e responsabilidade clara.'),
  ('unclear_value', 'Valor Incerto', 'Lead nao entendeu valor, ROI ou ganho esperado.', 'Reformular promessa, metricas e exemplos concretos.'),
  ('no_response', 'Sem Resposta', 'Silencio apos contato, proposta ou follow-up.', 'Acionar sequencia de retomada e pesquisa de motivo.')
ON CONFLICT (category_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_playbook_action = EXCLUDED.default_playbook_action,
    updated_at = NOW();

INSERT INTO public.yux_objection_playbook_items (category_key, title, recommended_response, recommended_action, target_profiles, visibility, status)
SELECT category_key,
       name || ' - resposta operacional',
       default_playbook_action,
       default_playbook_action,
       ARRAY['ai_closer','offer_conversion','marketing_strategist']::TEXT[],
       'internal_only',
       'active'
FROM public.yux_objection_categories
ON CONFLICT DO NOTHING;

WITH profiles AS (
  SELECT id, profile_key FROM public.yux_strategy_agent_profiles
),
skills AS (
  SELECT id, skill_key FROM public.yux_strategy_skills
),
profile_skill_map AS (
  SELECT * FROM (VALUES
    ('growth_strategist', 'yux_growth_strategy_core', 10),
    ('growth_strategist', 'yux_metrics_cash_mroi', 20),
    ('growth_strategist', 'yux_stage_classification', 30),
    ('crm_controller', 'yux_crm_controller', 10),
    ('crm_controller', 'yux_stage_classification', 20),
    ('crm_controller', 'yux_objection_intelligence', 30),
    ('ai_sdr_comercial_1', 'yux_comercial_1_sdr', 10),
    ('ai_sdr_comercial_1', 'yux_spin_diagnosis', 20),
    ('ai_sdr_comercial_1', 'yux_stage_classification', 30),
    ('ai_closer', 'yux_offer_conversion', 10),
    ('ai_closer', 'yux_objection_intelligence', 20),
    ('support_assistant', 'yux_stage_classification', 10),
    ('customer_growth_comercial_2', 'yux_comercial_2_customer_growth', 10),
    ('customer_growth_comercial_2', 'yux_metrics_cash_mroi', 20),
    ('revenue_recovery', 'yux_revenue_recovery', 10),
    ('revenue_recovery', 'yux_objection_intelligence', 20),
    ('offer_conversion', 'yux_offer_conversion', 10),
    ('offer_conversion', 'yux_objection_intelligence', 20),
    ('marketing_strategist', 'yux_marketing_by_funnel_stage', 10),
    ('marketing_strategist', 'yux_offer_conversion', 20),
    ('referral_growth', 'yux_referral_growth', 10),
    ('metrics_cash_mroi', 'yux_metrics_cash_mroi', 10),
    ('proposal_delivery', 'yux_proposal_delivery_strategy', 10)
  ) AS m(profile_key, skill_key, priority)
)
INSERT INTO public.yux_strategy_agent_profile_skills (profile_id, skill_id, priority, required)
SELECT p.id, s.id, m.priority, TRUE
FROM profile_skill_map m
JOIN profiles p ON p.profile_key = m.profile_key
JOIN skills s ON s.skill_key = m.skill_key
ON CONFLICT (profile_id, skill_id) DO UPDATE
SET priority = EXCLUDED.priority,
    required = EXCLUDED.required;

WITH profiles AS (
  SELECT id, profile_key FROM public.yux_strategy_agent_profiles
),
bindings AS (
  SELECT * FROM (VALUES
    ('content_radar', 'marketing_strategist'),
    ('strategic_curator', 'marketing_strategist'),
    ('content_strategist', 'marketing_strategist'),
    ('multichannel_writer', 'marketing_strategist'),
    ('brand_quality_reviewer', 'marketing_strategist'),
    ('campaign_strategist', 'marketing_strategist'),
    ('campaign_strategist', 'offer_conversion'),
    ('visual_creative_generator', 'marketing_strategist'),
    ('editorial_calendar_manager', 'marketing_strategist'),
    ('controlled_publisher', 'marketing_strategist'),
    ('performance_analyst', 'metrics_cash_mroi')
  ) AS b(marketing_agent_type, profile_key)
)
INSERT INTO public.yux_strategy_agent_bindings (profile_id, binding_type, marketing_agent_type, config)
SELECT p.id, 'marketing_agent_type', b.marketing_agent_type, jsonb_build_object('source', 'seed')
FROM bindings b
JOIN profiles p ON p.profile_key = b.profile_key
ON CONFLICT DO NOTHING;

WITH profile_actions AS (
  SELECT p.id AS profile_id, action_key, policy, reason
  FROM public.yux_strategy_agent_profiles p
  CROSS JOIN LATERAL (
    SELECT unnest(p.forbidden_actions) AS action_key, 'deny'::TEXT AS policy, 'Forbidden by strategy profile policy.'::TEXT AS reason
  ) denied
)
INSERT INTO public.yux_strategy_profile_action_policies (profile_id, action_key, policy, reason)
SELECT profile_id, action_key, policy, reason
FROM profile_actions
ON CONFLICT (profile_id, action_key) DO UPDATE
SET policy = EXCLUDED.policy,
    reason = EXCLUDED.reason,
    updated_at = NOW();

NOTIFY pgrst, 'reload schema';
