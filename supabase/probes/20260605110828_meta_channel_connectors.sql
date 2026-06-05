DO $$
BEGIN
  IF to_regclass('public.meta_oauth_sessions') IS NULL THEN
    RAISE EXCEPTION 'meta_oauth_sessions missing';
  END IF;

  IF to_regclass('public.channel_connection_audit_events') IS NULL THEN
    RAISE EXCEPTION 'channel_connection_audit_events missing';
  END IF;

  IF to_regclass('public.channel_health_checks') IS NULL THEN
    RAISE EXCEPTION 'channel_health_checks missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channel_connections'
      AND column_name = 'fallback_mode'
  ) THEN
    RAISE EXCEPTION 'channel_connections.fallback_mode missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('channel_connections', 'meta_oauth_sessions', 'channel_connection_audit_events', 'channel_health_checks')
      AND column_name IN ('access_token', 'app_secret', 'client_secret', 'raw_token')
  ) THEN
    RAISE EXCEPTION 'Meta connector tables must not expose raw secret columns';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
      AND table_name IN ('meta_oauth_sessions', 'channel_connection_audit_events', 'channel_health_checks')
  ) THEN
    RAISE EXCEPTION 'Meta connector tables must not grant direct anon access';
  END IF;
END
$$;
