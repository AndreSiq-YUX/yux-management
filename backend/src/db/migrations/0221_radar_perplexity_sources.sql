-- Add capabilities only: no secret, price, model or paid source is activated.
ALTER TABLE public.radar_data_sources DROP CONSTRAINT IF EXISTS radar_data_sources_source_type_check;
ALTER TABLE public.radar_data_sources ADD CONSTRAINT radar_data_sources_source_type_check CHECK (source_type IN
 ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry','cnpja_advanced_search',
  'cnpja_office_lookup','future_paid_api','osm_extract','serper_places','brave_place_search','brave_web_search','serper_web_search',
  'perplexity_search_fast','perplexity_search_web'));
INSERT INTO public.platform_provider_connections(provider_type,provider_key,display_name,environment,status,public_config,secret_reference,is_default)
VALUES('llm','perplexity','Perplexity — Search e investigação','production','not_configured',
 '{"retentionLicensed":false,"webSearchLicensed":false,"clientDeliveryLicensed":false,"agentEnabled":false,"searchType":"fast","searchMaxTokens":12000,"searchMaxTokensPerPage":2000}'::jsonb,'perplexity:api_key',TRUE)
ON CONFLICT(provider_type,provider_key,environment) DO NOTHING;
INSERT INTO public.radar_data_sources(source_key,source_type,display_name,enabled,is_paid,requires_secret,default_cost_per_unit,rate_limit_per_day,terms_notes)
SELECT key,key,label,FALSE,TRUE,TRUE,0,10,'Cobrança por requisição bem-sucedida; até cinco consultas por requisição. Requer custo aprovado e permissões de armazenamento/entrega separadas.'
FROM(VALUES('perplexity_search_fast','Perplexity Search — rápida'),('perplexity_search_web','Perplexity Search — padrão')) AS source(key,label)
WHERE NOT EXISTS(SELECT 1 FROM public.radar_data_sources existing WHERE existing.source_key=source.key AND existing.organization_id IS NULL);
