-- Sector blueprint funnel security and seed probes.

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing sector blueprint tables'
  END AS sector_blueprint_tables_exist
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'blueprint_pipeline_templates',
    'blueprint_pipeline_stages',
    'blueprint_custom_fields',
    'blueprint_message_templates',
    'blueprint_automation_templates',
    'blueprint_report_presets',
    'blueprint_application_runs'
  );

SELECT
  CASE
    WHEN COUNT(*) = 7 THEN 'ok'
    ELSE 'missing sector blueprint RLS'
  END AS sector_blueprint_rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'blueprint_pipeline_templates',
    'blueprint_pipeline_stages',
    'blueprint_custom_fields',
    'blueprint_message_templates',
    'blueprint_automation_templates',
    'blueprint_report_presets',
    'blueprint_application_runs'
  )
  AND rowsecurity = TRUE;

SELECT
  CASE
    WHEN COUNT(*) >= 7 THEN 'ok'
    ELSE 'missing sector blueprint policies'
  END AS sector_blueprint_policies_exist
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'blueprint_pipeline_templates',
    'blueprint_pipeline_stages',
    'blueprint_custom_fields',
    'blueprint_message_templates',
    'blueprint_automation_templates',
    'blueprint_report_presets',
    'blueprint_application_runs'
  );

SELECT
  CASE
    WHEN COUNT(*) >= 5 THEN 'ok'
    ELSE 'missing seeded sector pipeline templates'
  END AS sector_pipeline_templates_seeded
FROM public.blueprint_pipeline_templates;

SELECT
  CASE
    WHEN ARRAY_AGG(bps.name ORDER BY bps.order_index) = ARRAY[
      'Novo lead',
      'Triagem IA',
      'Agendamento pendente',
      'Consulta confirmada',
      'Compareceu',
      'Pos-consulta',
      'Reativacao futura'
    ] THEN 'ok'
    ELSE 'clinic funnel stage mismatch'
  END AS clinic_funnel_stages
FROM public.blueprint_pipeline_stages bps
JOIN public.blueprint_pipeline_templates bpt ON bpt.id = bps.template_id
JOIN public.blueprints b ON b.id = bpt.blueprint_id
WHERE b.key = 'clinicas'
  AND bpt.key = 'clinic_growth';

SELECT
  CASE
    WHEN COUNT(*) >= 5 THEN 'ok'
    ELSE 'missing sector custom fields'
  END AS sector_custom_fields_seeded
FROM public.blueprint_custom_fields;

SELECT
  CASE
    WHEN COUNT(*) >= 5 THEN 'ok'
    ELSE 'missing sector message templates'
  END AS sector_message_templates_seeded
FROM public.blueprint_message_templates;

SELECT
  CASE
    WHEN COUNT(*) >= 5 THEN 'ok'
    ELSE 'missing sector automation drafts'
  END AS sector_automation_templates_seeded
FROM public.blueprint_automation_templates
WHERE status = 'draft';

SELECT
  CASE
    WHEN COUNT(*) >= 5 THEN 'ok'
    ELSE 'missing sector report presets'
  END AS sector_report_presets_seeded
FROM public.blueprint_report_presets;
