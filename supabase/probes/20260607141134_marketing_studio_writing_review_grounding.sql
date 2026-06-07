DO $$
BEGIN
  IF to_regclass('public.marketing_content_generation_runs') IS NULL THEN
    RAISE EXCEPTION 'Missing marketing_content_generation_runs table';
  END IF;

  IF to_regclass('public.marketing_content_quality_checks') IS NULL THEN
    RAISE EXCEPTION 'Missing marketing_content_quality_checks table';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_content_generation_runs'
      AND column_name = 'grounding_status'
  ) THEN
    RAISE EXCEPTION 'Missing grounding_status on generation runs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_content_quality_checks'
      AND column_name = 'risk_flags'
  ) THEN
    RAISE EXCEPTION 'Missing risk_flags on quality checks';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'marketing_content_generation_runs'
      AND policyname = 'Marketing users read content generation runs'
  ) THEN
    RAISE EXCEPTION 'Missing generation run read policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'marketing_content_quality_checks'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Missing authenticated SELECT grant for quality checks';
  END IF;
END $$;
