DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'temperature'
  ) THEN
    RAISE EXCEPTION 'leads.temperature missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_stage_history'
  ) THEN
    RAISE EXCEPTION 'lead_stage_history table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_tags'
  ) THEN
    RAISE EXCEPTION 'lead_tags table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_saved_views'
  ) THEN
    RAISE EXCEPTION 'lead_saved_views table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_imports'
  ) THEN
    RAISE EXCEPTION 'lead_imports table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_next_actions'
  ) THEN
    RAISE EXCEPTION 'lead_next_actions table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_tags'
      AND policyname = 'lead_tags_select_accessible'
  ) THEN
    RAISE EXCEPTION 'lead_tags select policy missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.lead_saved_views', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select lead_saved_views';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.lead_import_rows', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot insert lead_import_rows';
  END IF;
END $$;
