-- Explicit Data API grants for base platform and CRM tables.
--
-- Supabase projects created or configured after the 2026-04-28 Data API change
-- may not expose SQL-created public tables through REST unless anon/authenticated
-- have table privileges. RLS remains enabled and is still the row-level boundary.

GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  readonly_table_name TEXT;
  writable_table_name TEXT;
  execution_table_name TEXT;
BEGIN
  FOREACH readonly_table_name IN ARRAY ARRAY[
    'organizations',
    'roles',
    'role_permissions',
    'memberships',
    'platform_modules',
    'packages',
    'package_modules',
    'contracts',
    'contract_modules',
    'blueprints',
    'blueprint_modules',
    'clients',
    'users'
  ]
  LOOP
    IF to_regclass(format('public.%I', readonly_table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', readonly_table_name);
    END IF;
  END LOOP;

  FOREACH writable_table_name IN ARRAY ARRAY[
    'leads',
    'interactions',
    'crm_pipelines',
    'crm_pipeline_stages',
    'crm_sequences',
    'crm_sequence_steps',
    'crm_sequence_enrollments',
    'crm_tasks',
    'lead_tasks',
    'lead_custom_field_values',
    'pipeline_templates',
    'pipeline_template_stages'
  ]
  LOOP
    IF to_regclass(format('public.%I', writable_table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', writable_table_name);
    END IF;
  END LOOP;

  FOREACH execution_table_name IN ARRAY ARRAY[
    'automation_executions'
  ]
  LOOP
    IF to_regclass(format('public.%I', execution_table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', execution_table_name);
    END IF;
  END LOOP;
END
$$;
