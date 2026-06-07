-- Marketing Studio Phase 9: native Meta and Google integrations.
-- OAuth sessions are visible only through Marketing Studio RLS. Encrypted
-- provider tokens are service-role-only and never granted to anon/authenticated.

CREATE TABLE public.provider_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('meta_social','google_business_profile','meta_ads','google_ads')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('publishing','ads')),
  state_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed','expired')),
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  redirect_uri TEXT,
  sanitized_result JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.provider_integration_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta_social','google_business_profile','meta_ads','google_ads','wordpress')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('publishing','ads')),
  connection_table TEXT NOT NULL CHECK (connection_table IN ('publishing_connections','ad_provider_connections','channel_connections')),
  connection_id UUID NOT NULL,
  secret_kind TEXT NOT NULL CHECK (secret_kind IN ('access_token','refresh_token','client_secret','application_password')),
  reference TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL CHECK (BTRIM(ciphertext) <> ''),
  nonce TEXT NOT NULL CHECK (BTRIM(nonce) <> ''),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_provider_check;

ALTER TABLE public.publishing_connections
  ADD CONSTRAINT publishing_connections_provider_check
  CHECK (provider IN ('wordpress','meta_facebook','meta_instagram','google_business_profile'));

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_status_check;

ALTER TABLE public.publishing_connections
  ADD CONSTRAINT publishing_connections_status_check
  CHECK (status IN ('needs_setup','connected','stale','needs_reauth','failed','disabled'));

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_site_url_check;

ALTER TABLE public.publishing_connections
  ALTER COLUMN site_url DROP NOT NULL,
  ADD CONSTRAINT publishing_connections_site_url_check
  CHECK (site_url IS NULL OR BTRIM(site_url) <> '');

ALTER TABLE public.publishing_connections
  ADD COLUMN IF NOT EXISTS provider_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_asset_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_parent_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ;

ALTER TABLE public.publishing_runs
  ADD COLUMN IF NOT EXISTS external_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS external_parent_id TEXT;

ALTER TABLE public.ad_provider_connections
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS time_zone TEXT,
  ADD COLUMN IF NOT EXISTS can_manage_campaigns BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.ad_provider_mutation_runs
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_set_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX idx_provider_oauth_sessions_org_status
  ON public.provider_oauth_sessions(organization_id, provider, target_kind, status, created_at DESC);

CREATE INDEX idx_provider_integration_secrets_connection
  ON public.provider_integration_secrets(connection_table, connection_id, secret_kind);

CREATE INDEX idx_publishing_connections_provider_asset
  ON public.publishing_connections(provider, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;

CREATE INDEX idx_publishing_runs_provider_post
  ON public.publishing_runs(provider_post_id)
  WHERE provider_post_id IS NOT NULL;

CREATE INDEX idx_ad_provider_connections_contract
  ON public.ad_provider_connections(contract_id, provider, status)
  WHERE contract_id IS NOT NULL;

CREATE TRIGGER update_provider_oauth_sessions_updated_at
  BEFORE UPDATE ON public.provider_oauth_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_integration_secrets_updated_at
  BEFORE UPDATE ON public.provider_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.provider_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_integration_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketing configurators manage provider oauth sessions" ON public.provider_oauth_sessions
  FOR ALL TO authenticated USING (private.can_access_marketing_studio_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_marketing_studio_organization(organization_id, 'configure'));

REVOKE ALL ON public.provider_oauth_sessions FROM anon;
REVOKE ALL ON public.provider_integration_secrets FROM anon;
REVOKE ALL ON public.provider_integration_secrets FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_oauth_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_integration_secrets TO service_role;

NOTIFY pgrst, 'reload schema';
