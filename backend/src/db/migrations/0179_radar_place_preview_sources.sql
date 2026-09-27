ALTER TABLE public.radar_data_sources
  DROP CONSTRAINT IF EXISTS radar_data_sources_source_type_check;
ALTER TABLE public.radar_data_sources
  ADD CONSTRAINT radar_data_sources_source_type_check
  CHECK (source_type IN (
    'manual','csv','jina_reader','jina_search','web_search','opencnpj',
    'public_registry','cnpja_advanced_search','cnpja_office_lookup',
    'future_paid_api','osm_extract','serper_places','brave_place_search'
  ));

INSERT INTO public.platform_provider_connections (
  provider_type, provider_key, display_name, environment, status, public_config,
  secret_reference, is_default
) VALUES
  ('internal_service','serper','Serper Places','production','not_configured',
   '{"purpose":"Radar local; somente pré-visualização transitória","managedBy":"YUX Hub Admin","requiredSecret":"serper:api_key","storagePolicy":"transient_only"}'::jsonb,
   'serper:api_key',TRUE),
  ('internal_service','brave_place','Brave Place Search','production','not_configured',
   '{"purpose":"Radar local; somente pré-visualização transitória","managedBy":"YUX Hub Admin","requiredSecret":"brave_place:api_key","storagePolicy":"transient_only"}'::jsonb,
   'brave_place:api_key',TRUE)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
SET display_name = EXCLUDED.display_name,
    public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
    secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
    updated_at = NOW();

INSERT INTO public.radar_data_sources (
  source_key, source_type, display_name, enabled, is_paid, requires_secret,
  terms_notes, default_cost_per_unit, rate_limit_per_day
) VALUES
  ('serper_places','serper_places','Serper Places',FALSE,TRUE,TRUE,
   'Busca local Brasil. Somente pré-visualização transitória; não salvar resultados no CRM. Preço em R$ deve ser aprovado pelo Admin antes da ativação.',0,10),
  ('brave_place_search','brave_place_search','Brave Place Search',FALSE,TRUE,TRUE,
   'Busca local Brasil. Plano padrão sem direito de retenção dos resultados; somente pré-visualização transitória. Preço em R$ deve ser aprovado pelo Admin.',0,10)
ON CONFLICT (source_key) WHERE organization_id IS NULL DO UPDATE
SET source_type = EXCLUDED.source_type,
    display_name = EXCLUDED.display_name,
    is_paid = EXCLUDED.is_paid,
    requires_secret = EXCLUDED.requires_secret,
    terms_notes = EXCLUDED.terms_notes,
    updated_at = NOW();

-- O custo antigo do CNPJá avançado era multiplicado por empresa retornada;
-- uma pesquisa é a unidade de chamada. Não sobrepor preço ajustado manualmente.
UPDATE public.radar_data_sources
SET default_cost_per_unit = 0.025000, updated_at = NOW()
WHERE source_key = 'cnpja_advanced_search' AND organization_id IS NULL
  AND default_cost_per_unit = 0.002500;

-- 0110 stored the old, nonfunctional POST /office/search contract. Preserve
-- credentials and other provider settings while correcting only these fields.
UPDATE public.platform_provider_connections
SET public_config = public_config || '{"advancedSearchPath":"/office","advancedSearchMethod":"GET"}'::jsonb,
    updated_at = NOW()
WHERE provider_type = 'internal_service' AND provider_key = 'cnpja'
  AND environment = 'production';
