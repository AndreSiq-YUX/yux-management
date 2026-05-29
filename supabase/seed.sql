-- YUX Client Management System - seed data for local demos.
-- Assumes the migrations have been applied, including the stabilization schema.

INSERT INTO clients (
  id,
  company_name,
  contact_name,
  email,
  phone,
  website,
  sector,
  size,
  lead_source,
  acquisition_cost,
  lifetime_value,
  status,
  tags,
  communication_preferences
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440001',
  'Empresa ABC Ltda',
  'Joao Silva',
  'cliente1@empresa.com',
  '(11) 99999-9999',
  'https://empresaabc.com.br',
  'Tecnologia',
  'medium',
  'Google Ads',
  150.00,
  25000.00,
  'active',
  ARRAY['site', 'crm'],
  ARRAY['whatsapp', 'email']
),
(
  '550e8400-e29b-41d4-a716-446655440002',
  'XYZ Corporation',
  'Maria Santos',
  'cliente2@xyz.com',
  '(11) 88888-8888',
  'https://xyzcorp.com',
  'Varejo',
  'large',
  'Meta Ads',
  200.00,
  45000.00,
  'prospect',
  ARRAY['ecommerce'],
  ARRAY['whatsapp']
)
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  email = EXCLUDED.email,
  updated_at = NOW();

INSERT INTO projects (
  id,
  name,
  description,
  client_id,
  status,
  priority,
  type,
  start_date,
  expected_end_date,
  budget,
  currency,
  progress,
  tags
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440003',
  'Website Institucional ABC',
  'Desenvolvimento de website institucional moderno e responsivo',
  '550e8400-e29b-41d4-a716-446655440001',
  'ACTIVE',
  'HIGH',
  'WEBSITE',
  '2026-01-01',
  '2026-03-01',
  15000.00,
  'BRL',
  75,
  ARRAY['website', 'seo']
),
(
  '550e8400-e29b-41d4-a716-446655440004',
  'Sistema de E-commerce XYZ',
  'Plataforma completa de e-commerce com integracao de pagamentos',
  '550e8400-e29b-41d4-a716-446655440002',
  'PLANNING',
  'MEDIUM',
  'ECOMMERCE',
  '2026-02-01',
  '2026-06-01',
  35000.00,
  'BRL',
  10,
  ARRAY['ecommerce']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  type = EXCLUDED.type,
  updated_at = NOW();

INSERT INTO project_phases (
  id,
  project_id,
  name,
  description,
  status,
  start_date,
  end_date,
  progress,
  order_index
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440006',
  '550e8400-e29b-41d4-a716-446655440003',
  'Planejamento e Design',
  'Definicao de requisitos e criacao do design',
  'completed',
  '2026-01-01',
  '2026-01-15',
  100,
  1
),
(
  '550e8400-e29b-41d4-a716-446655440007',
  '550e8400-e29b-41d4-a716-446655440003',
  'Desenvolvimento',
  'Implementacao do website',
  'in_progress',
  '2026-01-16',
  '2026-02-20',
  60,
  2
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  progress = EXCLUDED.progress,
  updated_at = NOW();

INSERT INTO project_tasks (
  id,
  project_id,
  phase_id,
  title,
  description,
  status,
  priority,
  due_date,
  estimated_hours,
  order_index
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440011',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440006',
  'Aprovar wireframes',
  'Validar estrutura das paginas principais',
  'completed',
  'medium',
  '2026-01-12',
  4,
  1
),
(
  '550e8400-e29b-41d4-a716-446655440012',
  '550e8400-e29b-41d4-a716-446655440003',
  '550e8400-e29b-41d4-a716-446655440007',
  'Implementar home',
  'Criar primeira versao responsiva da home',
  'in_progress',
  'high',
  '2026-02-05',
  12,
  2
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  updated_at = NOW();

INSERT INTO campaigns (
  id,
  name,
  platform,
  external_id,
  status,
  budget,
  spent,
  impressions,
  clicks,
  conversions,
  cpc,
  ctr,
  roas,
  start_date,
  last_sync_at
) VALUES
(
  '550e8400-e29b-41d4-a716-446655440009',
  'Campanha Google Ads - Tecnologia',
  'GOOGLE',
  'gads_123456',
  'ACTIVE',
  5000.00,
  3200.00,
  125000,
  2500,
  45,
  1.28,
  2.0,
  3.2,
  '2026-01-01',
  NOW()
),
(
  '550e8400-e29b-41d4-a716-44665544000a',
  'Campanha Meta Ads - Varejo',
  'META',
  'meta_789012',
  'PAUSED',
  3000.00,
  2100.00,
  89000,
  1780,
  32,
  1.18,
  2.0,
  2.8,
  '2026-01-15',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  last_sync_at = NOW();

INSERT INTO leads (
  id,
  name,
  email,
  phone,
  company,
  source,
  stage,
  value,
  notes,
  campaign_id
) VALUES
(
  '550e8400-e29b-41d4-a716-44665544000c',
  'Pedro Oliveira',
  'pedro@startup.com',
  '(11) 77777-7777',
  'Startup Inovadora',
  'Google Ads',
  'QUALIFIED',
  20000.00,
  'Interessado em desenvolvimento de MVP',
  '550e8400-e29b-41d4-a716-446655440009'
),
(
  '550e8400-e29b-41d4-a716-44665544000d',
  'Ana Costa',
  'ana@loja.com',
  '(11) 66666-6666',
  'Loja Online',
  'Meta Ads',
  'PROPOSAL',
  12000.00,
  'Precisa de e-commerce basico',
  '550e8400-e29b-41d4-a716-44665544000a'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  stage = EXCLUDED.stage,
  value = EXCLUDED.value,
  updated_at = NOW();
