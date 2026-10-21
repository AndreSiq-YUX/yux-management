-- Embedded Signup consumes its OAuth code once. Keep a short-lived encrypted
-- token stage so a transient Graph failure can be retried without reusing the
-- authorization code or losing the onboarding session.

ALTER TABLE public.provider_oauth_sessions
  ADD COLUMN IF NOT EXISTS processing_stage TEXT,
  ADD COLUMN IF NOT EXISTS protected_payload JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.provider_oauth_sessions'::regclass
      AND conname = 'provider_oauth_sessions_status_check'
  ) THEN
    ALTER TABLE public.provider_oauth_sessions
      DROP CONSTRAINT provider_oauth_sessions_status_check;
  END IF;

  ALTER TABLE public.provider_oauth_sessions
    ADD CONSTRAINT provider_oauth_sessions_status_check
    CHECK (status IN ('started', 'processing', 'completed', 'failed', 'expired'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.provider_oauth_sessions'::regclass
      AND conname = 'provider_oauth_sessions_protected_payload_object_check'
  ) THEN
    ALTER TABLE public.provider_oauth_sessions
      ADD CONSTRAINT provider_oauth_sessions_protected_payload_object_check
      CHECK (jsonb_typeof(protected_payload) = 'object');
  END IF;
END $$;
