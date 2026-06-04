-- Default global providers for YUX Hub administration.
-- Secret values stay in Supabase/Vercel/server-side secrets. The database stores
-- only safe references and operational metadata.

WITH openai_fallback AS (
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
    'llm',
    'openai_direct',
    'OpenAI direto',
    'production',
    'not_configured',
    jsonb_build_object(
      'baseUrl', 'https://api.openai.com/v1',
      'defaultModel', 'gpt-4.1-mini',
      'purpose', 'fallback externo quando o OpenRouter estiver indisponivel',
      'managedBy', 'YUX Hub Admin',
      'requiredSecret', 'OPENAI_API_KEY'
    ),
    'OPENAI_API_KEY',
    false
  )
  ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
        secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
        updated_at = NOW()
  RETURNING id
),
openrouter_default AS (
  INSERT INTO public.platform_provider_connections (
    provider_type,
    provider_key,
    display_name,
    environment,
    status,
    public_config,
    secret_reference,
    is_default,
    fallback_provider_id
  )
  VALUES (
    'llm',
    'openrouter',
    'OpenRouter',
    'production',
    'not_configured',
    jsonb_build_object(
      'baseUrl', 'https://openrouter.ai/api/v1',
      'chatCompletionsPath', '/chat/completions',
      'primaryModel', 'openai/gpt-4.1-mini',
      'fallbackModels', jsonb_build_array('anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'),
      'providerRouting', jsonb_build_object(
        'allowFallbacks', true,
        'sort', 'throughput'
      ),
      'externalFallbackProviderKey', 'openai_direct',
      'managedBy', 'YUX Hub Admin',
      'requiredSecret', 'OPENROUTER_API_KEY'
    ),
    'OPENROUTER_API_KEY',
    true,
    (SELECT id FROM openai_fallback)
  )
  ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
        secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
        is_default = true,
        fallback_provider_id = COALESCE(public.platform_provider_connections.fallback_provider_id, EXCLUDED.fallback_provider_id),
        updated_at = NOW()
  RETURNING id
)
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
    'requiredSecret', 'SMTP2GO_API_KEY',
    'requiredWebhookSecret', 'SMTP2GO_WEBHOOK_SECRET',
    'sendFunction', 'send-email',
    'webhookFunction', 'smtp2go-webhook'
  ),
  'SMTP2GO_API_KEY',
  true
)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
      secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
      is_default = true,
      updated_at = NOW();

DROP POLICY IF EXISTS "Omnichannel configurators manage email provider connections" ON public.email_provider_connections;
CREATE POLICY "Omnichannel configurators manage email provider connections" ON public.email_provider_connections
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  );

DROP POLICY IF EXISTS "Omnichannel configurators manage smtp2go subaccounts" ON public.smtp2go_subaccounts;
CREATE POLICY "Omnichannel configurators manage smtp2go subaccounts" ON public.smtp2go_subaccounts
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  );

DROP POLICY IF EXISTS "Omnichannel users read email send requests" ON public.email_send_requests;
CREATE POLICY "Omnichannel users read email send requests" ON public.email_send_requests
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'read')
  );

DROP POLICY IF EXISTS "Omnichannel configurators update email send requests" ON public.email_send_requests;
CREATE POLICY "Omnichannel configurators update email send requests" ON public.email_send_requests
  FOR UPDATE TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  );

DROP POLICY IF EXISTS "Omnichannel users read email suppressions" ON public.email_suppression_entries;
CREATE POLICY "Omnichannel users read email suppressions" ON public.email_suppression_entries
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'read')
  );

DROP POLICY IF EXISTS "Omnichannel configurators manage email suppressions" ON public.email_suppression_entries;
CREATE POLICY "Omnichannel configurators manage email suppressions" ON public.email_suppression_entries
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  );

DROP POLICY IF EXISTS "Omnichannel users read email usage counters" ON public.email_usage_counters;
CREATE POLICY "Omnichannel users read email usage counters" ON public.email_usage_counters
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'read')
  );

DROP POLICY IF EXISTS "Omnichannel configurators manage email usage counters" ON public.email_usage_counters;
CREATE POLICY "Omnichannel configurators manage email usage counters" ON public.email_usage_counters
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.can_access_omnichannel_organization(organization_id, 'configure')
  );

NOTIFY pgrst, 'reload schema';
