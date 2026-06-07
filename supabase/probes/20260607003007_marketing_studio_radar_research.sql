DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'marketing_source_items',
        'marketing_research_cache',
        'marketing_radar_runs'
      )
      AND rowsecurity = FALSE
  ) THEN
    RAISE EXCEPTION 'marketing radar tables without RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_ideas'
      AND column_name IN ('source_item_id', 'radar_run_id', 'curation_notes', 'next_action')
    GROUP BY table_name
    HAVING COUNT(*) = 4
  ) THEN
    RAISE EXCEPTION 'marketing_ideas radar columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'marketing_source_items'
      AND constraint_type = 'UNIQUE'
  ) THEN
    RAISE EXCEPTION 'source item dedupe constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'marketing_research_cache'
      AND constraint_type = 'UNIQUE'
  ) THEN
    RAISE EXCEPTION 'research cache uniqueness missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'marketing_radar_runs'
      AND policyname = 'Marketing writers create radar runs'
  ) THEN
    RAISE EXCEPTION 'radar run writer policy missing';
  END IF;
END $$;
