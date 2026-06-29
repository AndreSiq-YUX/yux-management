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
  'email',
  'smtp2go',
  'SMTP2GO',
  'production',
  'not_configured',
  jsonb_build_object(
    'purpose', 'infraestrutura compartilhada de email do YUX Hub',
    'subaccounts', true,
    'defaultDailySendLimit', 500,
    'defaultMonthlyQuota', 15000,
    'defaultFromEmail', 'no-reply@yux.com.br',
    'defaultFromName', 'YUX Hub',
    'invitationFromEmail', 'no-reply@yux.com.br',
    'invitationFromName', 'YUX Hub',
    'credentialSource', 'admin_encrypted',
    'masterCredentialReference', 'smtp2go:master',
    'webhookSecretReference', 'smtp2go:webhook',
    'provisioningMode', 'automatic',
    'clientIsolation', 'smtp2go_subaccount',
    'backendSendJob', 'email.send',
    'sendEndpoint', '/api/email/send',
    'webhookEndpoint', '/api/email/smtp2go-webhook'
  ),
  'smtp2go:master',
  true
)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE SET
  public_config = EXCLUDED.public_config || public.platform_provider_connections.public_config,
  secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
  is_default = public.platform_provider_connections.is_default OR EXCLUDED.is_default,
  updated_at = NOW();
