-- Real WhatsApp provider path for omnichannel connections.

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_verify_state TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS token_state TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS last_provider_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protected_metadata_references JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_webhook_secret_reference TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_provider_verify_state_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_provider_verify_state_check
      CHECK (provider_verify_state IN ('not_configured', 'pending', 'verified', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_token_state_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_token_state_check
      CHECK (token_state IN ('not_configured', 'connected', 'stale', 'needs_reauth', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_protected_metadata_references_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_protected_metadata_references_check
      CHECK (jsonb_typeof(protected_metadata_references) = 'object');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_whatsapp_phone_number_id
  ON public.channel_connections(phone_number_id)
  WHERE channel = 'whatsapp' AND phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_connections_whatsapp_health
  ON public.channel_connections(channel, token_state, provider_verify_state, is_active)
  WHERE channel = 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_channel_connections_last_provider_sync
  ON public.channel_connections(last_provider_sync_at DESC)
  WHERE last_provider_sync_at IS NOT NULL;

UPDATE public.channel_connections
SET adapter_key = 'meta-whatsapp'
WHERE channel = 'whatsapp'
  AND adapter_key IN ('n8n-whatsapp', 'whatsapp')
  AND phone_number_id IS NOT NULL;
