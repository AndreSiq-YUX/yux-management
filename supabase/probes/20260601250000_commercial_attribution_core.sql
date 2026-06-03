-- Commercial attribution security and integrity probes.

SELECT
  CASE
    WHEN COUNT(*) = 3 THEN 'ok'
    ELSE 'missing commercial attribution tables'
  END AS commercial_attribution_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('lead_sources', 'tracking_events', 'utm_sessions');

SELECT
  CASE
    WHEN COUNT(*) = 3 THEN 'ok'
    ELSE 'missing commercial attribution RLS'
  END AS commercial_attribution_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('lead_sources', 'tracking_events', 'utm_sessions')
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing commercial attribution policies'
  END AS commercial_attribution_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('lead_sources', 'tracking_events', 'utm_sessions');

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing private commercial attribution helpers'
  END AS commercial_attribution_helpers_exist
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN (
    'can_read_commercial_attribution',
    'can_manage_commercial_attribution'
  );

SELECT
  CASE
    WHEN COUNT(*) = 30 THEN 'ok'
    ELSE 'missing shared commercial attribution columns'
  END AS commercial_attribution_shared_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('lead_sources', 'tracking_events', 'utm_sessions')
  AND column_name IN (
    'organization_id',
    'client_id',
    'contract_id',
    'lead_id',
    'campaign_id',
    'landing_page_id',
    'conversation_id',
    'metadata',
    'created_at',
    'updated_at'
  );

SELECT
  CASE
    WHEN COUNT(*) = 3 THEN 'ok'
    ELSE 'landing page attribution hooks missing'
  END AS commercial_attribution_landing_page_hooks
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('lead_sources', 'tracking_events', 'utm_sessions')
  AND column_name = 'landing_page_id'
  AND data_type = 'uuid';

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing commercial attribution indexes'
  END AS commercial_attribution_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('lead_sources', 'tracking_events', 'utm_sessions')
  AND indexname IN (
    'idx_utm_sessions_organization_seen',
    'idx_utm_sessions_client_seen',
    'idx_lead_sources_organization_kind',
    'idx_lead_sources_client_touch',
    'idx_tracking_events_organization_occurred',
    'idx_tracking_events_client_occurred'
  );

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tracking_events'
        AND column_name = 'event_type'
    ) THEN 'ok'
    ELSE 'tracking event taxonomy missing'
  END AS commercial_tracking_event_taxonomy;
