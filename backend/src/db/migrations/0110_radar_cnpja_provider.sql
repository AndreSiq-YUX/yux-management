ALTER TABLE public.radar_campaigns
  DROP CONSTRAINT IF EXISTS radar_campaigns_campaign_type_check;

ALTER TABLE public.radar_campaigns
  ADD CONSTRAINT radar_campaigns_campaign_type_check
  CHECK (campaign_type IN ('local_niche','recently_opened'));

ALTER TABLE public.radar_data_sources
  DROP CONSTRAINT IF EXISTS radar_data_sources_source_type_check;

ALTER TABLE public.radar_data_sources
  ADD CONSTRAINT radar_data_sources_source_type_check
  CHECK (source_type IN (
    'manual',
    'csv',
    'jina_reader',
    'jina_search',
    'web_search',
    'opencnpj',
    'public_registry',
    'cnpja_advanced_search',
    'cnpja_office_lookup',
    'future_paid_api'
  ));

ALTER TABLE public.radar_enrichment_runs
  DROP CONSTRAINT IF EXISTS radar_enrichment_runs_provider_check;

ALTER TABLE public.radar_enrichment_runs
  ADD CONSTRAINT radar_enrichment_runs_provider_check
  CHECK (provider IN (
    'manual',
    'csv',
    'jina_reader',
    'jina_search',
    'web_search',
    'opencnpj',
    'public_registry',
    'cnpja_advanced_search',
    'cnpja_office_lookup'
  ));

ALTER TABLE public.radar_candidate_records
  DROP CONSTRAINT IF EXISTS radar_candidate_records_source_type_check;

ALTER TABLE public.radar_candidate_records
  ADD CONSTRAINT radar_candidate_records_source_type_check
  CHECK (source_type IN (
    'manual',
    'csv',
    'jina_reader',
    'jina_search',
    'web_search',
    'public_registry',
    'cnpja_advanced_search',
    'cnpja_office_lookup'
  ));

INSERT INTO public.platform_provider_connections (
  provider_type,
  provider_key,
  display_name,
  environment,
  status,
  public_config,
  secret_reference,
  is_default
)
VALUES (
  'internal_service',
  'cnpja',
  'CNPJa',
  'production',
  'not_configured',
  '{
    "baseUrl": "https://api.cnpja.com",
    "advancedSearchPath": "/office/search",
    "advancedSearchMethod": "POST",
    "officeLookupPath": "/office/:taxId",
    "defaultStrategy": "CACHE_IF_FRESH",
    "maxAgeDays": 7,
    "maxStaleDays": 30,
    "defaultResultLimit": 10,
    "advancedSearchCreditCostPerTen": 1,
    "officeLookupCreditCost": 1,
    "purpose": "pesquisa avancada de empresas recem-abertas para Radar Comercial",
    "managedBy": "YUX Hub Admin",
    "requiredSecret": "cnpja:api_key"
  }'::jsonb,
  'cnpja:api_key',
  true
)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
SET display_name = EXCLUDED.display_name,
    public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
    secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
    updated_at = NOW();

INSERT INTO public.radar_data_sources (
  source_key,
  source_type,
  display_name,
  enabled,
  is_paid,
  requires_secret,
  terms_notes,
  default_cost_per_unit,
  rate_limit_per_day
)
VALUES
  (
    'cnpja_advanced_search',
    'cnpja_advanced_search',
    'CNPJa - pesquisa avancada',
    false,
    true,
    true,
    'Pesquisa avancada da API comercial CNPJa. Usar lotes pequenos, com revisao humana e respeito aos creditos/termos do provedor.',
    0.002500,
    50
  ),
  (
    'cnpja_office_lookup',
    'cnpja_office_lookup',
    'CNPJa - consulta CNPJ',
    false,
    true,
    true,
    'Consulta individual de estabelecimento na API comercial CNPJa. Preferir cache quando suficiente para reduzir creditos.',
    0.025000,
    50
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
