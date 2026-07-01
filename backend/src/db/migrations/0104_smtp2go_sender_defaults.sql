UPDATE public.platform_provider_connections
SET public_config = jsonb_build_object(
    'defaultFromEmail', 'no-reply@yux.com.br',
    'defaultFromName', 'YUX Hub',
    'invitationFromEmail', 'no-reply@yux.com.br',
    'invitationFromName', 'YUX Hub'
  ) || jsonb_strip_nulls(public_config),
  updated_at = NOW()
WHERE provider_type = 'email'
  AND provider_key = 'smtp2go'
  AND environment = 'production';
