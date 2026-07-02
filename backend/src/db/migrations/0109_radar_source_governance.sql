CREATE TABLE IF NOT EXISTS public.radar_source_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.radar_data_sources(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, campaign_id, source_type, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_radar_source_usage_campaign_day
  ON public.radar_source_usage_counters(campaign_id, source_type, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_radar_source_usage_org_day
  ON public.radar_source_usage_counters(organization_id, source_type, usage_date DESC);

