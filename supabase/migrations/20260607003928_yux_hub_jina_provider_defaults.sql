-- Jina AI global provider default for Marketing Studio research tools.
-- Secret values stay in Supabase/Vercel/server-side secrets. The database stores
-- only safe references and operational metadata.

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
  'jina_ai',
  'Jina AI',
  'production',
  'not_configured',
  jsonb_build_object(
    'baseUrl', 'https://api.jina.ai/v1',
    'readerBaseUrl', 'https://r.jina.ai',
    'searchBaseUrl', 'https://s.jina.ai',
    'readerTool', 'jina_reader',
    'searchTool', 'jina_search',
    'groundingTool', 'jina_grounding',
    'purpose', 'leitura, busca e grounding controlados para Marketing Studio',
    'managedBy', 'YUX Hub Admin',
    'requiredSecret', 'JINA_API_KEY'
  ),
  'JINA_API_KEY',
  true
)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
      secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
      is_default = EXCLUDED.is_default,
      updated_at = NOW();

NOTIFY pgrst, 'reload schema';
