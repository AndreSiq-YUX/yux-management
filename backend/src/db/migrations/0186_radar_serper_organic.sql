-- Organic search is separate from Places. No source/model/price is enabled automatically.
ALTER TABLE public.radar_data_sources DROP CONSTRAINT IF EXISTS radar_data_sources_source_type_check;
ALTER TABLE public.radar_data_sources ADD CONSTRAINT radar_data_sources_source_type_check CHECK (source_type IN
 ('manual','csv','jina_reader','jina_search','web_search','opencnpj','public_registry','cnpja_advanced_search',
  'cnpja_office_lookup','future_paid_api','osm_extract','serper_places','brave_place_search','brave_web_search','serper_web_search'));
INSERT INTO public.radar_data_sources
 (source_key,source_type,display_name,enabled,is_paid,requires_secret,default_cost_per_unit,rate_limit_per_day,terms_notes)
SELECT 'serper_web_search','serper_web_search','Google via Serper — pesquisa web',FALSE,TRUE,TRUE,0,10,
 'Pesquisa orgânica Google. Usa a chave Serper existente; exige custo aprovado e confirmação de uso web com armazenamento no Admin. Places continua transitório.'
WHERE NOT EXISTS(SELECT 1 FROM public.radar_data_sources WHERE source_key='serper_web_search' AND organization_id IS NULL);
