ALTER TABLE public.radar_data_sources
  DROP CONSTRAINT IF EXISTS radar_data_sources_source_type_check;
ALTER TABLE public.radar_data_sources
  ADD CONSTRAINT radar_data_sources_source_type_check
  CHECK (source_type IN (
    'manual','csv','jina_reader','jina_search','web_search','opencnpj',
    'public_registry','cnpja_advanced_search','cnpja_office_lookup',
    'future_paid_api','osm_extract'
  ));

ALTER TABLE public.radar_enrichment_runs
  DROP CONSTRAINT IF EXISTS radar_enrichment_runs_provider_check;
ALTER TABLE public.radar_enrichment_runs
  ADD CONSTRAINT radar_enrichment_runs_provider_check
  CHECK (provider IN (
    'manual','csv','jina_reader','jina_search','web_search','opencnpj',
    'public_registry','cnpja_advanced_search','cnpja_office_lookup','osm_extract'
  ));

ALTER TABLE public.radar_candidate_records
  DROP CONSTRAINT IF EXISTS radar_candidate_records_source_type_check;
ALTER TABLE public.radar_candidate_records
  ADD CONSTRAINT radar_candidate_records_source_type_check
  CHECK (source_type IN (
    'manual','csv','jina_reader','jina_search','web_search','public_registry',
    'cnpja_advanced_search','cnpja_office_lookup','osm_extract'
  ));

CREATE TABLE IF NOT EXISTS public.radar_osm_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_code TEXT NOT NULL CHECK (municipality_code ~ '^[0-9]{7}$'),
  city TEXT NOT NULL CHECK (BTRIM(city) <> ''),
  state TEXT NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  region_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  boundary_source TEXT NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'loading' CHECK (status IN ('loading','active','superseded','failed')),
  place_count INTEGER NOT NULL DEFAULT 0 CHECK (place_count >= 0),
  attribution TEXT NOT NULL DEFAULT '© OpenStreetMap contributors (ODbL)',
  error_message TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_osm_one_active_snapshot_per_municipality
  ON public.radar_osm_snapshots(municipality_code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS radar_osm_snapshots_city
  ON public.radar_osm_snapshots(state, city, status, extracted_at DESC);

CREATE TABLE IF NOT EXISTS public.radar_osm_places (
  snapshot_id UUID NOT NULL REFERENCES public.radar_osm_snapshots(id) ON DELETE CASCADE,
  osm_type TEXT NOT NULL CHECK (osm_type IN ('node','way')),
  osm_id BIGINT NOT NULL,
  segment_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  address TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  source_url TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(tags) = 'object'),
  PRIMARY KEY (snapshot_id, osm_type, osm_id)
);
CREATE INDEX IF NOT EXISTS radar_osm_places_segment_name
  ON public.radar_osm_places(snapshot_id, segment_key, name, osm_type, osm_id);

INSERT INTO public.radar_data_sources (
  source_key, source_type, display_name, enabled, is_paid, requires_secret,
  terms_notes, default_cost_per_unit, rate_limit_per_day
)
VALUES (
  'osm_extract','osm_extract','Dados abertos OSM (índice local)',FALSE,FALSE,FALSE,
  'Descoberta em extrato regional indexado pela YUX; atribuição © OpenStreetMap contributors (ODbL). Não prova ausência de site ou contato.',
  0,10
)
ON CONFLICT (source_key) WHERE organization_id IS NULL DO UPDATE
SET source_type = EXCLUDED.source_type,
    display_name = EXCLUDED.display_name,
    is_paid = EXCLUDED.is_paid,
    requires_secret = EXCLUDED.requires_secret,
    terms_notes = EXCLUDED.terms_notes,
    default_cost_per_unit = EXCLUDED.default_cost_per_unit,
    rate_limit_per_day = EXCLUDED.rate_limit_per_day,
    updated_at = NOW();
