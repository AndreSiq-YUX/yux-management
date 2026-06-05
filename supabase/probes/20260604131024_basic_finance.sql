-- Basic finance security and integrity probes.

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing finance RLS'
  END AS finance_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'billing_items')
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing finance tables'
  END AS finance_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('invoices', 'billing_items');

SELECT
  CASE
    WHEN COUNT(*) >= 4 THEN 'ok'
    ELSE 'missing finance policies'
  END AS finance_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'billing_items');

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing private finance helpers'
  END AS finance_helpers_exist
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN ('can_read_finance_contract', 'can_manage_finance_organization');

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.role_permissions
      WHERE role_key = 'client_member'
        AND permission_key = 'finance.read'
    ) THEN 'ok'
    ELSE 'client_member lacks finance read'
  END AS client_member_finance_read;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.platform_modules
      WHERE key = 'finance'
        AND internal_route = '/finance'
        AND portal_route = '/portal/finance'
        AND required_permissions = ARRAY['finance.read']
    ) THEN 'ok'
    ELSE 'finance module route metadata mismatch'
  END AS finance_module_metadata;
