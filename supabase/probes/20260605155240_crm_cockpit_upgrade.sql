-- CRM cockpit upgrade security and integrity probes.

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN 'ok'
    ELSE 'missing CRM cockpit tables'
  END AS crm_cockpit_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'pipeline_templates',
    'pipeline_template_stages',
    'lead_custom_field_values',
    'lead_tasks'
  );

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN 'ok'
    ELSE 'missing CRM cockpit RLS'
  END AS crm_cockpit_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'pipeline_templates',
    'pipeline_template_stages',
    'lead_custom_field_values',
    'lead_tasks'
  )
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing CRM cockpit policies'
  END AS crm_cockpit_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'pipeline_templates',
    'pipeline_template_stages',
    'lead_custom_field_values',
    'lead_tasks'
  );

SELECT
  CASE
    WHEN COUNT(*) = 9 THEN 'ok'
    ELSE 'missing commercial lead columns'
  END AS crm_cockpit_lead_columns_exist
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads'
  AND column_name IN (
    'owner_id',
    'score',
    'lost_reason',
    'won_at',
    'lost_at',
    'last_activity_at',
    'next_follow_up_at',
    'source_kind',
    'attribution_context'
  );

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing CRM cockpit indexes'
  END AS crm_cockpit_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'pipeline_templates', 'pipeline_template_stages', 'lead_tasks')
  AND indexname IN (
    'idx_leads_owner_id',
    'idx_leads_status_stage',
    'idx_leads_last_activity',
    'idx_pipeline_templates_organization',
    'idx_pipeline_template_stages_template',
    'idx_lead_tasks_lead_due'
  );

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.pipeline_templates
      WHERE key = 'commercial_default'
        AND is_default = TRUE
    ) THEN 'ok'
    ELSE 'missing default commercial pipeline template'
  END AS crm_cockpit_default_template_seeded;

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing default commercial pipeline stages'
  END AS crm_cockpit_default_template_stages_seeded
FROM public.pipeline_template_stages pts
JOIN public.pipeline_templates pt ON pt.id = pts.template_id
WHERE pt.key = 'commercial_default';
