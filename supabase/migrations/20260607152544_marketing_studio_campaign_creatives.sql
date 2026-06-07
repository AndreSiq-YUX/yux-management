-- Marketing Studio Phase 8: campaign and creative suggestions.

CREATE TABLE public.marketing_campaign_creative_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  source_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','changes_requested','rejected','converted','archived')),
  provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta','google')),
  objective TEXT NOT NULL DEFAULT 'lead_generation'
    CHECK (objective IN ('lead_generation','traffic','conversions','awareness')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  campaign_name TEXT NOT NULL CHECK (BTRIM(campaign_name) <> ''),
  angle TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  funnel_stage TEXT NOT NULL DEFAULT 'consideration'
    CHECK (funnel_stage IN ('awareness','consideration','conversion','retention')),
  cta TEXT,
  daily_budget NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (daily_budget >= 0),
  total_budget NUMERIC(15,2) CHECK (total_budget IS NULL OR total_budget >= 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  utm_source TEXT,
  utm_medium TEXT NOT NULL DEFAULT 'paid',
  utm_campaign TEXT,
  copy_variations JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(copy_variations) = 'array'),
  creative_concepts JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(creative_concepts) = 'array'),
  targeting_suggestions JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(targeting_suggestions) = 'object'),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  risk_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_campaign_draft_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES public.marketing_campaign_creative_suggestions(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  idempotency_key TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_payload) = 'object'),
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(response_payload) = 'object'),
  protected_error TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (suggestion_id, idempotency_key)
);

CREATE INDEX idx_marketing_campaign_suggestions_contract_status ON public.marketing_campaign_creative_suggestions(contract_id, status, created_at DESC);
CREATE INDEX idx_marketing_campaign_suggestions_campaign ON public.marketing_campaign_creative_suggestions(campaign_id);
CREATE INDEX idx_marketing_campaign_suggestions_landing_page ON public.marketing_campaign_creative_suggestions(landing_page_id);
CREATE INDEX idx_marketing_campaign_draft_runs_contract_status ON public.marketing_campaign_draft_runs(contract_id, status, created_at DESC);

CREATE TRIGGER update_marketing_campaign_suggestions_updated_at
  BEFORE UPDATE ON public.marketing_campaign_creative_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_campaign_draft_runs_updated_at
  BEFORE UPDATE ON public.marketing_campaign_draft_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_campaign_creative_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_draft_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing users read campaign creative suggestions" ON public.marketing_campaign_creative_suggestions
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));

CREATE POLICY "Marketing writers manage campaign creative suggestions" ON public.marketing_campaign_creative_suggestions
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'write'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'write'));

CREATE POLICY "Marketing users read campaign draft runs" ON public.marketing_campaign_draft_runs
  FOR SELECT TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'read'));

CREATE POLICY "Marketing supervisors manage campaign draft runs" ON public.marketing_campaign_draft_runs
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'supervise'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'supervise'));

REVOKE ALL ON public.marketing_campaign_creative_suggestions FROM anon;
REVOKE ALL ON public.marketing_campaign_draft_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_creative_suggestions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_draft_runs TO authenticated, service_role;

UPDATE public.marketing_agent_templates
SET default_tools = ARRAY['campaign_draft','rag_search']::TEXT[]
WHERE agent_type = 'campaign_strategist';

NOTIFY pgrst, 'reload schema';
