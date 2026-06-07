DO $$
DECLARE
  provider_record RECORD;
BEGIN
  SELECT
    provider_type,
    provider_key,
    display_name,
    environment,
    status,
    public_config,
    secret_reference,
    is_default
  INTO provider_record
  FROM public.platform_provider_connections
  WHERE provider_type = 'internal_service'
    AND provider_key = 'jina_ai'
    AND environment = 'production';

  IF provider_record.provider_key IS NULL THEN
    RAISE EXCEPTION 'Missing Jina AI global provider default';
  END IF;

  IF provider_record.secret_reference <> 'JINA_API_KEY' THEN
    RAISE EXCEPTION 'Unexpected Jina secret reference: %', provider_record.secret_reference;
  END IF;

  IF provider_record.public_config->>'readerBaseUrl' <> 'https://r.jina.ai' THEN
    RAISE EXCEPTION 'Unexpected Jina Reader base URL: %', provider_record.public_config->>'readerBaseUrl';
  END IF;

  IF provider_record.public_config->>'searchBaseUrl' <> 'https://s.jina.ai' THEN
    RAISE EXCEPTION 'Unexpected Jina Search base URL: %', provider_record.public_config->>'searchBaseUrl';
  END IF;

  IF provider_record.public_config->>'groundingTool' <> 'jina_grounding' THEN
    RAISE EXCEPTION 'Unexpected Jina grounding tool: %', provider_record.public_config->>'groundingTool';
  END IF;
END $$;
