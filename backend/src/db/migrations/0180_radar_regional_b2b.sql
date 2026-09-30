ALTER TABLE public.radar_campaigns
  DROP CONSTRAINT IF EXISTS radar_campaigns_campaign_type_check;
ALTER TABLE public.radar_campaigns
  DROP CONSTRAINT IF EXISTS radar_campaigns_target_city_check;
ALTER TABLE public.radar_campaigns
  DROP CONSTRAINT IF EXISTS radar_campaigns_target_state_check;
ALTER TABLE public.radar_campaigns
  ALTER COLUMN target_city DROP NOT NULL,
  ALTER COLUMN target_state DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS target_states TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS product_focus TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.radar_campaigns
  ADD CONSTRAINT radar_campaigns_campaign_type_check
  CHECK (campaign_type IN ('local_niche','recently_opened','regional_b2b'));
ALTER TABLE public.radar_campaigns
  ADD CONSTRAINT radar_campaigns_location_check
  CHECK (
    (campaign_type = 'regional_b2b' AND target_city IS NULL AND target_state IS NULL
      AND cardinality(target_states) BETWEEN 1 AND 3)
    OR (campaign_type <> 'regional_b2b' AND BTRIM(target_city) <> '' AND BTRIM(target_state) <> '')
  );

CREATE TABLE IF NOT EXISTS public.radar_regional_discovery_cursors (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('MG','SP','PR')),
  provider TEXT NOT NULL CHECK (provider IN ('cnpja_advanced_search')),
  next_token TEXT,
  lease_id UUID,
  running_until TIMESTAMPTZ,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  candidates_seen INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, state, provider)
);

CREATE TABLE IF NOT EXISTS public.radar_b2b_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.radar_candidate_records(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, kind, value, source_url)
);

CREATE TABLE IF NOT EXISTS public.radar_b2b_reviews (
  candidate_id UUID PRIMARY KEY REFERENCES public.radar_candidate_records(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.radar_campaigns(id) ON DELETE CASCADE,
  kitchen_status TEXT NOT NULL CHECK (kitchen_status IN ('confirmed','review','not_target','insufficient')),
  product_fit TEXT NOT NULL CHECK (product_fit IN ('high','possible','low','unknown')),
  reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  verification_method TEXT NOT NULL DEFAULT 'automated' CHECK (verification_method IN ('automated','manual')),
  review_note TEXT,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
