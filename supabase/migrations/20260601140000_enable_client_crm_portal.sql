-- Allow contracted client administrators to operate the CRM portal.

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('client_admin', 'crm.read'),
  ('client_admin', 'leads.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
