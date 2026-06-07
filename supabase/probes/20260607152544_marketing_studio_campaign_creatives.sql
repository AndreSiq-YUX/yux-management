DO $$
DECLARE
  missing_tables TEXT[];
  strategist_tools TEXT[];
BEGIN
  SELECT ARRAY_AGG(table_name ORDER BY table_name)
  INTO missing_tables
  FROM (
    VALUES
      ('marketing_campaign_creative_suggestions'),
      ('marketing_campaign_draft_runs')
  ) AS expected(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name = expected.table_name
  );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Missing campaign creative tables: %', missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('marketing_campaign_creative_suggestions','marketing_campaign_draft_runs')
      AND c.relrowsecurity = TRUE
    GROUP BY 1
    HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'Campaign creative tables must have RLS enabled';
  END IF;

  SELECT default_tools
  INTO strategist_tools
  FROM public.marketing_agent_templates
  WHERE agent_type = 'campaign_strategist';

  IF strategist_tools IS NULL OR NOT ('campaign_draft' = ANY(strategist_tools)) THEN
    RAISE EXCEPTION 'campaign_strategist must include campaign_draft';
  END IF;
END $$;
