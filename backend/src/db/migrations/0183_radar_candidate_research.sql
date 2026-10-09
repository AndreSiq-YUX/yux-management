-- Opt-in only: this migration never enables a paid provider or sets an approved price.
ALTER TABLE public.radar_data_sources DROP CONSTRAINT IF EXISTS radar_data_sources_source_type_check;
ALTER TABLE public.radar_data_sources ADD CONSTRAINT radar_data_sources_source_type_check CHECK (source_type IN
  ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry','cnpja_advanced_search',
   'cnpja_office_lookup','future_paid_api','osm_extract','serper_places','brave_place_search','brave_web_search'));
INSERT INTO public.radar_data_sources
  (source_key, source_type, display_name, enabled, is_paid, requires_secret, default_cost_per_unit, rate_limit_per_day, terms_notes)
SELECT 'brave_web_search', 'brave_web_search', 'Brave Web Search — aprofundamento', FALSE, TRUE, TRUE, 0, 10,
  'Usa a conexão Brave existente. Requer confirmação específica de busca web com retenção e custo aprovado pelo Admin.'
WHERE NOT EXISTS (SELECT 1 FROM public.radar_data_sources WHERE source_key = 'brave_web_search' AND organization_id IS NULL);

CREATE TABLE public.radar_candidate_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.radar_candidate_records(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id),
  configuration_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','partial','succeeded','failed','blocked')),
  stage TEXT NOT NULL DEFAULT 'discovery',
  lease_id UUID, lease_until TIMESTAMPTZ,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  calls JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX radar_candidate_research_active_idx ON public.radar_candidate_research_runs (candidate_id, configuration_revision)
  WHERE status IN ('queued','running');
CREATE INDEX radar_candidate_research_history_idx ON public.radar_candidate_research_runs (candidate_id, configuration_revision, created_at DESC);
CREATE INDEX radar_candidate_research_scope_idx ON public.radar_candidate_research_runs (organization_id, campaign_id, status);
-- Database tenant boundaries are also checked on every API/worker mutation.
ALTER TABLE public.radar_candidate_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_candidate_research_runs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.radar_candidate_research_runs TO yux_api,yux_worker;
CREATE POLICY yux_service_tenant_access ON public.radar_candidate_research_runs FOR ALL TO yux_api,yux_worker
  USING (private.rls_can_access_organization(organization_id)) WITH CHECK (private.rls_can_access_organization(organization_id));
CREATE POLICY yux_tenant_scope ON public.radar_candidate_research_runs AS RESTRICTIVE FOR ALL
  USING (private.rls_can_access_organization(organization_id)) WITH CHECK (private.rls_can_access_organization(organization_id));
