-- Operational reports probes.

SELECT
  CASE WHEN COUNT(*) = 3 THEN 'ok' ELSE 'missing report tables' END AS report_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('report_snapshots', 'report_widgets', 'report_metric_cache');

SELECT
  CASE WHEN COUNT(*) = 3 THEN 'ok' ELSE 'missing report RLS' END AS report_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('report_snapshots', 'report_widgets', 'report_metric_cache')
  AND rowsecurity = TRUE;

SELECT
  CASE WHEN COUNT(*) >= 6 THEN 'ok' ELSE 'missing report policies' END AS report_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('report_snapshots', 'report_widgets', 'report_metric_cache');

SELECT
  CASE WHEN COUNT(*) = 6 THEN 'ok' ELSE 'missing report aggregate columns' END AS report_columns_exist
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('report_snapshots', 'report_widgets', 'report_metric_cache')
  AND column_name IN ('metrics', 'scope', 'metric_key', 'metric_value', 'is_portal_visible', 'dimensions');
