-- Commercial MVP module registry probes.

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.platform_modules
      WHERE key = 'landing_pages'
        AND name = 'Landing Pages'
        AND internal_route = '/landing-pages'
        AND portal_route = '/portal/landing-pages'
        AND required_permissions = ARRAY['landing_pages.read']
    ) THEN 'ok'
    ELSE 'landing_pages module metadata mismatch'
  END AS landing_pages_module_metadata;

SELECT
  CASE
    WHEN COUNT(*) = 6 THEN 'ok'
    ELSE 'missing landing_pages role permissions'
  END AS landing_pages_role_permissions
FROM public.role_permissions
WHERE (role_key, permission_key) IN (
  ('yux_admin', 'landing_pages.read'),
  ('yux_admin', 'landing_pages.write'),
  ('yux_manager', 'landing_pages.read'),
  ('yux_manager', 'landing_pages.write'),
  ('client_admin', 'landing_pages.read'),
  ('client_member', 'landing_pages.read')
);

SELECT
  CASE
    WHEN COUNT(*) = 4 THEN 'ok'
    ELSE 'commercial labels mismatch'
  END AS commercial_module_labels
FROM public.platform_modules
WHERE (key, name) IN (
  ('crm', 'CRM & Funis'),
  ('whatsapp_ai', 'Conversas IA'),
  ('campaigns', 'Campanhas'),
  ('bi_reports', 'Relatorios & ROI')
);

SELECT
  CASE
    WHEN COUNT(*) >= 2 THEN 'ok'
    ELSE 'landing_pages missing from commercial packages'
  END AS landing_pages_package_defaults
FROM public.package_modules pm
JOIN public.packages p ON p.id = pm.package_id
WHERE pm.module_key = 'landing_pages'
  AND p.key IN ('maquina_comercial', 'software_sob_medida');
