-- WhatsApp SaaS: one active Phone Number ID can belong to only one tenant.
-- The preflight deliberately aborts instead of selecting an owner when legacy
-- data already contains an active conflict.

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS display_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES public.conversation_queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_mode_override TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.channel_connections'::regclass
      AND conname = 'channel_connections_response_mode_override_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_response_mode_override_check
      CHECK (response_mode_override IS NULL OR response_mode_override IN ('automatic', 'assisted', 'manual'));
  END IF;
END $$;

-- The API stores credentials only after server-side provider validation. Keep
-- reads and writes tenant-scoped to the request context; workers retain their
-- existing read-only policy from migration 0159.
DROP POLICY IF EXISTS provider_integration_secrets_api_tenant_access
  ON public.provider_integration_secrets;
CREATE POLICY provider_integration_secrets_api_tenant_access
  ON public.provider_integration_secrets
  FOR ALL
  TO yux_api
  USING (
    current_setting('app.service_role', true) = 'api'
    AND private.rls_can_access_organization(organization_id)
  )
  WITH CHECK (
    current_setting('app.service_role', true) = 'api'
    AND private.rls_can_access_organization(organization_id)
  );

DO $$
DECLARE
  duplicate_phone_number_id TEXT;
BEGIN
  SELECT phone_number_id
    INTO duplicate_phone_number_id
  FROM public.channel_connections
  WHERE channel = 'whatsapp'
    AND is_active = TRUE
    AND phone_number_id IS NOT NULL
  GROUP BY phone_number_id
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_phone_number_id IS NOT NULL THEN
    RAISE EXCEPTION
      'whatsapp_active_phone_number_conflict:%', duplicate_phone_number_id
      USING ERRCODE = '23505';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_active_whatsapp_phone_unique
  ON public.channel_connections (phone_number_id)
  WHERE channel = 'whatsapp' AND is_active = TRUE AND phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_connections_whatsapp_org_phone
  ON public.channel_connections (organization_id, phone_number_id, is_active)
  WHERE channel = 'whatsapp' AND phone_number_id IS NOT NULL;
