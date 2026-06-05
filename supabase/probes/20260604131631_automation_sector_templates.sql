DO $$
BEGIN
  IF to_regclass('public.automation_sector_template_catalog') IS NULL THEN
    RAISE EXCEPTION 'automation_sector_template_catalog missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.automation_sector_template_catalog', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select automation_sector_template_catalog';
  END IF;
END $$;
