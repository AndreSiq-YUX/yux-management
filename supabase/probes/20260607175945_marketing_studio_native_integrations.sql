DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'provider_oauth_sessions'
  ) THEN
    RAISE EXCEPTION 'Missing public.provider_oauth_sessions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'provider_integration_secrets'
  ) THEN
    RAISE EXCEPTION 'Missing public.provider_integration_secrets';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'provider_integration_secrets'
      AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'provider_integration_secrets must not grant anon/authenticated access';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('publishing_connections','ad_provider_connections')
      AND column_name IN ('access_token','refresh_token','client_secret','raw_token')
  ) THEN
    RAISE EXCEPTION 'Provider connection tables must not expose raw token columns';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'publishing_connections'
      AND column_name = 'provider_asset_id'
  ) THEN
    RAISE EXCEPTION 'publishing_connections.provider_asset_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'publishing_connections'
      AND column_name = 'last_published_at'
  ) THEN
    RAISE EXCEPTION 'publishing_connections.last_published_at missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ad_provider_connections'
      AND column_name = 'contract_id'
  ) THEN
    RAISE EXCEPTION 'ad_provider_connections.contract_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ad_provider_mutation_runs'
      AND column_name = 'completed_at'
  ) THEN
    RAISE EXCEPTION 'ad_provider_mutation_runs.completed_at missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('provider_oauth_sessions','provider_integration_secrets')
      AND c.relrowsecurity = TRUE
    GROUP BY 1
    HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'Provider OAuth/secret tables must have RLS enabled';
  END IF;
END $$;
