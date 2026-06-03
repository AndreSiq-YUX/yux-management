-- Commercial MVP module registry alignment.

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('yux_admin', 'landing_pages.read'),
  ('yux_admin', 'landing_pages.write'),
  ('yux_manager', 'landing_pages.read'),
  ('yux_manager', 'landing_pages.write'),
  ('client_admin', 'landing_pages.read'),
  ('client_member', 'landing_pages.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES
  ('landing_pages', 'Landing Pages', false, '/landing-pages', '/portal/landing-pages', ARRAY['landing_pages.read'])
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  base = EXCLUDED.base,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();

UPDATE public.platform_modules
SET name = CASE key
    WHEN 'crm' THEN 'CRM & Funis'
    WHEN 'whatsapp_ai' THEN 'Conversas IA'
    WHEN 'campaigns' THEN 'Campanhas'
    WHEN 'bi_reports' THEN 'Relatorios & ROI'
    ELSE name
  END,
  updated_at = NOW()
WHERE key IN ('crm', 'whatsapp_ai', 'campaigns', 'bi_reports');

INSERT INTO public.package_modules (package_id, module_key)
SELECT p.id, 'landing_pages'
FROM public.packages p
WHERE p.key IN ('maquina_comercial', 'software_sob_medida')
ON CONFLICT (package_id, module_key) DO NOTHING;

INSERT INTO public.blueprint_modules (blueprint_id, module_key)
SELECT b.id, 'landing_pages'
FROM public.blueprints b
WHERE b.key IN ('clinicas', 'imobiliarias', 'ecommerce', 'agencias')
ON CONFLICT (blueprint_id, module_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
