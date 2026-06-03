DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_instances'
  ) THEN
    RAISE EXCEPTION 'crm_instances table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_instance_members'
  ) THEN
    RAISE EXCEPTION 'crm_instance_members table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_teams'
  ) THEN
    RAISE EXCEPTION 'crm_teams table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_configuration_drafts'
  ) THEN
    RAISE EXCEPTION 'crm_configuration_drafts table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_configuration_publications'
  ) THEN
    RAISE EXCEPTION 'crm_configuration_publications table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'crm_instance_id'
  ) THEN
    RAISE EXCEPTION 'leads.crm_instance_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crm_pipelines' AND column_name = 'crm_instance_id'
  ) THEN
    RAISE EXCEPTION 'crm_pipelines.crm_instance_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_instances'
      AND policyname = 'crm_instances_select_accessible'
  ) THEN
    RAISE EXCEPTION 'crm_instances select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_instance_members'
      AND policyname = 'crm_instance_members_select_accessible'
  ) THEN
    RAISE EXCEPTION 'crm_instance_members select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leads'
      AND policyname = 'CRM governance can read leads'
  ) THEN
    RAISE EXCEPTION 'lead governance read policy missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.crm_instances', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select crm_instances';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.crm_configuration_publications', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot insert crm_configuration_publications';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'can_access_crm_instance'
  ) THEN
    RAISE EXCEPTION 'private.can_access_crm_instance missing';
  END IF;
END $$;
