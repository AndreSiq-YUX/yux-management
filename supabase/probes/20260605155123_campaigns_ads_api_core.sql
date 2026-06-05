-- Campaigns and Ads API-first core probes.

SELECT
  CASE
    WHEN COUNT(*) = 10 THEN 'ok'
    ELSE 'missing campaign API core tables'
  END AS campaign_api_core_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ad_provider_connections',
    'ad_accounts',
    'campaigns',
    'campaign_ad_sets',
    'campaign_ads',
    'campaign_creatives',
    'campaign_metric_snapshots',
    'campaign_recommendations',
    'campaign_alerts',
    'ad_provider_mutation_runs'
  );

SELECT
  CASE
    WHEN COUNT(*) = 10 THEN 'ok'
    ELSE 'missing campaign API core RLS'
  END AS campaign_api_core_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'ad_provider_connections',
    'ad_accounts',
    'campaigns',
    'campaign_ad_sets',
    'campaign_ads',
    'campaign_creatives',
    'campaign_metric_snapshots',
    'campaign_recommendations',
    'campaign_alerts',
    'ad_provider_mutation_runs'
  )
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 17 THEN 'ok'
    ELSE 'missing campaign API core policies'
  END AS campaign_api_core_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'ad_provider_connections',
    'ad_accounts',
    'campaigns',
    'campaign_ad_sets',
    'campaign_ads',
    'campaign_creatives',
    'campaign_metric_snapshots',
    'campaign_recommendations',
    'campaign_alerts',
    'ad_provider_mutation_runs'
  );

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN 'ok'
    ELSE 'provider connection states missing'
  END AS provider_connection_states_present
FROM (
  VALUES ('connected'), ('stale'), ('needs_reauth'), ('failed')
) AS expected(status)
WHERE EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'ad_provider_connections'
    AND pg_get_constraintdef(c.oid) LIKE '%' || expected.status || '%'
);

SELECT
  CASE
    WHEN COUNT(*) = 8 THEN 'ok'
    ELSE 'campaign lifecycle states missing'
  END AS campaign_lifecycle_states_present
FROM (
  VALUES ('draft'), ('pending_approval'), ('approved'), ('syncing'), ('active'), ('paused'), ('archived'), ('failed')
) AS expected(status)
WHERE EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'campaigns'
    AND pg_get_constraintdef(c.oid) LIKE '%' || expected.status || '%'
);

SELECT
  CASE
    WHEN COUNT(*) = 18 THEN 'ok'
    ELSE 'missing campaign API-first columns'
  END AS campaign_api_first_columns_exist
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'campaigns'
  AND column_name IN (
    'organization_id',
    'client_id',
    'contract_id',
    'provider_connection_id',
    'ad_account_id',
    'landing_page_id',
    'pipeline_id',
    'initial_stage_id',
    'provider',
    'objective',
    'lifecycle_status',
    'daily_budget',
    'total_budget',
    'attributed_revenue',
    'leads',
    'cpl',
    'mroi',
    'protected_error'
  );

SELECT
  CASE
    WHEN COUNT(*) >= 8 THEN 'ok'
    ELSE 'missing campaign API core indexes'
  END AS campaign_api_core_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'ad_provider_connections',
    'ad_accounts',
    'campaigns',
    'campaign_creatives',
    'campaign_metric_snapshots',
    'campaign_recommendations',
    'campaign_alerts',
    'ad_provider_mutation_runs'
  );
