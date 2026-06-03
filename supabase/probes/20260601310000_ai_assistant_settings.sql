-- Configurable AI assistant settings probes.

SELECT
  CASE
    WHEN COUNT(*) = 6 THEN 'ok'
    ELSE 'missing AI assistant tables'
  END AS ai_assistant_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ai_assistants',
    'ai_assistant_objectives',
    'ai_assistant_required_fields',
    'ai_assistant_handoff_rules',
    'ai_assistant_safety_rules',
    'ai_assistant_knowledge_links'
  );

SELECT
  CASE
    WHEN COUNT(*) = 6 THEN 'ok'
    ELSE 'missing AI assistant RLS'
  END AS ai_assistant_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_assistants',
    'ai_assistant_objectives',
    'ai_assistant_required_fields',
    'ai_assistant_handoff_rules',
    'ai_assistant_safety_rules',
    'ai_assistant_knowledge_links'
  )
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 12 THEN 'ok'
    ELSE 'missing AI assistant policies'
  END AS ai_assistant_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_assistants',
    'ai_assistant_objectives',
    'ai_assistant_required_fields',
    'ai_assistant_handoff_rules',
    'ai_assistant_safety_rules',
    'ai_assistant_knowledge_links'
  );

SELECT
  CASE
    WHEN COUNT(*) = 6 THEN 'ok'
    ELSE 'missing AI assistant core columns'
  END AS ai_assistant_core_columns_exist
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ai_assistants'
  AND column_name IN (
    'organization_id',
    'client_id',
    'contract_id',
    'tone',
    'summary_enabled',
    'classification_enabled'
  );

SELECT
  CASE
    WHEN COUNT(*) >= 6 THEN 'ok'
    ELSE 'missing AI assistant indexes'
  END AS ai_assistant_indexes_exist
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_assistants',
    'ai_assistant_objectives',
    'ai_assistant_required_fields',
    'ai_assistant_handoff_rules',
    'ai_assistant_safety_rules',
    'ai_assistant_knowledge_links'
  );
