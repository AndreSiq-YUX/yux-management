DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_sources', 'lead_attribution_events', 'lead_source_rollups',
    'campaign_crm_performance_snapshots', 'crm_revenue_attribution',
    'crm_mroi_alerts', 'crm_report_exports'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE EXCEPTION 'table missing: %', target_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target_table
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'rls disabled: %', target_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'primary_source_id'
  ) THEN
    RAISE EXCEPTION 'leads.primary_source_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'source_confidence'
  ) THEN
    RAISE EXCEPTION 'leads.source_confidence missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'crm_performance_status'
  ) THEN
    RAISE EXCEPTION 'campaigns.crm_performance_status missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'landing_pages' AND column_name = 'crm_source_id'
  ) THEN
    RAISE EXCEPTION 'landing_pages.crm_source_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'source_lead_id'
  ) THEN
    RAISE EXCEPTION 'proposals.source_lead_id missing';
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'source_lead_id'
  ) THEN
    RAISE EXCEPTION 'invoices.source_lead_id missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_sources'
      AND policyname = 'lead_sources_select_accessible'
  ) THEN
    RAISE EXCEPTION 'lead_sources select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_attribution_events'
      AND policyname = 'lead_attribution_events_insert_accessible'
  ) THEN
    RAISE EXCEPTION 'lead_attribution_events insert policy missing';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.lead_sources', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select lead_sources';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.lead_attribution_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated cannot insert lead_attribution_events';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.crm_report_exports', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot select crm_report_exports';
  END IF;

  IF NOT has_function_privilege('authenticated', 'private.can_access_crm_attribution(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute private.can_access_crm_attribution';
  END IF;
END $$;
