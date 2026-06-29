CREATE TABLE IF NOT EXISTS public.platform_provider_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id UUID NOT NULL REFERENCES public.platform_provider_connections(id) ON DELETE CASCADE,
  secret_kind TEXT NOT NULL DEFAULT 'api_key' CHECK (secret_kind IN ('api_key', 'webhook_secret')),
  reference TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_connection_id, secret_kind),
  UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS idx_platform_provider_secrets_connection
  ON public.platform_provider_secrets(provider_connection_id, secret_kind);

DROP TRIGGER IF EXISTS update_platform_provider_secrets_updated_at ON public.platform_provider_secrets;
CREATE TRIGGER update_platform_provider_secrets_updated_at
  BEFORE UPDATE ON public.platform_provider_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
