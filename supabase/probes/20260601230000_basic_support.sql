-- Basic support security and integrity probes.

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing support RLS'
  END AS support_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('support_tickets', 'support_messages')
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'ok'
    ELSE 'missing support tables'
  END AS support_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('support_tickets', 'support_messages');

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing support policies'
  END AS support_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('support_tickets', 'support_messages');

SELECT
  CASE
    WHEN COUNT(*) = 3 THEN 'ok'
    ELSE 'missing private support helpers'
  END AS support_helpers_exist
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN (
    'can_read_support_contract',
    'can_create_support_ticket',
    'can_manage_support_organization'
  );

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.role_permissions
      WHERE role_key = 'client_member'
        AND permission_key = 'support.write'
    ) THEN 'ok'
    ELSE 'client_member lacks support write'
  END AS client_member_support_write;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.platform_modules
      WHERE key = 'support'
        AND internal_route = '/support'
        AND portal_route = '/portal/support'
        AND required_permissions = ARRAY['support.read']
    ) THEN 'ok'
    ELSE 'support module route metadata mismatch'
  END AS support_module_metadata;
