DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_proposal_recommendations', 'proposal_view_events', 'proposal_follow_up_tasks',
    'proposal_objections', 'proposal_closing_checklists', 'proposal_conversion_runs',
    'client_onboarding_checklists', 'client_onboarding_tasks'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE EXCEPTION 'table missing: %', target_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'crm_instance_id'
  ) THEN
    RAISE EXCEPTION 'proposals.crm_instance_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'recommended_package_id'
  ) THEN
    RAISE EXCEPTION 'proposals.recommended_package_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'source_proposal_id'
  ) THEN
    RAISE EXCEPTION 'contracts.source_proposal_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'source_lead_id'
  ) THEN
    RAISE EXCEPTION 'projects.source_lead_id missing';
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'source_proposal_id'
  ) THEN
    RAISE EXCEPTION 'invoices.source_proposal_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'proposal_closing_checklists'
      AND policyname = 'proposal_closing_checklists_select_accessible'
  ) THEN
    RAISE EXCEPTION 'proposal_closing_checklists select policy missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.proposal_view_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot insert proposal_view_events';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.client_onboarding_tasks', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select client_onboarding_tasks';
  END IF;
END $$;
