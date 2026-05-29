-- Add contract metadata fields used by the client portal.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS value DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('one_time','monthly','quarterly','yearly')),
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_starts_at
  ON public.contracts(starts_at);

CREATE INDEX IF NOT EXISTS idx_contracts_status_client
  ON public.contracts(client_id, status);

-- Demo client organization for portal filtering.
INSERT INTO public.organizations (id, name, slug, kind, client_id)
VALUES (
  '650e8400-e29b-41d4-a716-446655440101',
  'Empresa ABC Ltda',
  'empresa-abc',
  'client',
  '550e8400-e29b-41d4-a716-446655440001'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  kind = EXCLUDED.kind,
  client_id = EXCLUDED.client_id,
  updated_at = NOW();

-- Link the demo portal user only when the auth user exists.
INSERT INTO public.users (id, name, role)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'name', email),
  'CLIENT'::public.user_role
FROM auth.users
WHERE id = '33333333-3333-3333-3333-333333333333'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  updated_at = NOW();

UPDATE public.clients
SET
  user_id = '33333333-3333-3333-3333-333333333333',
  updated_at = NOW()
WHERE id = '550e8400-e29b-41d4-a716-446655440001'
  AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = '33333333-3333-3333-3333-333333333333'
  );

INSERT INTO public.memberships (user_id, organization_id, role_key)
SELECT
  '33333333-3333-3333-3333-333333333333',
  '650e8400-e29b-41d4-a716-446655440101',
  'client_admin'
WHERE EXISTS (
  SELECT 1
  FROM public.users
  WHERE id = '33333333-3333-3333-3333-333333333333'
)
ON CONFLICT (user_id, organization_id) DO UPDATE SET
  role_key = EXCLUDED.role_key,
  updated_at = NOW();

-- Demo contract for package-driven portal modules.
INSERT INTO public.contracts (
  id,
  client_id,
  package_id,
  name,
  status,
  starts_at,
  value,
  billing_cycle,
  notes
)
SELECT
  '660e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440001',
  p.id,
  'Contrato Maquina Comercial - Empresa ABC',
  'active',
  '2026-01-01',
  4500.00,
  'monthly',
  'Contrato demo para validar portal filtrado por modulos.'
FROM public.packages p
WHERE p.key = 'maquina_comercial'
ON CONFLICT (id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  package_id = EXCLUDED.package_id,
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  value = EXCLUDED.value,
  billing_cycle = EXCLUDED.billing_cycle,
  notes = EXCLUDED.notes,
  updated_at = NOW();

INSERT INTO public.contract_modules (contract_id, module_key, enabled)
VALUES
  ('660e8400-e29b-41d4-a716-446655440001', 'projects', true),
  ('660e8400-e29b-41d4-a716-446655440001', 'campaigns', true),
  ('660e8400-e29b-41d4-a716-446655440001', 'bi_reports', true),
  ('660e8400-e29b-41d4-a716-446655440001', 'support', true),
  ('660e8400-e29b-41d4-a716-446655440001', 'whatsapp_ai', true),
  ('660e8400-e29b-41d4-a716-446655440001', 'finance', false),
  ('660e8400-e29b-41d4-a716-446655440001', 'automations', false),
  ('660e8400-e29b-41d4-a716-446655440001', 'proposals', false),
  ('660e8400-e29b-41d4-a716-446655440001', 'blueprints', false)
ON CONFLICT (contract_id, module_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
