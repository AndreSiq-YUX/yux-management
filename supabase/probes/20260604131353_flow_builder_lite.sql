-- Flow Builder Lite probes.

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing automation flow tables'
  END AS automation_flow_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'automation_flows',
    'automation_triggers',
    'automation_conditions',
    'automation_actions',
    'automation_execution_runs',
    'automation_execution_steps',
    'automation_templates'
  );

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing automation flow RLS'
  END AS automation_flow_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'automation_flows',
    'automation_triggers',
    'automation_conditions',
    'automation_actions',
    'automation_execution_runs',
    'automation_execution_steps',
    'automation_templates'
  )
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 12 THEN 'ok'
    ELSE 'missing automation flow policies'
  END AS automation_flow_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'automation_flows',
    'automation_triggers',
    'automation_conditions',
    'automation_actions',
    'automation_execution_runs',
    'automation_execution_steps',
    'automation_templates'
  );

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing supported automation actions'
  END AS automation_actions_supported
FROM (
  VALUES ('create_task'), ('change_stage'), ('assign_owner'), ('send_whatsapp'), ('create_ticket'), ('update_field'), ('register_activity')
) AS expected(action_type)
WHERE EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'automation_actions'
    AND pg_get_constraintdef(c.oid) LIKE '%' || expected.action_type || '%'
);

SELECT
  CASE
    WHEN COUNT(*) >= 8 THEN 'ok'
    ELSE 'missing automation flow indexes'
  END AS automation_flow_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'automation_flows',
    'automation_triggers',
    'automation_conditions',
    'automation_actions',
    'automation_execution_runs',
    'automation_execution_steps',
    'automation_templates'
  );
