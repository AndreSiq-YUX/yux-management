DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_modules WHERE key = 'marketing_studio'
  ) THEN
    RAISE EXCEPTION 'marketing_studio module missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'marketing_studio_settings',
        'marketing_agent_templates',
        'marketing_agents',
        'marketing_sources',
        'marketing_ideas',
        'content_items',
        'content_versions',
        'content_reviews',
        'editorial_calendar_items',
        'ai_credit_wallets',
        'ai_usage_ledger'
      )
      AND rowsecurity = FALSE
  ) THEN
    RAISE EXCEPTION 'marketing studio tables without RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.role_permissions
    WHERE role_key = 'client_admin'
      AND permission_key = 'marketing_studio.read'
  ) THEN
    RAISE EXCEPTION 'client_admin marketing_studio.read permission missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.marketing_agent_templates
    WHERE agent_type = 'content_radar'
  ) THEN
    RAISE EXCEPTION 'marketing agent templates missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'content_items'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name ILIKE '%campaign%'
  ) THEN
    RAISE EXCEPTION 'content_items campaign foreign key missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'content_items'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name ILIKE '%landing_page%'
  ) THEN
    RAISE EXCEPTION 'content_items landing page foreign key missing';
  END IF;
END $$;
