-- Optional entitlement only: no existing contract is enabled automatically.
INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES ('radar', 'Radar Comercial', FALSE, NULL, '/portal/comercial/radar', ARRAY['radar.read'])
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, base = EXCLUDED.base, internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route, required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES ('yux_manager', 'radar.read'), ('yux_manager', 'radar:manage'),
       ('client_admin', 'radar.read'), ('client_member', 'radar.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
