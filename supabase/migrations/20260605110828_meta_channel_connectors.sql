-- Official Meta channel connectors for WhatsApp, Instagram Direct and Facebook Messenger.

ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_channel_check;

ALTER TABLE public.channel_connections
  ADD CONSTRAINT channel_connections_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat'));

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat'));

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS provider_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_business_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_display_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_username TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS connected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS health_summary TEXT,
  ADD COLUMN IF NOT EXISTS fallback_mode TEXT NOT NULL DEFAULT 'official';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_health_status_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_health_status_check
      CHECK (health_status IN ('not_configured', 'pending', 'connected', 'stale', 'needs_reauth', 'failed', 'disabled', 'disconnected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_fallback_mode_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_fallback_mode_check
      CHECK (fallback_mode IN ('official', 'n8n'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_channel TEXT NOT NULL CHECK (requested_channel IN ('whatsapp', 'instagram', 'messenger')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'expired')),
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier_hash TEXT,
  sanitized_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error_text TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_connection_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('connected', 'reconnected', 'disconnected', 'token_failed', 'webhook_failed', 'status_changed', 'test_sent', 'admin_action')),
  source TEXT NOT NULL CHECK (source IN ('portal', 'admin_yux', 'health_job', 'webhook', 'edge_function')),
  safe_before JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_before) = 'object'),
  safe_after JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_after) = 'object'),
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat')),
  previous_status TEXT,
  next_status TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('manual', 'scheduled', 'webhook', 'outbound', 'reauth')),
  sanitized_response JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_response) = 'object'),
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_connections_meta_org_channel
  ON public.channel_connections(organization_id, channel, health_status, token_state);
CREATE INDEX IF NOT EXISTS idx_channel_connections_meta_asset
  ON public.channel_connections(channel, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_oauth_sessions_org_status
  ON public.meta_oauth_sessions(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_connection_audit_connection
  ON public.channel_connection_audit_events(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_health_checks_connection
  ON public.channel_health_checks(connection_id, created_at DESC);

ALTER TABLE public.meta_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connection_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Omnichannel configurators manage meta oauth sessions" ON public.meta_oauth_sessions;
CREATE POLICY "Omnichannel configurators manage meta oauth sessions" ON public.meta_oauth_sessions
  FOR ALL TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

DROP POLICY IF EXISTS "Omnichannel users read channel audit" ON public.channel_connection_audit_events;
CREATE POLICY "Omnichannel users read channel audit" ON public.channel_connection_audit_events
  FOR SELECT TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'read'));

DROP POLICY IF EXISTS "Omnichannel configurators insert channel audit" ON public.channel_connection_audit_events;
CREATE POLICY "Omnichannel configurators insert channel audit" ON public.channel_connection_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

DROP POLICY IF EXISTS "Omnichannel users read channel health checks" ON public.channel_health_checks;
CREATE POLICY "Omnichannel users read channel health checks" ON public.channel_health_checks
  FOR SELECT TO authenticated
  USING (private.can_access_omnichannel_organization(organization_id, 'read'));

DROP POLICY IF EXISTS "Omnichannel configurators insert channel health checks" ON public.channel_health_checks;
CREATE POLICY "Omnichannel configurators insert channel health checks" ON public.channel_health_checks
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

REVOKE ALL ON public.meta_oauth_sessions FROM anon;
REVOKE ALL ON public.channel_connection_audit_events FROM anon;
REVOKE ALL ON public.channel_health_checks FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_oauth_sessions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.channel_connection_audit_events TO authenticated, service_role;
GRANT SELECT, INSERT ON public.channel_health_checks TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
