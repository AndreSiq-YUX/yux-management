-- Landing pages module security and integrity probes.

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing landing page tables'
  END AS landing_page_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'landing_pages',
    'landing_page_versions',
    'landing_page_forms',
    'landing_page_field_mappings',
    'landing_page_events',
    'landing_page_change_requests',
    'landing_page_approvals'
  );

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing landing page RLS'
  END AS landing_page_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'landing_pages',
    'landing_page_versions',
    'landing_page_forms',
    'landing_page_field_mappings',
    'landing_page_events',
    'landing_page_change_requests',
    'landing_page_approvals'
  )
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 13 THEN 'ok'
    ELSE 'missing landing page policies'
  END AS landing_page_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'landing_pages',
    'landing_page_versions',
    'landing_page_forms',
    'landing_page_field_mappings',
    'landing_page_events',
    'landing_page_change_requests',
    'landing_page_approvals'
  );

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing landing page private helpers'
  END AS landing_page_helpers_exist
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN (
    'can_read_landing_page_contract',
    'can_manage_landing_page_organization'
  );

SELECT
  CASE
    WHEN COUNT(*) = 15 THEN 'ok'
    ELSE 'missing landing page core columns'
  END AS landing_page_core_columns_exist
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'landing_pages'
  AND column_name IN (
    'organization_id',
    'client_id',
    'contract_id',
    'project_id',
    'campaign_id',
    'pipeline_id',
    'initial_stage_id',
    'preview_url',
    'published_url',
    'thumbnail_url',
    'primary_cta_type',
    'primary_cta_value',
    'status',
    'visits',
    'leads'
  );

SELECT
  CASE
    WHEN COUNT(*) >= 7 THEN 'ok'
    ELSE 'missing landing page indexes'
  END AS landing_page_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'landing_pages',
    'landing_page_versions',
    'landing_page_forms',
    'landing_page_field_mappings',
    'landing_page_events',
    'landing_page_change_requests',
    'landing_page_approvals'
  );
