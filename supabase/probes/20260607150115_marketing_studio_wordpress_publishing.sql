DO $$
DECLARE
  missing_tables TEXT[];
  template_tools TEXT[];
BEGIN
  SELECT ARRAY_AGG(table_name ORDER BY table_name)
  INTO missing_tables
  FROM (
    VALUES
      ('publishing_connections'),
      ('publishing_runs')
  ) AS expected(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name = expected.table_name
  );

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Missing publishing tables: %', missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('publishing_connections','publishing_runs')
      AND c.relrowsecurity = TRUE
    GROUP BY 1
    HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'Publishing tables must have RLS enabled';
  END IF;

  SELECT default_tools
  INTO template_tools
  FROM public.marketing_agent_templates
  WHERE agent_type = 'controlled_publisher';

  IF template_tools IS NULL OR NOT ('publish_wordpress' = ANY(template_tools)) THEN
    RAISE EXCEPTION 'controlled_publisher template must include publish_wordpress';
  END IF;
END $$;
