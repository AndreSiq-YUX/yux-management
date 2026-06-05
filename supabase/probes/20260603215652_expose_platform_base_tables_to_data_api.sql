-- Verifies explicit Data API privileges required by platform context and CRM.

WITH expected(table_name, privilege_type) AS (
  VALUES
    ('organizations', 'SELECT'),
    ('roles', 'SELECT'),
    ('memberships', 'SELECT'),
    ('platform_modules', 'SELECT'),
    ('packages', 'SELECT'),
    ('contracts', 'SELECT'),
    ('contract_modules', 'SELECT'),
    ('leads', 'SELECT'),
    ('leads', 'INSERT'),
    ('leads', 'UPDATE'),
    ('interactions', 'SELECT'),
    ('crm_pipelines', 'SELECT'),
    ('crm_pipeline_stages', 'SELECT'),
    ('lead_tasks', 'SELECT'),
    ('automation_executions', 'UPDATE')
),
actual AS (
  SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee = 'authenticated'
)
SELECT expected.table_name, expected.privilege_type
FROM expected
LEFT JOIN actual USING (table_name, privilege_type)
WHERE to_regclass(format('public.%I', expected.table_name)) IS NOT NULL
  AND actual.table_name IS NULL;
