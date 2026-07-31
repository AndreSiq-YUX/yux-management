ALTER TABLE public.radar_campaigns
  DROP CONSTRAINT IF EXISTS radar_campaigns_campaign_type_check;

ALTER TABLE public.radar_campaigns
  ADD CONSTRAINT radar_campaigns_campaign_type_check
  CHECK (campaign_type IN ('local_niche'));

ALTER TABLE public.radar_enrichment_runs
  ALTER COLUMN company_record_id DROP NOT NULL,
  ALTER COLUMN opportunity_id DROP NOT NULL;

ALTER TABLE public.radar_enrichment_runs
  DROP CONSTRAINT IF EXISTS radar_enrichment_runs_provider_check;

ALTER TABLE public.radar_enrichment_runs
  ADD CONSTRAINT radar_enrichment_runs_provider_check
  CHECK (provider IN ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry'));

CREATE TABLE IF NOT EXISTS public.radar_candidate_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  enrichment_run_id UUID REFERENCES public.radar_enrichment_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','csv','jina_reader','jina_search','web_search','public_registry')),
  source_url TEXT,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  snippet TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(raw_payload) = 'object'),
  normalized_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(normalized_payload) = 'object'),
  dedupe_key TEXT NOT NULL CHECK (BTRIM(dedupe_key) <> ''),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','imported','discarded','duplicate','failed')),
  imported_company_record_id UUID REFERENCES public.radar_company_records(id) ON DELETE SET NULL,
  imported_opportunity_id UUID REFERENCES public.radar_opportunities(id) ON DELETE SET NULL,
  error_message TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_radar_candidate_records_campaign_status
  ON public.radar_candidate_records(campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_candidate_records_source
  ON public.radar_candidate_records(campaign_id, source_type, status);

CREATE INDEX IF NOT EXISTS idx_radar_enrichment_runs_campaign_provider
  ON public.radar_enrichment_runs(campaign_id, provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_radar_cost_logs_source
  ON public.radar_cost_logs(campaign_id, source_type, created_at DESC);
