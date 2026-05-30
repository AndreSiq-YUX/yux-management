INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('client_admin', 'proposals.read'),
  ('client_admin', 'proposals.write'),
  ('client_member', 'proposals.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
