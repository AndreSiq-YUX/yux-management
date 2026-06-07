-- YUX Marketing Studio Phase 5: controlled research, source ingestion,
-- Radar runs, source item deduplication and research cache.

CREATE TABLE public.marketing_source_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.marketing_sources(id) ON DELETE SET NULL,
  radar_run_id UUID,
  item_type TEXT NOT NULL DEFAULT 'article'
    CHECK (item_type IN ('article','search_result','rss_entry','youtube_video','crm_topic','omnichannel_question','campaign_signal','manual')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  source_url TEXT,
  normalized_url TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  summary TEXT NOT NULL DEFAULT '',
  raw_excerpt TEXT,
  language TEXT NOT NULL DEFAULT 'pt',
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  dedupe_key TEXT NOT NULL CHECK (BTRIM(dedupe_key) <> ''),
  relevance_score INTEGER NOT NULL DEFAULT 0 CHECK (relevance_score BETWEEN 0 AND 100),
  novelty_score INTEGER NOT NULL DEFAULT 0 CHECK (novelty_score BETWEEN 0 AND 100),
  commercial_score INTEGER NOT NULL DEFAULT 0 CHECK (commercial_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'captured'
    CHECK (status IN ('captured','summarized','idea_generated','dismissed','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, dedupe_key)
);

CREATE TABLE public.marketing_research_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('jina_reader','jina_search','tavily','serper','firecrawl','internal')),
  request_type TEXT NOT NULL CHECK (request_type IN ('reader','search','crawl','internal_lookup')),
  request_key TEXT NOT NULL CHECK (BTRIM(request_key) <> ''),
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_payload) = 'object'),
  response_summary TEXT NOT NULL DEFAULT '',
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(response_payload) = 'object'),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, provider, request_type, request_key)
);

CREATE TABLE public.marketing_radar_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','collecting','curating','completed','failed','cancelled')),
  period_start DATE,
  period_end DATE,
  query TEXT,
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  idea_count INTEGER NOT NULL DEFAULT 0 CHECK (idea_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  summary TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketing_source_items
  ADD CONSTRAINT marketing_source_items_radar_run_id_fkey
  FOREIGN KEY (radar_run_id)
  REFERENCES public.marketing_radar_runs(id)
  ON DELETE SET NULL;

ALTER TABLE public.marketing_ideas
  ADD COLUMN IF NOT EXISTS source_item_id UUID REFERENCES public.marketing_source_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS radar_run_id UUID REFERENCES public.marketing_radar_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curation_notes TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT;

CREATE INDEX idx_marketing_source_items_contract_status ON public.marketing_source_items(contract_id, status, created_at DESC);
CREATE INDEX idx_marketing_source_items_source_created ON public.marketing_source_items(source_id, created_at DESC);
CREATE INDEX idx_marketing_source_items_radar_run ON public.marketing_source_items(radar_run_id);
CREATE INDEX idx_marketing_research_cache_contract_provider ON public.marketing_research_cache(contract_id, provider, request_type, created_at DESC);
CREATE INDEX idx_marketing_research_cache_expires ON public.marketing_research_cache(expires_at);
CREATE INDEX idx_marketing_radar_runs_contract_status ON public.marketing_radar_runs(contract_id, status, created_at DESC);
CREATE INDEX idx_marketing_ideas_source_item ON public.marketing_ideas(source_item_id);
CREATE INDEX idx_marketing_ideas_radar_run ON public.marketing_ideas(radar_run_id);

CREATE TRIGGER update_marketing_source_items_updated_at BEFORE UPDATE ON public.marketing_source_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketing_radar_runs_updated_at BEFORE UPDATE ON public.marketing_radar_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_source_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_research_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_radar_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing users read source items" ON public.marketing_source_items
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers manage source items" ON public.marketing_source_items
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));

CREATE POLICY "Marketing configurators read research cache" ON public.marketing_research_cache
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'));
CREATE POLICY "Marketing supervisors manage research cache" ON public.marketing_research_cache
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

CREATE POLICY "Marketing users read radar runs" ON public.marketing_radar_runs
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));
CREATE POLICY "Marketing writers create radar runs" ON public.marketing_radar_runs
  FOR INSERT TO authenticated WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));
CREATE POLICY "Marketing supervisors update radar runs" ON public.marketing_radar_runs
  FOR UPDATE TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

REVOKE ALL ON public.marketing_source_items FROM anon;
REVOKE ALL ON public.marketing_research_cache FROM anon;
REVOKE ALL ON public.marketing_radar_runs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_source_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_research_cache TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_radar_runs TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
