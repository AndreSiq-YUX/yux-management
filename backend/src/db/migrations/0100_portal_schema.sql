-- Portal YUX self-hosted schema bootstrap.
-- Generated from reviewed Supabase migration files.
-- Application authorization is enforced by backend policies.
-- Supabase policies, storage buckets, auth triggers, Data API grants and PostgREST reloads are intentionally omitted.

-- source: 20260531000000_yux_os_clean_baseline.sql
-- YUX OS clean baseline for new Supabase projects.
-- This replaces the historical conflicting migration chain for fresh installs.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('ADMIN', 'MANAGER', 'CLIENT');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'CLIENT',
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL UNIQUE,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  website TEXT,
  sector TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('small', 'medium', 'large')),
  address JSONB,
  lead_source TEXT NOT NULL,
  acquisition_cost DECIMAL(15,2),
  lifetime_value DECIMAL(15,2),
  total_revenue DECIMAL(15,2) DEFAULT 0,
  average_project_value DECIMAL(15,2),
  projects_count INTEGER DEFAULT 0,
  last_interaction TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('active', 'inactive', 'prospect', 'churned')),
  notes TEXT,
  tags TEXT[],
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  preferred_technologies TEXT[],
  communication_preferences TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'PAUSED', 'CANCELLED', 'ARCHIVED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  type TEXT NOT NULL DEFAULT 'OTHER' CHECK (type IN ('WEBSITE', 'ECOMMERCE', 'MOBILE_APP', 'MARKETING', 'BRANDING', 'CONSULTING', 'OTHER')),
  service_level INTEGER CHECK (service_level IN (1, 2, 3)),
  start_date DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  actual_end_date DATE,
  budget DECIMAL(15,2) NOT NULL DEFAULT 0,
  actual_cost DECIMAL(15,2) DEFAULT 0,
  spent DECIMAL(15,2) DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  completed_tasks INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  team_members UUID[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_valid_dates CHECK (expected_end_date >= start_date),
  CONSTRAINT projects_valid_actual_end_date CHECK (actual_end_date IS NULL OR actual_end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'completed', 'on_hold')),
  start_date DATE,
  end_date DATE,
  budget DECIMAL(15,2) DEFAULT 0,
  actual_cost DECIMAL(15,2) DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_phases_valid_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  estimated_hours DECIMAL(8,2),
  actual_hours DECIMAL(8,2),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  platform TEXT NOT NULL DEFAULT 'GOOGLE' CHECK (platform IN ('GOOGLE', 'META')),
  external_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED')),
  budget DECIMAL(15,2) NOT NULL DEFAULT 0,
  spent DECIMAL(15,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  cpc DECIMAL(15,4) NOT NULL DEFAULT 0,
  ctr DECIMAL(8,4) NOT NULL DEFAULT 0,
  roas DECIMAL(8,4) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  target_audience JSONB,
  metrics JSONB,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  source TEXT NOT NULL DEFAULT 'Manual',
  stage TEXT NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST')),
  status TEXT,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  value DECIMAL(15,2),
  notes TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  converted_to_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interactions_reference CHECK (
    (client_id IS NOT NULL AND lead_id IS NULL) OR
    (client_id IS NULL AND lead_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('yux', 'client')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.roles (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('internal', 'client')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key TEXT NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES public.roles(key) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS public.platform_modules (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base BOOLEAN NOT NULL DEFAULT false,
  internal_route TEXT,
  portal_route TEXT,
  required_permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.package_modules (
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (package_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'cancelled', 'completed')),
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contract_modules (
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contract_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blueprint_modules (
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.platform_modules(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blueprint_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);

CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON public.project_phases(project_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON public.project_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts(client_id);

CREATE INDEX IF NOT EXISTS idx_blueprints_sector ON public.blueprints(sector);

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_phases_updated_at ON public.project_phases;

CREATE TRIGGER update_project_phases_updated_at BEFORE UPDATE ON public.project_phases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_tasks_updated_at ON public.project_tasks;

CREATE TRIGGER update_project_tasks_updated_at BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((UPPER(NEW.raw_user_meta_data->>'role'))::public.user_role, 'CLIENT')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.organizations (id, name, slug, kind)
VALUES ('650e8400-e29b-41d4-a716-446655440001', 'YUX Solucoes em IA', 'yux', 'yux')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, updated_at = NOW();

INSERT INTO public.roles (key, name, scope)
VALUES
  ('yux_admin', 'YUX Admin', 'internal'),
  ('yux_manager', 'YUX Manager', 'internal'),
  ('client_admin', 'Client Admin', 'client'),
  ('client_member', 'Client Member', 'client')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope, updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'platform.manage'),
  ('yux_manager', 'clients.read'), ('yux_manager', 'clients.write'),
  ('yux_manager', 'crm.read'), ('yux_manager', 'crm.write'),
  ('yux_manager', 'leads.read'), ('yux_manager', 'leads.write'),
  ('yux_manager', 'projects.read'), ('yux_manager', 'projects.write'),
  ('yux_manager', 'proposals.read'), ('yux_manager', 'proposals.write'),
  ('yux_manager', 'campaigns.read'), ('yux_manager', 'campaigns.write'),
  ('yux_manager', 'reports.read'), ('yux_manager', 'reports.write'),
  ('yux_manager', 'automations.read'), ('yux_manager', 'automations.write'),
  ('yux_manager', 'support.read'), ('yux_manager', 'support.write'),
  ('yux_manager', 'finance.read'), ('yux_manager', 'finance.write'),
  ('yux_manager', 'blueprints.read'), ('yux_manager', 'blueprints.write'),
  ('client_admin', 'projects.read'), ('client_admin', 'approvals.read'), ('client_admin', 'approvals.write'),
  ('client_admin', 'campaigns.read'), ('client_admin', 'reports.read'),
  ('client_admin', 'support.read'), ('client_admin', 'support.write'), ('client_admin', 'finance.read'),
  ('client_member', 'projects.read'), ('client_member', 'approvals.read'),
  ('client_member', 'campaigns.read'), ('client_member', 'reports.read'), ('client_member', 'support.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES
  ('clients', 'Clientes', true, '/clients', NULL, ARRAY['clients.read']),
  ('crm', 'CRM', false, '/leads', NULL, ARRAY['crm.read','leads.read']),
  ('projects', 'Projetos e Entregas', true, '/projects', '/portal/projects', ARRAY['projects.read']),
  ('proposals', 'Propostas', false, '/proposals', NULL, ARRAY['proposals.read']),
  ('whatsapp_ai', 'WhatsApp IA', false, '/whatsapp-ai', '/portal/whatsapp-ai', ARRAY['support.read']),
  ('campaigns', 'Campanhas e Ads', false, '/campaigns', '/portal/campaigns', ARRAY['campaigns.read']),
  ('bi_reports', 'BI e Relatorios', false, '/reports', '/portal/reports', ARRAY['reports.read']),
  ('automations', 'Automacoes', false, '/automations', NULL, ARRAY['automations.read']),
  ('support', 'Suporte', true, '/support', '/portal/support', ARRAY['support.read']),
  ('finance', 'Financeiro', false, '/finance', '/portal/finance', ARRAY['finance.read']),
  ('blueprints', 'Blueprints', false, '/blueprints', NULL, ARRAY['blueprints.read'])
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  base = EXCLUDED.base,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();

INSERT INTO public.packages (key, name, description)
VALUES
  ('presenca_digital_ia', 'Presenca Digital + IA', 'Entrada com site, formulario de leads, portal, WhatsApp basico e relatorio simples.'),
  ('atendimento_inteligente', 'Atendimento Inteligente', 'WhatsApp IA, base de conhecimento, qualificacao, CRM basico, follow-up e agenda.'),
  ('maquina_comercial', 'Maquina Comercial', 'CRM, WhatsApp IA, campanhas, landing pages, automacoes, follow-up, ROI e relatorios.'),
  ('operacao_inteligente', 'Operacao Inteligente', 'Automacoes de processos, BI, integracoes, financeiro, atendimento e treinamento.'),
  ('software_sob_medida', 'Software Sob Medida', 'App, portal, dashboard, IA customizada, integracoes, banco de dados e suporte evolutivo.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = NOW();

WITH package_map(package_key, module_key) AS (
  VALUES
    ('presenca_digital_ia', 'clients'), ('presenca_digital_ia', 'projects'), ('presenca_digital_ia', 'support'), ('presenca_digital_ia', 'whatsapp_ai'), ('presenca_digital_ia', 'bi_reports'),
    ('atendimento_inteligente', 'clients'), ('atendimento_inteligente', 'crm'), ('atendimento_inteligente', 'projects'), ('atendimento_inteligente', 'support'), ('atendimento_inteligente', 'whatsapp_ai'), ('atendimento_inteligente', 'bi_reports'),
    ('maquina_comercial', 'clients'), ('maquina_comercial', 'crm'), ('maquina_comercial', 'projects'), ('maquina_comercial', 'proposals'), ('maquina_comercial', 'whatsapp_ai'), ('maquina_comercial', 'campaigns'), ('maquina_comercial', 'bi_reports'), ('maquina_comercial', 'automations'), ('maquina_comercial', 'support'),
    ('operacao_inteligente', 'clients'), ('operacao_inteligente', 'projects'), ('operacao_inteligente', 'bi_reports'), ('operacao_inteligente', 'automations'), ('operacao_inteligente', 'support'), ('operacao_inteligente', 'finance'),
    ('software_sob_medida', 'clients'), ('software_sob_medida', 'crm'), ('software_sob_medida', 'projects'), ('software_sob_medida', 'proposals'), ('software_sob_medida', 'whatsapp_ai'), ('software_sob_medida', 'campaigns'), ('software_sob_medida', 'bi_reports'), ('software_sob_medida', 'automations'), ('software_sob_medida', 'support'), ('software_sob_medida', 'finance'), ('software_sob_medida', 'blueprints')
)
INSERT INTO public.package_modules (package_id, module_key)
SELECT p.id, pm.module_key
FROM package_map pm
JOIN public.packages p ON p.key = pm.package_key
ON CONFLICT (package_id, module_key) DO NOTHING;

INSERT INTO public.blueprints (key, name, sector, description)
VALUES
  ('clinicas', 'Clinicas', 'Saude', 'Blueprint para clinicas com atendimento, agenda, CRM e relatorios.'),
  ('imobiliarias', 'Imobiliarias', 'Imobiliario', 'Blueprint para funil de imoveis, leads, propostas e atendimento.'),
  ('revendas_carro', 'Revendas de Carro', 'Automotivo', 'Blueprint para qualificacao, propostas, campanhas e acompanhamento comercial.'),
  ('escolas', 'Escolas', 'Educacao', 'Blueprint para captacao de alunos, atendimento, campanhas e relatorios.'),
  ('ecommerce', 'E-commerce', 'Varejo Online', 'Blueprint para campanhas, ROI, automacoes e suporte.'),
  ('agencias', 'Agencias', 'Servicos', 'Blueprint para projetos, entregas, propostas, CRM e relatorios.'),
  ('consultorias', 'Consultorias', 'Servicos B2B', 'Blueprint para pipeline consultivo, propostas e BI.'),
  ('turismo', 'Turismo', 'Turismo', 'Blueprint para atendimento, CRM, campanhas e agenda.'),
  ('industria_b2b', 'Industria B2B', 'Industria', 'Blueprint para vendas complexas, CRM, propostas e automacoes.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector, description = EXCLUDED.description, updated_at = NOW();

WITH blueprint_map(blueprint_key, module_key) AS (
  VALUES
    ('clinicas', 'clients'), ('clinicas', 'crm'), ('clinicas', 'projects'), ('clinicas', 'whatsapp_ai'), ('clinicas', 'campaigns'), ('clinicas', 'bi_reports'), ('clinicas', 'support'),
    ('imobiliarias', 'clients'), ('imobiliarias', 'crm'), ('imobiliarias', 'projects'), ('imobiliarias', 'proposals'), ('imobiliarias', 'whatsapp_ai'), ('imobiliarias', 'campaigns'), ('imobiliarias', 'bi_reports'),
    ('revendas_carro', 'clients'), ('revendas_carro', 'crm'), ('revendas_carro', 'proposals'), ('revendas_carro', 'whatsapp_ai'), ('revendas_carro', 'campaigns'), ('revendas_carro', 'bi_reports'),
    ('escolas', 'clients'), ('escolas', 'crm'), ('escolas', 'projects'), ('escolas', 'whatsapp_ai'), ('escolas', 'campaigns'), ('escolas', 'bi_reports'),
    ('ecommerce', 'clients'), ('ecommerce', 'crm'), ('ecommerce', 'projects'), ('ecommerce', 'campaigns'), ('ecommerce', 'bi_reports'), ('ecommerce', 'automations'), ('ecommerce', 'support'),
    ('agencias', 'clients'), ('agencias', 'crm'), ('agencias', 'projects'), ('agencias', 'proposals'), ('agencias', 'campaigns'), ('agencias', 'bi_reports'), ('agencias', 'support'),
    ('consultorias', 'clients'), ('consultorias', 'crm'), ('consultorias', 'projects'), ('consultorias', 'proposals'), ('consultorias', 'bi_reports'), ('consultorias', 'automations'),
    ('turismo', 'clients'), ('turismo', 'crm'), ('turismo', 'whatsapp_ai'), ('turismo', 'campaigns'), ('turismo', 'bi_reports'), ('turismo', 'support'),
    ('industria_b2b', 'clients'), ('industria_b2b', 'crm'), ('industria_b2b', 'projects'), ('industria_b2b', 'proposals'), ('industria_b2b', 'automations'), ('industria_b2b', 'bi_reports')
)
INSERT INTO public.blueprint_modules (blueprint_id, module_key)
SELECT b.id, bm.module_key
FROM blueprint_map bm
JOIN public.blueprints b ON b.key = bm.blueprint_key
ON CONFLICT (blueprint_id, module_key) DO NOTHING;

INSERT INTO public.clients (
  id, company_name, contact_name, email, phone, website, sector, size,
  lead_source, acquisition_cost, lifetime_value, status, tags, communication_preferences
) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Empresa ABC Ltda', 'Joao Silva', 'cliente1@empresa.com', '(11) 99999-9999', 'https://empresaabc.com.br', 'Tecnologia', 'medium', 'Google Ads', 150.00, 25000.00, 'active', ARRAY['site', 'crm'], ARRAY['whatsapp', 'email']),
  ('550e8400-e29b-41d4-a716-446655440002', 'XYZ Corporation', 'Maria Santos', 'cliente2@xyz.com', '(11) 88888-8888', 'https://xyzcorp.com', 'Varejo', 'large', 'Meta Ads', 200.00, 45000.00, 'prospect', ARRAY['ecommerce'], ARRAY['whatsapp'])
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  email = EXCLUDED.email,
  updated_at = NOW();

INSERT INTO public.projects (
  id, name, description, client_id, status, priority, type, start_date,
  expected_end_date, budget, currency, progress, tags
) VALUES
  ('550e8400-e29b-41d4-a716-446655440003', 'Website Institucional ABC', 'Desenvolvimento de website institucional moderno e responsivo', '550e8400-e29b-41d4-a716-446655440001', 'ACTIVE', 'HIGH', 'WEBSITE', '2026-01-01', '2026-03-01', 15000.00, 'BRL', 75, ARRAY['website', 'seo']),
  ('550e8400-e29b-41d4-a716-446655440004', 'Sistema de E-commerce XYZ', 'Plataforma completa de e-commerce com integracao de pagamentos', '550e8400-e29b-41d4-a716-446655440002', 'PLANNING', 'MEDIUM', 'ECOMMERCE', '2026-02-01', '2026-06-01', 35000.00, 'BRL', 10, ARRAY['ecommerce'])
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW();

INSERT INTO public.campaigns (
  id, name, platform, external_id, status, budget, spent, impressions, clicks,
  conversions, cpc, ctr, roas, start_date, last_sync_at
) VALUES
  ('550e8400-e29b-41d4-a716-446655440009', 'Campanha Google Ads - Tecnologia', 'GOOGLE', 'gads_123456', 'ACTIVE', 5000.00, 3200.00, 125000, 2500, 45, 1.28, 2.0, 3.2, '2026-01-01', NOW()),
  ('550e8400-e29b-41d4-a716-44665544000a', 'Campanha Meta Ads - Varejo', 'META', 'meta_789012', 'PAUSED', 3000.00, 2100.00, 89000, 1780, 32, 1.18, 2.0, 2.8, '2026-01-15', NOW())
ON CONFLICT (platform, external_id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, last_sync_at = NOW();

INSERT INTO public.leads (
  id, name, email, phone, company, source, stage, value, notes, campaign_id
) VALUES
  ('550e8400-e29b-41d4-a716-44665544000c', 'Pedro Oliveira', 'pedro@startup.com', '(11) 77777-7777', 'Startup Inovadora', 'Google Ads', 'QUALIFIED', 20000.00, 'Interessado em desenvolvimento de MVP', '550e8400-e29b-41d4-a716-446655440009'),
  ('550e8400-e29b-41d4-a716-44665544000d', 'Ana Costa', 'ana@loja.com', '(11) 66666-6666', 'Loja Online', 'Meta Ads', 'PROPOSAL', 12000.00, 'Precisa de e-commerce basico', '550e8400-e29b-41d4-a716-44665544000a')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, stage = EXCLUDED.stage, value = EXCLUDED.value, updated_at = NOW();


-- source: 20260601000000_contracts_modules_portal.sql
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


-- source: 20260601010000_contract_rls_policies.sql

-- source: 20260601020000_harden_portal_rls.sql
-- Harden exposed tables used by the internal app and client portal.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.is_internal_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.can_access_client(target_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_instance(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.can_manage_crm_instance(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.crm_member_role(target_instance_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT 'yux_admin'::TEXT;
$$;

CREATE OR REPLACE FUNCTION private.current_crm_member_id(target_instance_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::UUID;
$$;

CREATE OR REPLACE FUNCTION private.can_access_portal_proposal(target_proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.has_active_omnichannel_contract(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.has_omnichannel_permission(target_organization_id UUID, target_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.can_supervise_omnichannel()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_storage_object(bucket_id TEXT, object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.has_marketing_studio_permission(target_organization_id UUID, target_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT TRUE;
$$;

CREATE OR REPLACE FUNCTION private.record_deliverable_created()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.record_approval_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_project(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = target_project_id
      AND private.can_access_client(p.client_id)
  );
$$;

REVOKE ALL ON FUNCTION private.is_internal_user() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_client(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_project(UUID) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.can_read_contract(UUID);

DROP FUNCTION IF EXISTS public.is_internal_user();


-- source: 20260601030000_secure_baseline_functions.sql
-- Harden baseline trigger functions after the first remote deployment.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'CLIENT'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';


-- source: 20260601040000_move_auth_trigger_private.sql
-- Move privileged trigger code out of the exposed public schema.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'CLIENT'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

DROP FUNCTION IF EXISTS public.handle_new_user();

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;


-- source: 20260601050000_install_updated_at_triggers.sql
-- Repair updated_at triggers expected by the baseline on the remote project.

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_phases_updated_at ON public.project_phases;

CREATE TRIGGER update_project_phases_updated_at
  BEFORE UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_tasks_updated_at ON public.project_tasks;

CREATE TRIGGER update_project_tasks_updated_at
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260601060000_install_config_updated_at_triggers.sql
-- Keep audit timestamps database-owned for configurable platform records.

DROP TRIGGER IF EXISTS update_blueprints_updated_at ON public.blueprints;

CREATE TRIGGER update_blueprints_updated_at
  BEFORE UPDATE ON public.blueprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contract_modules_updated_at ON public.contract_modules;

CREATE TRIGGER update_contract_modules_updated_at
  BEFORE UPDATE ON public.contract_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_memberships_updated_at ON public.memberships;

CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_packages_updated_at ON public.packages;

CREATE TRIGGER update_packages_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_modules_updated_at ON public.platform_modules;

CREATE TRIGGER update_platform_modules_updated_at
  BEFORE UPDATE ON public.platform_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_roles_updated_at ON public.roles;

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260601070000_project_delivery_approvals.sql
-- Project delivery workflow: client-visible tasks, deliverables, approvals, and timeline.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.project_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'delivered', 'in_review', 'approved', 'changes_requested', 'rejected')),
  due_date DATE,
  delivered_at TIMESTAMPTZ,
  external_url TEXT,
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('deliverable', 'document', 'creative')),
  target_id UUID NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected', 'cancelled')),
  is_client_visible BOOLEAN NOT NULL DEFAULT true,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
  comment TEXT,
  decided_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_decisions_comment_required CHECK (
    decision = 'approved' OR NULLIF(BTRIM(comment), '') IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.project_timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL DEFAULT 'manual_update'
    CHECK (entry_type IN ('manual_update', 'deliverable_created', 'approval_requested', 'approval_decided', 'status_changed')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'automatic')),
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_deliverables_project_id
  ON public.project_deliverables(project_id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_project_id
  ON public.approval_requests(project_id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_target
  ON public.approval_requests(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_request_id
  ON public.approval_decisions(approval_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_timeline_entries_project_id
  ON public.project_timeline_entries(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.can_access_approval_request(target_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_requests ar
    WHERE ar.id = target_request_id
      AND ar.is_client_visible
      AND private.can_access_project(ar.project_id)
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_approval_request(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.record_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_request public.approval_requests%ROWTYPE;
BEGIN
  UPDATE public.approval_requests
  SET status = NEW.decision, decided_at = NEW.created_at, updated_at = NOW()
  WHERE id = NEW.approval_request_id
  RETURNING * INTO target_request;

  INSERT INTO public.project_timeline_entries (
    project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by
  ) VALUES (
    target_request.project_id,
    'approval_decided',
    CASE NEW.decision
      WHEN 'approved' THEN 'Item aprovado'
      WHEN 'changes_requested' THEN 'Ajustes solicitados'
      ELSE 'Item rejeitado'
    END,
    NEW.comment,
    jsonb_build_object('approval_request_id', NEW.approval_request_id, 'decision_id', NEW.id, 'decision', NEW.decision),
    'automatic',
    target_request.is_client_visible,
    NEW.decided_by
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_deliverable_created() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.record_approval_requested() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.record_approval_decision() FROM PUBLIC;

DROP TRIGGER IF EXISTS record_deliverable_created ON public.project_deliverables;

CREATE TRIGGER record_deliverable_created
  AFTER INSERT ON public.project_deliverables
  FOR EACH ROW EXECUTE FUNCTION private.record_deliverable_created();

DROP TRIGGER IF EXISTS record_approval_requested ON public.approval_requests;

CREATE TRIGGER record_approval_requested
  AFTER INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION private.record_approval_requested();

DROP TRIGGER IF EXISTS record_approval_decision ON public.approval_decisions;

CREATE TRIGGER record_approval_decision
  AFTER INSERT ON public.approval_decisions
  FOR EACH ROW EXECUTE FUNCTION private.record_approval_decision();

DROP TRIGGER IF EXISTS update_project_deliverables_updated_at ON public.project_deliverables;

CREATE TRIGGER update_project_deliverables_updated_at
  BEFORE UPDATE ON public.project_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_approval_requests_updated_at ON public.approval_requests;

CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260601080000_optimize_project_delivery_approvals.sql
CREATE INDEX IF NOT EXISTS idx_project_deliverables_created_by
  ON public.project_deliverables(created_by);

CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
  ON public.approval_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_decided_by
  ON public.approval_decisions(decided_by);

CREATE INDEX IF NOT EXISTS idx_project_timeline_entries_created_by
  ON public.project_timeline_entries(created_by);


-- source: 20260601090000_harden_project_delivery_workflow.sql
-- Keep generic approvals safe while only deliverables are implemented.

CREATE OR REPLACE FUNCTION private.validate_approval_request_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.target_type = 'deliverable' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.project_deliverables d
      WHERE d.id = NEW.target_id
        AND d.project_id = NEW.project_id
        AND d.is_client_visible
    ) THEN
      RAISE EXCEPTION 'Approval target must be a visible deliverable from the same project';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Approval target type % is not available yet', NEW.target_type;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_approval_request_target() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_approval_request_target ON public.approval_requests;

CREATE TRIGGER validate_approval_request_target
  BEFORE INSERT OR UPDATE OF project_id, target_type, target_id ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION private.validate_approval_request_target();

CREATE OR REPLACE FUNCTION private.record_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_request public.approval_requests%ROWTYPE;
BEGIN
  UPDATE public.approval_requests
  SET status = NEW.decision, decided_at = NEW.created_at, updated_at = NOW()
  WHERE id = NEW.approval_request_id
  RETURNING * INTO target_request;

  IF target_request.target_type = 'deliverable' THEN
    UPDATE public.project_deliverables
    SET status = NEW.decision, updated_at = NOW()
    WHERE id = target_request.target_id
      AND project_id = target_request.project_id;
  END IF;

  INSERT INTO public.project_timeline_entries (
    project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by
  ) VALUES (
    target_request.project_id,
    'approval_decided',
    CASE NEW.decision
      WHEN 'approved' THEN 'Item aprovado'
      WHEN 'changes_requested' THEN 'Ajustes solicitados'
      ELSE 'Item rejeitado'
    END,
    NEW.comment,
    jsonb_build_object('approval_request_id', NEW.approval_request_id, 'decision_id', NEW.id, 'decision', NEW.decision),
    'automatic',
    target_request.is_client_visible,
    NEW.decided_by
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_approval_decision() FROM PUBLIC;


-- source: 20260601100000_backfill_deliverable_approval_status.sql
-- Synchronize deliverables that received decisions before status propagation existed.

UPDATE public.project_deliverables d
SET status = latest.status,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (ar.target_id)
    ar.target_id,
    ar.status
  FROM public.approval_requests ar
  WHERE ar.target_type = 'deliverable'
    AND ar.status IN ('approved', 'changes_requested', 'rejected')
  ORDER BY ar.target_id, ar.decided_at DESC NULLS LAST, ar.updated_at DESC
) latest
WHERE d.id = latest.target_id
  AND d.status IS DISTINCT FROM latest.status;


-- source: 20260601105000_ensure_interactions_for_crm.sql
-- Some clean remote projects were created before interactions became part of the baseline.

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interactions_reference CHECK (
    (client_id IS NOT NULL AND lead_id IS NULL) OR
    (client_id IS NULL AND lead_id IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS update_interactions_updated_at ON public.interactions;

CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260601110000_multitenant_crm_automation.sql
-- Multi-organization CRM with configurable pipelines and traceable follow-up automation.

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_id, key),
  CONSTRAINT crm_pipeline_stage_outcome CHECK (NOT (is_won AND is_lost))
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interactions_reference CHECK (
    (client_id IS NOT NULL AND lead_id IS NULL) OR
    (client_id IS NULL AND lead_id IS NOT NULL)
  )
);

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.crm_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('whatsapp', 'email', 'internal_task')),
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  subject TEXT,
  body TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sequence_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.crm_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'manual', 'completed', 'cancelled')),
  current_step_index INTEGER NOT NULL DEFAULT 0 CHECK (current_step_index >= 0),
  next_execution_at TIMESTAMPTZ,
  manual_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.crm_sequence_enrollments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ NOT NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.crm_sequence_enrollments(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.crm_sequence_steps(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('whatsapp', 'email', 'internal_task')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_organization_id ON public.crm_pipelines(organization_id);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_pipeline_id ON public.crm_pipeline_stages(pipeline_id, order_index);

CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON public.leads(organization_id);

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_id ON public.leads(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON public.leads(stage_id);

CREATE INDEX IF NOT EXISTS idx_interactions_organization_id ON public.interactions(organization_id);

CREATE INDEX IF NOT EXISTS idx_crm_sequences_organization_id ON public.crm_sequences(organization_id);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_steps_sequence_id ON public.crm_sequence_steps(sequence_id, order_index);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_organization_id ON public.crm_sequence_enrollments(organization_id);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_lead_id ON public.crm_sequence_enrollments(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_organization_id ON public.crm_tasks(organization_id);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead_id ON public.crm_tasks(lead_id);

CREATE INDEX IF NOT EXISTS idx_automation_executions_organization_id ON public.automation_executions(organization_id);

CREATE INDEX IF NOT EXISTS idx_automation_executions_lead_id ON public.automation_executions(lead_id);

INSERT INTO public.crm_pipelines (id, organization_id, name, description, is_default)
SELECT '880e8400-e29b-41d4-a716-446655440001', o.id, 'Comercial YUX', 'Pipeline comercial padrao', true
FROM public.organizations o
WHERE o.slug = 'yux'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.crm_pipelines (id, organization_id, name, description, is_default)
SELECT gen_random_uuid(), o.id, 'Comercial', 'Pipeline comercial padrao', true
FROM public.organizations o
WHERE o.kind = 'client'
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.crm_pipeline_stages (pipeline_id, key, name, color, order_index, is_won, is_lost)
SELECT p.id, stage.key, stage.name, stage.color, stage.order_index, stage.is_won, stage.is_lost
FROM public.crm_pipelines p
CROSS JOIN (
  VALUES
    ('new', 'Novo', '#64748b', 0, false, false),
    ('qualified', 'Qualificado', '#2563eb', 1, false, false),
    ('proposal', 'Proposta', '#7c3aed', 2, false, false),
    ('negotiation', 'Negociacao', '#d97706', 3, false, false),
    ('won', 'Ganho', '#16a34a', 4, true, false),
    ('lost', 'Perdido', '#dc2626', 5, false, true)
) AS stage(key, name, color, order_index, is_won, is_lost)
ON CONFLICT (pipeline_id, key) DO NOTHING;

UPDATE public.leads l
SET organization_id = o.id,
    pipeline_id = p.id,
    stage_id = s.id
FROM public.organizations o
JOIN public.crm_pipelines p ON p.organization_id = o.id AND p.is_default
JOIN public.crm_pipeline_stages s ON s.pipeline_id = p.id
WHERE o.slug = 'yux'
  AND l.organization_id IS NULL
  AND s.key = LOWER(l.stage);

CREATE OR REPLACE FUNCTION private.can_access_crm_pipeline(target_pipeline_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_pipelines p
    WHERE p.id = target_pipeline_id
      AND private.can_access_crm_organization(p.organization_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_lead(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = target_lead_id
      AND private.can_access_crm_organization(l.organization_id)
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_crm_organization(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_crm_pipeline(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_crm_lead(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.validate_crm_lead_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.pipeline_id IS NOT NULL AND NEW.stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crm_pipelines p
    JOIN public.crm_pipeline_stages s ON s.pipeline_id = p.id
    WHERE p.id = NEW.pipeline_id
      AND p.organization_id = NEW.organization_id
      AND s.id = NEW.stage_id
  ) THEN
    RAISE EXCEPTION 'CRM stage must belong to the lead pipeline and organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_crm_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_sequences s
    JOIN public.leads l ON l.id = NEW.lead_id
    WHERE s.id = NEW.sequence_id
      AND s.organization_id = NEW.organization_id
      AND l.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'CRM enrollment records must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_crm_lead_stage ON public.leads;

CREATE TRIGGER validate_crm_lead_stage
  BEFORE INSERT OR UPDATE OF organization_id, pipeline_id, stage_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION private.validate_crm_lead_stage();

DROP TRIGGER IF EXISTS validate_crm_enrollment ON public.crm_sequence_enrollments;

CREATE TRIGGER validate_crm_enrollment
  BEFORE INSERT OR UPDATE OF organization_id, sequence_id, lead_id ON public.crm_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.validate_crm_enrollment();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'crm_pipelines', 'crm_pipeline_stages', 'crm_sequences', 'crm_sequence_steps',
    'crm_sequence_enrollments', 'crm_tasks', 'interactions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;


-- source: 20260601120000_optimize_multitenant_crm.sql
-- Index new CRM foreign keys and enable CRM in the demo machine-commercial contract.

CREATE INDEX IF NOT EXISTS idx_automation_executions_enrollment_id
  ON public.automation_executions(enrollment_id);

CREATE INDEX IF NOT EXISTS idx_automation_executions_step_id
  ON public.automation_executions(step_id);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_sequence_id
  ON public.crm_sequence_enrollments(sequence_id);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_to
  ON public.crm_tasks(assigned_to);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_enrollment_id
  ON public.crm_tasks(enrollment_id);

CREATE INDEX IF NOT EXISTS idx_interactions_client_id
  ON public.interactions(client_id);

CREATE INDEX IF NOT EXISTS idx_interactions_lead_id
  ON public.interactions(lead_id);

INSERT INTO public.contract_modules (contract_id, module_key, enabled)
SELECT c.id, 'crm', true
FROM public.contracts c
WHERE c.status = 'active'
  AND c.name = 'Contrato Maquina Comercial - Empresa ABC'
ON CONFLICT (contract_id, module_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();


-- source: 20260601130000_enqueue_crm_follow_up.sql
-- Enqueue the first active sequence step when a lead enters a follow-up sequence.

ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_automation_executions_due
  ON public.automation_executions(status, scheduled_at);

CREATE OR REPLACE FUNCTION private.enqueue_first_crm_sequence_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  first_step public.crm_sequence_steps%ROWTYPE;
  execute_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO first_step
  FROM public.crm_sequence_steps
  WHERE sequence_id = NEW.sequence_id
    AND is_active
  ORDER BY order_index
  LIMIT 1;

  IF first_step.id IS NULL THEN
    RETURN NEW;
  END IF;

  execute_at := COALESCE(NEW.next_execution_at, NOW()) + make_interval(mins => first_step.delay_minutes);

  UPDATE public.crm_sequence_enrollments
  SET next_execution_at = execute_at
  WHERE id = NEW.id;

  INSERT INTO public.automation_executions (
    organization_id, lead_id, enrollment_id, step_id, action_type, payload, scheduled_at
  ) VALUES (
    NEW.organization_id,
    NEW.lead_id,
    NEW.id,
    first_step.id,
    first_step.action_type,
    jsonb_build_object('subject', first_step.subject, 'body', first_step.body),
    execute_at
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_first_crm_sequence_step() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_first_crm_sequence_step ON public.crm_sequence_enrollments;

CREATE TRIGGER enqueue_first_crm_sequence_step
  AFTER INSERT ON public.crm_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.enqueue_first_crm_sequence_step();

CREATE OR REPLACE FUNCTION private.validate_crm_lead_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = NEW.lead_id
      AND l.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'CRM record and lead must belong to the same organization';
  END IF;

  IF TG_TABLE_NAME IN ('crm_tasks', 'automation_executions')
    AND NEW.enrollment_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.crm_sequence_enrollments e
      WHERE e.id = NEW.enrollment_id
        AND e.organization_id = NEW.organization_id
        AND e.lead_id = NEW.lead_id
    )
  THEN
    RAISE EXCEPTION 'CRM record and enrollment must belong to the same lead and organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_crm_task_organization ON public.crm_tasks;

CREATE TRIGGER validate_crm_task_organization
  BEFORE INSERT OR UPDATE OF organization_id, lead_id, enrollment_id ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION private.validate_crm_lead_organization();

DROP TRIGGER IF EXISTS validate_automation_execution_organization ON public.automation_executions;

CREATE TRIGGER validate_automation_execution_organization
  BEFORE INSERT OR UPDATE OF organization_id, lead_id, enrollment_id ON public.automation_executions
  FOR EACH ROW EXECUTE FUNCTION private.validate_crm_lead_organization();

DROP TRIGGER IF EXISTS validate_interaction_organization ON public.interactions;

CREATE TRIGGER validate_interaction_organization
  BEFORE INSERT OR UPDATE OF organization_id, lead_id ON public.interactions
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION private.validate_crm_lead_organization();

INSERT INTO public.crm_sequences (organization_id, name, description)
SELECT o.id, 'Primeiro contato comercial', 'Cadencia inicial editavel para novos leads'
FROM public.organizations o
WHERE o.slug = 'yux'
   OR o.kind = 'client'
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.crm_sequence_steps (sequence_id, action_type, delay_minutes, subject, body, order_index)
SELECT s.id, step.action_type, step.delay_minutes, step.subject, step.body, step.order_index
FROM public.crm_sequences s
JOIN public.organizations o ON o.id = s.organization_id
CROSS JOIN (
  VALUES
    ('whatsapp', 0, 'Primeiro contato', 'Ola! Recebemos seu contato e queremos entender melhor sua necessidade.', 0),
    ('email', 1440, 'Podemos conversar sobre sua necessidade?', 'Preparamos algumas perguntas para entender seu contexto e indicar o melhor proximo passo.', 1),
    ('internal_task', 2880, 'Revisar lead sem retorno', 'Verifique o historico e defina a proxima abordagem comercial.', 2)
) AS step(action_type, delay_minutes, subject, body, order_index)
WHERE s.name = 'Primeiro contato comercial'
  AND (o.slug = 'yux' OR o.kind = 'client')
ON CONFLICT (sequence_id, order_index) DO NOTHING;

UPDATE public.platform_modules
SET portal_route = '/portal/crm'
WHERE key = 'crm';


-- source: 20260601140000_enable_client_crm_portal.sql
-- Allow contracted client administrators to operate the CRM portal.

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('client_admin', 'crm.read'),
  ('client_admin', 'leads.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;


-- source: 20260601150000_commercial_proposals_conversion.sql
-- Commercial proposal drafts, immutable sends, decisions, and project presets.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS proposal_id UUID,
  ADD COLUMN IF NOT EXISTS proposal_version_id UUID;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS proposal_id UUID,
  ADD COLUMN IF NOT EXISTS proposal_version_id UUID;

CREATE TABLE public.commercial_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  pain_points TEXT[] NOT NULL DEFAULT '{}',
  goals TEXT[] NOT NULL DEFAULT '{}',
  budget_range TEXT,
  timeline TEXT,
  decision_process TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id)
);

CREATE TABLE public.proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  default_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  whatsapp_message TEXT NOT NULL DEFAULT '',
  email_subject TEXT NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, package_id, name)
);

CREATE TABLE public.proposal_price_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  minimum_value DECIMAL(15,2) NOT NULL CHECK (minimum_value >= 0),
  recommended_value DECIMAL(15,2) NOT NULL CHECK (recommended_value >= minimum_value),
  maximum_value DECIMAL(15,2) NOT NULL CHECK (maximum_value >= recommended_value),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, package_id, item_key)
);

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','adjustments_requested','approved','rejected','conversion_failed','converted')),
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  whatsapp_message TEXT NOT NULL DEFAULT '',
  email_subject TEXT NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('one_time','monthly','quarterly','yearly')),
  selected_module_keys TEXT[] NOT NULL DEFAULT '{}',
  final_value DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (final_value >= 0),
  override_reason TEXT,
  current_version_id UUID,
  converted_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_value DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (unit_value >= 0),
  total_value DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_value) STORED,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.proposal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','adjustments_requested','superseded')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, version_number)
);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;

CREATE TABLE public.proposal_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_version_id UUID NOT NULL REFERENCES public.proposal_versions(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','adjustments_requested')),
  source TEXT NOT NULL CHECK (source IN ('public_token','portal')),
  comment TEXT,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_version_id)
);

CREATE TABLE public.proposal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_version_id UUID NOT NULL REFERENCES public.proposal_versions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE TABLE public.ai_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('completed','fallback','failed')),
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.proposal_conversion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('completed','failed')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (proposal_id, attempt_number)
);

CREATE TABLE public.package_project_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE UNIQUE,
  phases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.blueprint_project_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE UNIQUE,
  phases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commercial_diagnostics_organization ON public.commercial_diagnostics(organization_id);

CREATE INDEX idx_proposal_templates_organization_package ON public.proposal_templates(organization_id, package_id);

CREATE INDEX idx_proposal_price_rules_organization_package ON public.proposal_price_rules(organization_id, package_id);

CREATE INDEX idx_proposals_organization_status ON public.proposals(organization_id, status, updated_at DESC);

CREATE INDEX idx_proposals_lead ON public.proposals(lead_id);

CREATE INDEX idx_proposals_client ON public.proposals(client_id);

CREATE INDEX idx_proposals_assigned_to ON public.proposals(assigned_to);

CREATE INDEX idx_proposals_package ON public.proposals(package_id);

CREATE INDEX idx_proposal_items_proposal ON public.proposal_items(proposal_id, order_index);

CREATE INDEX idx_proposal_versions_proposal ON public.proposal_versions(proposal_id, version_number DESC);

CREATE INDEX idx_proposal_decisions_version ON public.proposal_decisions(proposal_version_id);

CREATE INDEX idx_proposal_access_tokens_version ON public.proposal_access_tokens(proposal_version_id);

CREATE INDEX idx_ai_generation_runs_proposal ON public.ai_generation_runs(proposal_id, created_at DESC);

CREATE INDEX idx_proposal_conversion_runs_proposal ON public.proposal_conversion_runs(proposal_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.can_manage_proposal_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

CREATE OR REPLACE FUNCTION private.can_access_portal_proposal_version(target_version_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.proposal_versions v
    JOIN public.proposals p ON p.id = v.proposal_id
    WHERE v.id = target_version_id
      AND p.current_version_id = v.id
      AND v.status = 'pending'
      AND private.can_access_portal_proposal(p.id)
  );
$$;

REVOKE ALL ON FUNCTION private.can_manage_proposal_organization(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_portal_proposal(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_portal_proposal_version(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.protect_proposal_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sent proposal versions are immutable';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'Sent proposal versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_proposal_version_send()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.proposal_versions
  SET status = 'superseded'
  WHERE proposal_id = NEW.proposal_id
    AND id <> NEW.id
    AND status = 'pending';

  UPDATE public.proposals
  SET current_version_id = NEW.id,
      status = 'sent',
      updated_at = NOW()
  WHERE id = NEW.proposal_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_proposal_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_proposal public.proposals%ROWTYPE;
BEGIN
  SELECT p.* INTO target_proposal
  FROM public.proposals p
  JOIN public.proposal_versions v ON v.proposal_id = p.id
  WHERE v.id = NEW.proposal_version_id
  FOR UPDATE OF p;

  IF target_proposal.current_version_id IS DISTINCT FROM NEW.proposal_version_id THEN
    RAISE EXCEPTION 'Proposal decision targets a stale version';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proposal_versions v
    WHERE v.id = NEW.proposal_version_id AND v.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Proposal version is not pending';
  END IF;

  IF NEW.decision = 'adjustments_requested' AND NULLIF(BTRIM(NEW.comment), '') IS NULL THEN
    RAISE EXCEPTION 'Adjustment requests require a comment';
  END IF;

  UPDATE public.proposal_versions
  SET status = NEW.decision,
      decided_at = NOW()
  WHERE id = NEW.proposal_version_id;

  UPDATE public.proposals
  SET status = NEW.decision,
      updated_at = NOW()
  WHERE id = target_proposal.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_proposal_version
  BEFORE UPDATE OR DELETE ON public.proposal_versions
  FOR EACH ROW EXECUTE FUNCTION private.protect_proposal_version();

CREATE TRIGGER apply_proposal_version_send
  AFTER INSERT ON public.proposal_versions
  FOR EACH ROW EXECUTE FUNCTION private.apply_proposal_version_send();

CREATE TRIGGER apply_proposal_decision
  BEFORE INSERT ON public.proposal_decisions
  FOR EACH ROW EXECUTE FUNCTION private.apply_proposal_decision();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'commercial_diagnostics', 'proposal_templates', 'proposal_price_rules',
    'proposals', 'proposal_items', 'package_project_presets', 'blueprint_project_presets'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;

INSERT INTO public.proposal_templates (
  organization_id, package_id, name, scope, default_items, whatsapp_message, email_subject, email_body
)
SELECT
  o.id,
  p.id,
  'Padrao ' || p.name,
  'Implantacao do pacote ' || p.name || ' com configuracao, acompanhamento e entregas descritas no diagnostico comercial.',
  jsonb_build_array(jsonb_build_object(
    'itemKey', 'base',
    'label', p.name,
    'description', p.description,
    'quantity', 1,
    'unitValue', CASE p.key
      WHEN 'presenca_digital_ia' THEN 2500
      WHEN 'atendimento_inteligente' THEN 3500
      WHEN 'maquina_comercial' THEN 4500
      WHEN 'operacao_inteligente' THEN 6000
      ELSE 9000
    END
  )),
  'Preparamos uma proposta alinhada ao diagnostico da sua operacao. O link abaixo permite revisar o escopo e registrar sua decisao.',
  'Proposta comercial YUX - ' || p.name,
  'Segue a proposta comercial da YUX para revisao. O escopo permanece disponivel no link seguro enviado.'
FROM public.organizations o
CROSS JOIN public.packages p
WHERE o.slug = 'yux'
ON CONFLICT (organization_id, package_id, name) DO NOTHING;

INSERT INTO public.proposal_price_rules (
  organization_id, package_id, item_key, label, minimum_value, recommended_value, maximum_value
)
SELECT
  o.id,
  p.id,
  'base',
  p.name,
  CASE p.key
    WHEN 'presenca_digital_ia' THEN 1800
    WHEN 'atendimento_inteligente' THEN 2500
    WHEN 'maquina_comercial' THEN 3500
    WHEN 'operacao_inteligente' THEN 4500
    ELSE 7000
  END,
  CASE p.key
    WHEN 'presenca_digital_ia' THEN 2500
    WHEN 'atendimento_inteligente' THEN 3500
    WHEN 'maquina_comercial' THEN 4500
    WHEN 'operacao_inteligente' THEN 6000
    ELSE 9000
  END,
  CASE p.key
    WHEN 'presenca_digital_ia' THEN 4000
    WHEN 'atendimento_inteligente' THEN 5500
    WHEN 'maquina_comercial' THEN 7500
    WHEN 'operacao_inteligente' THEN 10000
    ELSE 18000
  END
FROM public.organizations o
CROSS JOIN public.packages p
WHERE o.slug = 'yux'
ON CONFLICT (organization_id, package_id, item_key) DO NOTHING;

INSERT INTO public.package_project_presets (package_id, phases)
SELECT p.id, jsonb_build_array(
  jsonb_build_object('name', 'Planejamento', 'orderIndex', 0, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Confirmar escopo contratado', 'orderIndex', 0),
    jsonb_build_object('title', 'Definir cronograma inicial', 'orderIndex', 1)
  )),
  jsonb_build_object('name', 'Implantacao', 'orderIndex', 1, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Executar configuracao inicial', 'orderIndex', 0),
    jsonb_build_object('title', 'Validar entrega com cliente', 'orderIndex', 1)
  ))
)
FROM public.packages p
ON CONFLICT (package_id) DO NOTHING;

INSERT INTO public.blueprint_project_presets (blueprint_id, phases)
SELECT b.id, jsonb_build_array(
  jsonb_build_object('name', 'Onboarding ' || b.name, 'orderIndex', 0, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Coletar dados do setor ' || b.sector, 'orderIndex', 0),
    jsonb_build_object('title', 'Aplicar configuracao do blueprint', 'orderIndex', 1)
  )),
  jsonb_build_object('name', 'Validacao operacional', 'orderIndex', 1, 'tasks', jsonb_build_array(
    jsonb_build_object('title', 'Validar fluxo com equipe do cliente', 'orderIndex', 0)
  ))
)
FROM public.blueprints b
ON CONFLICT (blueprint_id) DO NOTHING;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD CONSTRAINT contracts_proposal_version_id_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD CONSTRAINT projects_proposal_version_id_fkey FOREIGN KEY (proposal_version_id) REFERENCES public.proposal_versions(id) ON DELETE SET NULL;


-- source: 20260601160000_proposal_conversion_transaction.sql
-- Idempotent proposal approval conversion into operational delivery records.

CREATE OR REPLACE FUNCTION private.convert_approved_proposal(target_proposal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_proposal public.proposals%ROWTYPE;
  target_version public.proposal_versions%ROWTYPE;
  target_lead public.leads%ROWTYPE;
  target_client_id UUID;
  target_contract_id UUID;
  target_project_id UUID;
  target_package_id UUID;
  target_blueprint_id UUID;
  target_modules JSONB;
  target_phases JSONB;
  target_phase JSONB;
  target_task JSONB;
  target_phase_id UUID;
  target_attempt INTEGER;
BEGIN
  SELECT * INTO target_proposal
  FROM public.proposals
  WHERE id = target_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF target_proposal.contract_id IS NOT NULL AND target_proposal.project_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'clientId', target_proposal.converted_client_id,
      'contractId', target_proposal.contract_id,
      'projectId', target_proposal.project_id,
      'duplicate', true
    );
  END IF;

  IF target_proposal.status <> 'approved' OR target_proposal.current_version_id IS NULL THEN
    RAISE EXCEPTION 'Proposal is not approved';
  END IF;

  SELECT * INTO target_version
  FROM public.proposal_versions
  WHERE id = target_proposal.current_version_id
    AND proposal_id = target_proposal.id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved proposal version not found';
  END IF;

  SELECT * INTO target_lead FROM public.leads WHERE id = target_proposal.lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal lead not found';
  END IF;

  target_package_id := (target_version.snapshot->>'package_id')::UUID;
  target_blueprint_id := NULLIF(target_version.snapshot->>'blueprint_id', '')::UUID;
  target_modules := COALESCE(target_version.snapshot->'selected_module_keys', '[]'::jsonb);

  target_client_id := COALESCE(target_proposal.client_id, target_lead.converted_to_client_id);
  IF target_client_id IS NULL THEN
    INSERT INTO public.clients (
      company_name, contact_name, email, phone, sector, size, lead_source, status, notes, assigned_to
    )
    VALUES (
      COALESCE(NULLIF(target_lead.company, ''), target_lead.name),
      target_lead.name,
      target_lead.email,
      target_lead.phone,
      'Nao informado',
      'small',
      target_lead.source,
      'active',
      'Cliente criado automaticamente pela aprovacao da proposta ' || target_proposal.id,
      target_lead.assigned_to
    )
    RETURNING id INTO target_client_id;
  END IF;

  UPDATE public.leads
  SET converted_to_client_id = target_client_id,
      client_id = COALESCE(client_id, target_client_id),
      stage = 'WON',
      updated_at = NOW()
  WHERE id = target_lead.id;

  INSERT INTO public.contracts (
    client_id, package_id, name, status, starts_at, value, billing_cycle, notes, proposal_id, proposal_version_id
  )
  VALUES (
    target_client_id,
    target_package_id,
    'Contrato - ' || target_proposal.title,
    'active',
    CURRENT_DATE,
    (target_version.snapshot->>'final_value')::DECIMAL,
    COALESCE(target_version.snapshot->>'billing_cycle', 'monthly'),
    'Contrato criado automaticamente a partir da proposta aprovada.',
    target_proposal.id,
    target_version.id
  )
  RETURNING id INTO target_contract_id;

  IF jsonb_array_length(target_modules) > 0 THEN
    INSERT INTO public.contract_modules (contract_id, module_key, enabled)
    SELECT target_contract_id, module_key, true
    FROM jsonb_array_elements_text(target_modules) AS module_key;
  ELSE
    INSERT INTO public.contract_modules (contract_id, module_key, enabled)
    SELECT target_contract_id, module_key, true
    FROM public.package_modules
    WHERE package_id = target_package_id;
  END IF;

  INSERT INTO public.projects (
    name, description, client_id, status, priority, type, start_date, expected_end_date,
    budget, currency, notes, proposal_id, proposal_version_id
  )
  VALUES (
    target_proposal.title,
    target_version.snapshot->>'scope',
    target_client_id,
    'PLANNING',
    'MEDIUM',
    'OTHER',
    CURRENT_DATE,
    CURRENT_DATE + 30,
    (target_version.snapshot->>'final_value')::DECIMAL,
    'BRL',
    'Projeto criado automaticamente pela aprovacao comercial.',
    target_proposal.id,
    target_version.id
  )
  RETURNING id INTO target_project_id;

  IF target_blueprint_id IS NOT NULL THEN
    SELECT phases INTO target_phases
    FROM public.blueprint_project_presets
    WHERE blueprint_id = target_blueprint_id;
  END IF;

  IF target_phases IS NULL OR jsonb_array_length(target_phases) = 0 THEN
    SELECT phases INTO target_phases
    FROM public.package_project_presets
    WHERE package_id = target_package_id;
  END IF;

  FOR target_phase IN SELECT * FROM jsonb_array_elements(COALESCE(target_phases, '[]'::jsonb))
  LOOP
    INSERT INTO public.project_phases (project_id, name, description, order_index)
    VALUES (
      target_project_id,
      target_phase->>'name',
      target_phase->>'description',
      COALESCE((target_phase->>'orderIndex')::INTEGER, 0)
    )
    RETURNING id INTO target_phase_id;

    FOR target_task IN SELECT * FROM jsonb_array_elements(COALESCE(target_phase->'tasks', '[]'::jsonb))
    LOOP
      INSERT INTO public.project_tasks (project_id, phase_id, title, description, priority, order_index)
      VALUES (
        target_project_id,
        target_phase_id,
        target_task->>'title',
        target_task->>'description',
        COALESCE(target_task->>'priority', 'medium'),
        COALESCE((target_task->>'orderIndex')::INTEGER, 0)
      );
    END LOOP;
  END LOOP;

  UPDATE public.proposals
  SET status = 'converted',
      client_id = target_client_id,
      converted_client_id = target_client_id,
      contract_id = target_contract_id,
      project_id = target_project_id,
      updated_at = NOW()
  WHERE id = target_proposal.id;

  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO target_attempt
  FROM public.proposal_conversion_runs
  WHERE proposal_id = target_proposal.id;

  INSERT INTO public.proposal_conversion_runs (
    proposal_id, attempt_number, status, client_id, contract_id, project_id, completed_at
  )
  VALUES (
    target_proposal.id, target_attempt, 'completed', target_client_id, target_contract_id, target_project_id, NOW()
  );

  INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
  VALUES (
    target_proposal.organization_id,
    target_lead.id,
    'note',
    'Proposta aprovada e convertida',
    'Cliente, contrato e projeto criados automaticamente.',
    NOW()
  );

  RETURN jsonb_build_object(
    'clientId', target_client_id,
    'contractId', target_contract_id,
    'projectId', target_project_id,
    'duplicate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_approved_proposal_service(target_proposal_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.convert_approved_proposal(target_proposal_id);
$$;

REVOKE ALL ON FUNCTION private.convert_approved_proposal(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.convert_approved_proposal_service(UUID) FROM PUBLIC;


-- source: 20260601170000_enable_client_proposals_portal.sql
UPDATE public.platform_modules
SET portal_route = '/portal/proposals',
    updated_at = NOW()
WHERE key = 'proposals';

UPDATE public.contract_modules
SET enabled = true,
    updated_at = NOW()
WHERE contract_id = '660e8400-e29b-41d4-a716-446655440001'
  AND module_key = 'proposals';


-- source: 20260601180000_enable_client_proposal_permissions.sql
INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('client_admin', 'proposals.read'),
  ('client_admin', 'proposals.write'),
  ('client_member', 'proposals.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;


-- source: 20260601190000_omnichannel_ai_core.sql
-- Provider-neutral omnichannel schema, permissions, storage, and RLS core.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE public.omnichannel_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  availability_mode TEXT NOT NULL DEFAULT 'business_hours' CHECK (availability_mode IN ('always_on', 'business_hours', 'manual')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.omnichannel_team_members (
  team_id UUID NOT NULL REFERENCES public.omnichannel_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE public.conversation_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'least_busy', 'priority', 'manual')),
  sla_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  adapter_key TEXT NOT NULL,
  inbound_token_hash TEXT NOT NULL,
  n8n_routing_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, channel, name),
  UNIQUE (inbound_token_hash)
);

CREATE TABLE public.omnichannel_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  external_identities JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR external_identities <> '{}'::jsonb)
);

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.omnichannel_contacts(id) ON DELETE RESTRICT,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_ai', 'waiting_human', 'assigned', 'resolved', 'archived')),
  response_mode TEXT NOT NULL DEFAULT 'assisted' CHECK (response_mode IN ('automatic', 'assisted', 'manual')),
  queue_id UUID REFERENCES public.conversation_queues(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  subject TEXT,
  summary TEXT,
  classification TEXT,
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  commercial_intent TEXT CHECK (commercial_intent IS NULL OR commercial_intent IN ('none', 'low', 'medium', 'high')),
  scheduling_intent TEXT CHECK (scheduling_intent IS NULL OR scheduling_intent IN ('none', 'requested', 'confirmed', 'cancelled')),
  last_message_at TIMESTAMPTZ,
  sla_deadline_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  author_type TEXT NOT NULL CHECK (author_type IN ('contact', 'ai', 'agent', 'system')),
  author_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'file', 'template', 'system')),
  body TEXT,
  external_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'processing', 'sent', 'delivered', 'read', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (body IS NOT NULL OR metadata <> '{}'::jsonb)
);

CREATE TABLE public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  retention_deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, tag),
  CHECK (BTRIM(tag) <> '')
);

CREATE TABLE public.conversation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES public.conversation_queues(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.omnichannel_teams(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'rule', 'auto_routing', 'lead_owner', 'team_availability', 'supervisor_fallback', 'sla')),
  reason TEXT,
  assigned_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.handoff_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  combinator TEXT NOT NULL DEFAULT 'all' CHECK (combinator IN ('all', 'any')),
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.handoff_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.handoff_rules(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL,
  matched_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_assignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_assignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.channel_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  external_event_id TEXT,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  sanitized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  protected_error_text TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.outbound_message_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  adapter_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed')),
  sanitized_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  sanitized_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, attempt_number)
);

CREATE TABLE public.scheduling_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.omnichannel_contacts(id) ON DELETE RESTRICT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  requested_slot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'scheduled', 'cancelled', 'failed')),
  external_reference TEXT,
  n8n_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ai_message_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  inbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  outbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  logical_provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'fallback', 'failed')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost NUMERIC(14, 6) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  protected_error_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.crm_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  sanitized_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'url', 'file', 'faq', 'integration')),
  name TEXT NOT NULL,
  source_url TEXT,
  storage_path TEXT,
  retention_deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
  reviewer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.knowledge_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  body_snapshot TEXT NOT NULL,
  publisher_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.omnichannel_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_response_mode TEXT NOT NULL DEFAULT 'assisted' CHECK (default_response_mode IN ('automatic', 'assisted', 'manual')),
  retention_months INTEGER NOT NULL DEFAULT 12 CHECK (retention_months > 0),
  attachment_retention_months INTEGER NOT NULL DEFAULT 12 CHECK (attachment_retention_months > 0),
  anonymize_on_retention BOOLEAN NOT NULL DEFAULT false,
  crm_sync_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_logical_provider TEXT,
  ai_model TEXT,
  ai_token_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.webchat_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_text TEXT,
  initial_form JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.webchat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID NOT NULL REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.omnichannel_contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  validated_origin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE private.webchat_widget_tokens (
  widget_id UUID PRIMARY KEY REFERENCES public.webchat_widgets(id) ON DELETE CASCADE,
  public_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_omnichannel_teams_organization ON public.omnichannel_teams(organization_id);

CREATE INDEX idx_omnichannel_team_members_user ON public.omnichannel_team_members(user_id);

CREATE INDEX idx_conversation_queues_organization ON public.conversation_queues(organization_id);

CREATE INDEX idx_conversation_queues_team ON public.conversation_queues(team_id);

CREATE INDEX idx_channel_connections_organization_channel ON public.channel_connections(organization_id, channel, is_active);

CREATE INDEX idx_channel_connections_last_event_at ON public.channel_connections(last_event_at DESC);

CREATE UNIQUE INDEX idx_omnichannel_contacts_org_email_unique ON public.omnichannel_contacts(organization_id, LOWER(email)) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX idx_omnichannel_contacts_org_phone_unique ON public.omnichannel_contacts(organization_id, phone) WHERE phone IS NOT NULL;

CREATE INDEX idx_omnichannel_contacts_external_identities ON public.omnichannel_contacts USING GIN (external_identities);

CREATE INDEX idx_omnichannel_contacts_lead_id ON public.omnichannel_contacts(lead_id);

CREATE INDEX idx_conversations_organization_status_channel ON public.conversations(organization_id, status, channel);

CREATE INDEX idx_conversations_organization_queue_team_user ON public.conversations(organization_id, queue_id, team_id, assigned_user_id);

CREATE INDEX idx_conversations_organization_sla_deadline ON public.conversations(organization_id, sla_deadline_at);

CREATE INDEX idx_conversations_organization_last_message ON public.conversations(organization_id, last_message_at DESC);

CREATE INDEX idx_messages_conversation_created_at ON public.messages(conversation_id, created_at);

CREATE UNIQUE INDEX idx_messages_connection_external_id ON public.messages(connection_id, external_message_id) WHERE external_message_id IS NOT NULL;

CREATE INDEX idx_message_attachments_message_id ON public.message_attachments(message_id);

CREATE INDEX idx_conversation_assignments_conversation_created_at ON public.conversation_assignments(conversation_id, created_at DESC);

CREATE INDEX idx_handoff_rules_organization_priority ON public.handoff_rules(organization_id, is_enabled, priority);

CREATE INDEX idx_handoff_events_conversation_created_at ON public.handoff_events(conversation_id, created_at DESC);

CREATE INDEX idx_channel_webhook_events_connection_received_at ON public.channel_webhook_events(connection_id, received_at DESC);

CREATE INDEX idx_channel_webhook_events_idempotency_key ON public.channel_webhook_events(idempotency_key);

CREATE INDEX idx_outbound_message_runs_conversation_created_at ON public.outbound_message_runs(conversation_id, created_at DESC);

CREATE INDEX idx_ai_message_runs_conversation_created_at ON public.ai_message_runs(conversation_id, created_at DESC);

CREATE INDEX idx_scheduling_requests_conversation_created_at ON public.scheduling_requests(conversation_id, created_at DESC);

CREATE INDEX idx_crm_sync_runs_conversation_created_at ON public.crm_sync_runs(conversation_id, created_at DESC);

CREATE INDEX idx_knowledge_sources_organization_status ON public.knowledge_sources(organization_id, status);

CREATE INDEX idx_knowledge_entries_organization_status ON public.knowledge_entries(organization_id, status, updated_at DESC);

CREATE INDEX idx_knowledge_publications_entry_published_at ON public.knowledge_publications(entry_id, published_at DESC);

CREATE INDEX idx_webchat_widgets_organization_active ON public.webchat_widgets(organization_id, is_active);

CREATE INDEX idx_webchat_sessions_widget_created_at ON public.webchat_sessions(widget_id, created_at DESC);

CREATE INDEX idx_webchat_sessions_validated_origin ON public.webchat_sessions(validated_origin);

CREATE INDEX idx_private_webchat_widget_tokens_hash ON private.webchat_widget_tokens(public_token_hash);

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_organization(target_organization_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE target_action
    WHEN 'read' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.read')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.write')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.configure')
    WHEN 'write' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.write')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
    WHEN 'supervise' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
    WHEN 'configure' THEN
      private.has_omnichannel_permission(target_organization_id, 'omnichannel.configure')
      OR private.has_omnichannel_permission(target_organization_id, 'omnichannel.supervise')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_conversation(target_conversation_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = target_conversation_id
      AND private.can_access_omnichannel_organization(c.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_message(target_message_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = target_message_id
      AND private.can_access_omnichannel_organization(c.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_knowledge(target_entry_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_entries k
    WHERE k.id = target_entry_id
      AND private.can_access_omnichannel_organization(k.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_queue(target_queue_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_queues q
    WHERE q.id = target_queue_id
      AND private.can_access_omnichannel_organization(q.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_team(target_team_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.omnichannel_teams t
    WHERE t.id = target_team_id
      AND private.can_access_omnichannel_organization(t.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_omnichannel_widget(target_widget_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_widgets w
    WHERE w.id = target_widget_id
      AND private.can_access_omnichannel_organization(w.organization_id, target_action)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_allowed_widget_origin(target_widget_id UUID, request_origin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_widgets w
    JOIN LATERAL unnest(w.allowed_origins) AS allowed_origin(value) ON true
    WHERE w.id = target_widget_id
      AND w.is_active
      AND NULLIF(BTRIM(request_origin), '') IS NOT NULL
      AND (
        LOWER(allowed_origin.value) = LOWER(request_origin)
        OR allowed_origin.value = '*'
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.find_active_webchat_widget_by_token_hash(candidate_token_hash TEXT, request_origin TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT w.id
  FROM private.webchat_widget_tokens wt
  JOIN public.webchat_widgets w ON w.id = wt.widget_id
  WHERE wt.public_token_hash = candidate_token_hash
    AND w.is_active
    AND private.is_allowed_widget_origin(w.id, request_origin)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.verify_webchat_session(target_session_id UUID, candidate_session_token_hash TEXT, request_origin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_sessions s
    WHERE s.id = target_session_id
      AND s.session_token_hash = candidate_session_token_hash
      AND s.validated_origin = request_origin
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
  );
$$;

CREATE OR REPLACE FUNCTION private.prevent_immutable_omnichannel_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable omnichannel audit rows cannot be %', LOWER(TG_OP);
END;
$$;

REVOKE ALL ON FUNCTION private.has_active_omnichannel_contract(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.has_omnichannel_permission(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_supervise_omnichannel() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_organization(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_conversation(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_message(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_knowledge(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_queue(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_team(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_widget(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.is_allowed_widget_origin(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.find_active_webchat_widget_by_token_hash(TEXT, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.verify_webchat_session(UUID, TEXT, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_omnichannel_storage_object(TEXT, TEXT) FROM PUBLIC;

CREATE TRIGGER protect_handoff_events_immutable
  BEFORE UPDATE OR DELETE ON public.handoff_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_immutable_omnichannel_event_mutation();

CREATE TRIGGER protect_knowledge_publications_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_publications
  FOR EACH ROW EXECUTE FUNCTION private.prevent_immutable_omnichannel_event_mutation();

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'omnichannel_teams',
    'omnichannel_team_members',
    'conversation_queues',
    'channel_connections',
    'omnichannel_contacts',
    'conversations',
    'messages',
    'message_attachments',
    'handoff_rules',
    'channel_webhook_events',
    'outbound_message_runs',
    'scheduling_requests',
    'ai_message_runs',
    'crm_sync_runs',
    'knowledge_sources',
    'knowledge_entries',
    'omnichannel_settings',
    'webchat_widgets',
    'webchat_sessions'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;

INSERT INTO public.roles (key, name, scope)
VALUES ('yux_member', 'YUX Member', 'internal')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  scope = EXCLUDED.scope,
  updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'omnichannel.read'),
  ('yux_admin', 'omnichannel.write'),
  ('yux_admin', 'omnichannel.supervise'),
  ('yux_admin', 'omnichannel.configure'),
  ('yux_manager', 'omnichannel.read'),
  ('yux_manager', 'omnichannel.write'),
  ('yux_manager', 'omnichannel.supervise'),
  ('yux_manager', 'omnichannel.configure'),
  ('yux_member', 'omnichannel.read'),
  ('yux_member', 'omnichannel.write'),
  ('client_admin', 'omnichannel.read'),
  ('client_admin', 'omnichannel.write'),
  ('client_admin', 'omnichannel.configure'),
  ('client_member', 'omnichannel.read'),
  ('client_member', 'omnichannel.write')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES (
  'whatsapp_ai',
  'Central Omnichannel IA',
  false,
  '/omnichannel',
  '/portal/omnichannel',
  ARRAY['omnichannel.read']
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  internal_route = EXCLUDED.internal_route,
  portal_route = EXCLUDED.portal_route,
  required_permissions = EXCLUDED.required_permissions,
  updated_at = NOW();


-- source: 20260601200000_omnichannel_crm_sync.sql
-- Transactional CRM synchronization for provider-neutral omnichannel conversations.

CREATE OR REPLACE FUNCTION private.sync_omnichannel_crm(
  target_conversation_id UUID,
  sync_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_conversation public.conversations%ROWTYPE;
  target_contact public.omnichannel_contacts%ROWTYPE;
  target_settings public.omnichannel_settings%ROWTYPE;
  default_pipeline_id UUID;
  default_stage_id UUID;
  target_lead public.leads%ROWTYPE;
  lead_email TEXT;
  lead_phone TEXT;
  should_create_lead BOOLEAN;
  sync_status TEXT := 'completed';
  sync_result JSONB;
BEGIN
  SELECT * INTO target_conversation
  FROM public.conversations
  WHERE id = target_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  SELECT * INTO target_contact
  FROM public.omnichannel_contacts
  WHERE id = target_conversation.contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Omnichannel contact not found';
  END IF;

  SELECT * INTO target_settings
  FROM public.omnichannel_settings
  WHERE organization_id = target_conversation.organization_id;

  IF target_settings.crm_sync_filters ? 'channels'
    AND NOT (target_settings.crm_sync_filters->'channels' ? target_conversation.channel)
  THEN
    INSERT INTO public.crm_sync_runs (organization_id, conversation_id, lead_id, status, sanitized_metadata)
    VALUES (
      target_conversation.organization_id,
      target_conversation.id,
      target_conversation.lead_id,
      'completed',
      jsonb_build_object('skipped', true, 'reason', 'channel_not_allowed')
    );
    RETURN jsonb_build_object('synced', false, 'reason', 'channel_not_allowed');
  END IF;

  lead_email := NULLIF(BTRIM(COALESCE(target_contact.email, '')), '');
  lead_phone := NULLIF(BTRIM(COALESCE(target_contact.phone, '')), '');

  IF target_conversation.lead_id IS NOT NULL THEN
    SELECT * INTO target_lead
    FROM public.leads
    WHERE id = target_conversation.lead_id
      AND organization_id = target_conversation.organization_id
    FOR UPDATE;
  END IF;

  IF target_lead.id IS NULL AND lead_email IS NOT NULL THEN
    SELECT * INTO target_lead
    FROM public.leads
    WHERE organization_id = target_conversation.organization_id
      AND LOWER(email) = LOWER(lead_email)
    ORDER BY updated_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF target_lead.id IS NULL AND lead_phone IS NOT NULL THEN
    SELECT * INTO target_lead
    FROM public.leads
    WHERE organization_id = target_conversation.organization_id
      AND phone = lead_phone
    ORDER BY updated_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  should_create_lead := COALESCE((target_settings.crm_sync_filters->>'createLeadWhenMissing')::BOOLEAN, true);

  IF target_lead.id IS NULL AND should_create_lead THEN
    SELECT id INTO default_pipeline_id
    FROM public.crm_pipelines
    WHERE organization_id = target_conversation.organization_id
      AND is_default
      AND is_active
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO default_stage_id
    FROM public.crm_pipeline_stages
    WHERE pipeline_id = default_pipeline_id
      AND is_active
    ORDER BY order_index
    LIMIT 1;

    INSERT INTO public.leads (
      organization_id,
      pipeline_id,
      stage_id,
      name,
      email,
      phone,
      company,
      source,
      stage,
      status,
      score,
      notes,
      assigned_to,
      next_follow_up_at
    )
    VALUES (
      target_conversation.organization_id,
      default_pipeline_id,
      default_stage_id,
      COALESCE(NULLIF(target_contact.display_name, ''), 'Contato omnichannel'),
      COALESCE(lead_email, CONCAT('omnichannel+', target_contact.id::TEXT, '@local.invalid')),
      lead_phone,
      target_contact.profile_metadata->>'company',
      CONCAT('Omnichannel ', target_conversation.channel),
      'NEW',
      'open',
      CASE target_conversation.commercial_intent
        WHEN 'high' THEN 85
        WHEN 'medium' THEN 60
        WHEN 'low' THEN 35
        ELSE 10
      END,
      target_conversation.summary,
      target_conversation.assigned_user_id,
      CASE
        WHEN target_conversation.scheduling_intent IN ('requested', 'confirmed') THEN NOW() + INTERVAL '1 day'
        ELSE NULL
      END
    )
    RETURNING * INTO target_lead;
  END IF;

  IF target_lead.id IS NOT NULL THEN
    UPDATE public.omnichannel_contacts
    SET lead_id = target_lead.id,
        updated_at = NOW()
    WHERE id = target_contact.id;

    UPDATE public.conversations
    SET lead_id = target_lead.id,
        updated_at = NOW()
    WHERE id = target_conversation.id;

    UPDATE public.leads
    SET notes = COALESCE(NULLIF(target_conversation.summary, ''), notes),
        score = GREATEST(
          COALESCE(score, 0),
          CASE target_conversation.commercial_intent
            WHEN 'high' THEN 85
            WHEN 'medium' THEN 60
            WHEN 'low' THEN 35
            ELSE 0
          END
        ),
        assigned_to = COALESCE(assigned_to, target_conversation.assigned_user_id),
        next_follow_up_at = COALESCE(
          next_follow_up_at,
          CASE
            WHEN target_conversation.scheduling_intent IN ('requested', 'confirmed') THEN NOW() + INTERVAL '1 day'
            ELSE NULL
          END
        ),
        updated_at = NOW()
    WHERE id = target_lead.id;

    INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
    SELECT
      target_conversation.organization_id,
      target_lead.id,
      'note',
      'Conversa omnichannel',
      COALESCE(target_conversation.summary, CONCAT('Conversa ', target_conversation.channel)),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.interactions i
      WHERE i.organization_id = target_conversation.organization_id
        AND i.lead_id = target_lead.id
        AND i.title = 'Conversa omnichannel'
        AND i.description = COALESCE(target_conversation.summary, CONCAT('Conversa ', target_conversation.channel))
    );
  ELSE
    sync_status := 'completed';
  END IF;

  sync_result := jsonb_build_object(
    'synced', target_lead.id IS NOT NULL,
    'conversationId', target_conversation.id,
    'contactId', target_contact.id,
    'leadId', target_lead.id
  );

  INSERT INTO public.crm_sync_runs (organization_id, conversation_id, lead_id, status, sanitized_metadata)
  VALUES (
    target_conversation.organization_id,
    target_conversation.id,
    target_lead.id,
    sync_status,
    COALESCE(sync_metadata, '{}'::jsonb) || sync_result
  );

  RETURN sync_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_omnichannel_crm_service(
  target_conversation_id UUID,
  sync_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.sync_omnichannel_crm(target_conversation_id, sync_metadata);
$$;

REVOKE ALL ON FUNCTION private.sync_omnichannel_crm(UUID, JSONB) FROM PUBLIC;


-- source: 20260601210000_omnichannel_webchat_widget_service.sql
CREATE OR REPLACE FUNCTION public.resolve_webchat_widget_service(
  candidate_token_hash TEXT,
  request_origin TEXT
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  name TEXT,
  is_active BOOLEAN,
  allowed_origins TEXT[],
  branding JSONB,
  consent_text TEXT,
  initial_form JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    w.id,
    w.organization_id,
    w.name,
    w.is_active,
    w.allowed_origins,
    w.branding,
    w.consent_text,
    w.initial_form
  FROM private.webchat_widget_tokens wt
  JOIN public.webchat_widgets w ON w.id = wt.widget_id
  WHERE wt.public_token_hash = candidate_token_hash
    AND w.is_active
    AND private.is_allowed_widget_origin(w.id, request_origin)
  LIMIT 1;
$$;


-- source: 20260603215652_expose_platform_base_tables_to_data_api.sql

-- source: 20260604131024_basic_finance.sql
-- Basic contract finance: invoices and billing items without automated payment gateway.

CREATE OR REPLACE FUNCTION private.can_read_finance_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'finance'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_finance_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_finance_contract(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_finance_organization(UUID) FROM PUBLIC;

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  adjustments DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_issue_due_order CHECK (due_date >= issue_date),
  CONSTRAINT invoices_period_order CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CONSTRAINT invoices_paid_state CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid')
  ),
  UNIQUE (organization_id, invoice_number)
);

CREATE TABLE public.billing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (BTRIM(description) <> ''),
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_amount) STORED,
  kind TEXT NOT NULL DEFAULT 'recurring' CHECK (kind IN ('setup', 'recurring', 'usage', 'adjustment', 'discount', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_organization_status ON public.invoices(organization_id, status);

CREATE INDEX idx_invoices_client_due ON public.invoices(client_id, due_date);

CREATE INDEX idx_invoices_contract_due ON public.invoices(contract_id, due_date);

CREATE INDEX idx_invoices_due_status ON public.invoices(due_date, status);

CREATE INDEX idx_billing_items_invoice_id ON public.billing_items(invoice_id);

CREATE OR REPLACE FUNCTION private.sync_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_invoice_id UUID;
  next_subtotal DECIMAL(15,2);
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(total_amount), 0)
  INTO next_subtotal
  FROM public.billing_items
  WHERE invoice_id = target_invoice_id;

  UPDATE public.invoices
  SET subtotal = next_subtotal,
      total_amount = GREATEST(next_subtotal + adjustments, 0),
      status = CASE
        WHEN status = 'cancelled' THEN status
        WHEN paid_amount >= GREATEST(next_subtotal + adjustments, 0) AND GREATEST(next_subtotal + adjustments, 0) > 0 THEN 'paid'
        WHEN paid_amount > 0 THEN 'partial'
        ELSE status
      END,
      paid_at = CASE
        WHEN paid_amount >= GREATEST(next_subtotal + adjustments, 0) AND GREATEST(next_subtotal + adjustments, 0) > 0 THEN COALESCE(paid_at, NOW())
        WHEN status = 'paid' THEN paid_at
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = target_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_invoice_payment_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_amount >= NEW.total_amount AND NEW.total_amount > 0 THEN
    NEW.status := 'paid';
    NEW.paid_at := COALESCE(NEW.paid_at, NOW());
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status := 'partial';
    NEW.paid_at := NULL;
  ELSIF NEW.status = 'paid' THEN
    NEW.status := 'issued';
    NEW.paid_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_invoice_totals() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.sync_invoice_payment_state() FROM PUBLIC;

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_billing_items_updated_at
  BEFORE UPDATE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sync_invoice_payment_state
  BEFORE INSERT OR UPDATE OF paid_amount, total_amount, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.sync_invoice_payment_state();

CREATE TRIGGER sync_invoice_totals_after_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION private.sync_invoice_totals();

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('client_member', 'finance.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

UPDATE public.platform_modules
SET base = false,
    internal_route = '/finance',
    portal_route = '/portal/finance',
    required_permissions = ARRAY['finance.read'],
    updated_at = NOW()
WHERE key = 'finance';


-- source: 20260604131248_basic_support.sql
-- Basic contract support: tickets and ticket messages without omnichannel coupling.

CREATE OR REPLACE FUNCTION private.can_read_support_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'support'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_create_support_ticket(target_contract_id UUID, target_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'support'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.client_id = target_client_id
        AND c.status = 'active'
        AND private.can_access_client(target_client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_support_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_support_contract(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_create_support_ticket(UUID, UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_support_organization(UUID) FROM PUBLIC;

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  subject TEXT NOT NULL CHECK (BTRIM(subject) <> ''),
  category TEXT NOT NULL DEFAULT 'technical' CHECK (category IN ('technical', 'billing', 'content', 'access', 'request', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_client', 'resolved', 'closed')),
  sla_due_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_tickets_resolution_state CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status <> 'resolved')
  ),
  CONSTRAINT support_tickets_closed_state CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status <> 'closed')
  )
);

CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('client', 'internal', 'system')),
  author_name TEXT,
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_messages_internal_author CHECK (
    is_internal = FALSE OR author_type IN ('internal', 'system')
  )
);

CREATE INDEX idx_support_tickets_organization_status ON public.support_tickets(organization_id, status);

CREATE INDEX idx_support_tickets_client_status ON public.support_tickets(client_id, status);

CREATE INDEX idx_support_tickets_contract_status ON public.support_tickets(contract_id, status);

CREATE INDEX idx_support_tickets_project_id ON public.support_tickets(project_id);

CREATE INDEX idx_support_tickets_sla_status ON public.support_tickets(sla_due_at, status);

CREATE INDEX idx_support_messages_ticket_created ON public.support_messages(ticket_id, created_at);

CREATE OR REPLACE FUNCTION private.sync_support_ticket_status_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
    NEW.closed_at := NULL;
  ELSIF NEW.status = 'closed' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, NOW());
    NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
  ELSE
    NEW.resolved_at := NULL;
    NEW.closed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_support_ticket_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_ticket_id UUID;
  next_last_message_at TIMESTAMPTZ;
BEGIN
  target_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);

  SELECT MAX(created_at)
  INTO next_last_message_at
  FROM public.support_messages
  WHERE ticket_id = target_ticket_id;

  UPDATE public.support_tickets
  SET last_message_at = next_last_message_at,
      updated_at = NOW()
  WHERE id = target_ticket_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.sync_support_ticket_status_timestamps() FROM PUBLIC;

REVOKE ALL ON FUNCTION private.sync_support_ticket_last_message() FROM PUBLIC;

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_messages_updated_at
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sync_support_ticket_status_timestamps
  BEFORE INSERT OR UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.sync_support_ticket_status_timestamps();

CREATE TRIGGER sync_support_ticket_last_message_after_message_change
  AFTER INSERT OR UPDATE OR DELETE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION private.sync_support_ticket_last_message();

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('client_member', 'support.write')
ON CONFLICT (role_key, permission_key) DO NOTHING;

UPDATE public.platform_modules
SET base = false,
    internal_route = '/support',
    portal_route = '/portal/support',
    required_permissions = ARRAY['support.read'],
    updated_at = NOW()
WHERE key = 'support';


-- source: 20260604131353_flow_builder_lite.sql
-- Flow Builder Lite for commercial automations.

CREATE TABLE IF NOT EXISTS public.automation_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived', 'failed')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sector_template_key TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.automation_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, trigger_type)
);

CREATE TABLE IF NOT EXISTS public.automation_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists')),
  value JSONB,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('create_task', 'change_stage', 'assign_owner', 'send_whatsapp', 'create_ticket', 'update_field', 'register_activity')),
  order_index INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'skipped')),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload) = 'object'),
  last_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.automation_execution_runs(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.automation_actions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'skipped')),
  sanitized_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_payload) = 'object'),
  sanitized_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  sector_template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_template JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(trigger_template) = 'object'),
  condition_templates JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(condition_templates) = 'array'),
  action_templates JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(action_templates) = 'array'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sector_template_key, name)
);

CREATE INDEX IF NOT EXISTS idx_automation_flows_org_status ON public.automation_flows(organization_id, status, is_enabled);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_type ON public.automation_triggers(trigger_type);

CREATE INDEX IF NOT EXISTS idx_automation_conditions_flow_order ON public.automation_conditions(flow_id, order_index);

CREATE INDEX IF NOT EXISTS idx_automation_actions_flow_order ON public.automation_actions(flow_id, order_index);

CREATE INDEX IF NOT EXISTS idx_automation_execution_runs_flow_created ON public.automation_execution_runs(flow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_execution_runs_lead_created ON public.automation_execution_runs(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_execution_steps_run ON public.automation_execution_steps(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_automation_templates_sector ON public.automation_templates(sector_template_key, is_active);

INSERT INTO public.automation_templates (
  organization_id,
  sector_template_key,
  name,
  description,
  trigger_template,
  condition_templates,
  action_templates
) VALUES
  (NULL, 'clinic', 'Lead qualificado: tarefa e WhatsApp', 'Follow-up rapido para leads de clinicas.', '{"triggerType":"lead.stage_changed"}', '[{"field":"source","operator":"exists"}]', '[{"actionType":"create_task","payload":{"title":"Follow-up comercial"}},{"actionType":"send_whatsapp","payload":{"body":"Ola, podemos te ajudar com o agendamento?"}}]'),
  (NULL, 'agency', 'Briefing recebido: atividade interna', 'Registra atividade e atribui responsavel.', '{"triggerType":"lead.created"}', '[{"field":"source","operator":"not_equals","value":"spam"}]', '[{"actionType":"register_activity","payload":{"title":"Briefing recebido"}},{"actionType":"assign_owner","payload":{}}]')
ON CONFLICT (organization_id, sector_template_key, name) DO UPDATE SET
  description = EXCLUDED.description,
  trigger_template = EXCLUDED.trigger_template,
  condition_templates = EXCLUDED.condition_templates,
  action_templates = EXCLUDED.action_templates,
  is_active = true,
  updated_at = NOW();


-- source: 20260604131435_intelligent_automations_foundation.sql
-- Intelligent automation foundation: flow versioning, risk metadata and simulation runs.

ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS automation_kind TEXT NOT NULL DEFAULT 'flow' CHECK (automation_kind IN ('flow', 'sequence')),
  ADD COLUMN IF NOT EXISTS builder_mode TEXT NOT NULL DEFAULT 'guided' CHECK (builder_mode IN ('guided', 'technical')),
  ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  ADD COLUMN IF NOT EXISTS active_version_id UUID,
  ADD COLUMN IF NOT EXISTS daily_run_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_run_limit >= 0),
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high'));

ALTER TABLE public.automation_actions
  DROP CONSTRAINT IF EXISTS automation_actions_action_type_check;

ALTER TABLE public.automation_actions
  ADD CONSTRAINT automation_actions_action_type_check CHECK (
    action_type IN (
      'create_task',
      'change_stage',
      'assign_owner',
      'send_whatsapp',
      'send_email',
      'create_ticket',
      'update_field',
      'register_activity',
      'webhook',
      'call_api',
      'convert_proposal',
      'create_project',
      'create_invoice',
      'ai_classify_lead',
      'ai_generate_message',
      'ai_generate_proposal'
    )
  );

CREATE TABLE IF NOT EXISTS public.automation_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, version_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'automation_flows_active_version_fkey'
      AND conrelid = 'public.automation_flows'::regclass
  ) THEN
    ALTER TABLE public.automation_flows
      ADD CONSTRAINT automation_flows_active_version_fkey
      FOREIGN KEY (active_version_id) REFERENCES public.automation_flow_versions(id) ON DELETE SET NULL;
  END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.automation_simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  sample_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sample_payload) = 'object'),
  matched BOOLEAN NOT NULL DEFAULT false,
  condition_results JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(condition_results) = 'array'),
  planned_actions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(planned_actions) = 'array'),
  blocked_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  estimated_ai_cost NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (estimated_ai_cost >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_flow_versions_flow ON public.automation_flow_versions(flow_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_automation_simulation_runs_org ON public.automation_simulation_runs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_simulation_runs_flow ON public.automation_simulation_runs(flow_id, created_at DESC);


-- source: 20260604131459_automation_sequences.sql
-- Commercial automation sequences: multichannel rules and conversion metadata.

ALTER TABLE public.crm_sequences
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('email', 'whatsapp', 'mixed')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  ADD COLUMN IF NOT EXISTS sector_template_key TEXT,
  ADD COLUMN IF NOT EXISTS conversion_goal TEXT,
  ADD COLUMN IF NOT EXISTS active_enrollment_count INTEGER NOT NULL DEFAULT 0 CHECK (active_enrollment_count >= 0),
  ADD COLUMN IF NOT EXISTS converted_enrollment_count INTEGER NOT NULL DEFAULT 0 CHECK (converted_enrollment_count >= 0);

ALTER TABLE public.crm_sequence_steps
  ADD COLUMN IF NOT EXISTS step_kind TEXT NOT NULL DEFAULT 'message' CHECK (step_kind IN ('message', 'delay', 'task', 'ai', 'webhook')),
  ADD COLUMN IF NOT EXISTS channel TEXT CHECK (channel IS NULL OR channel IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS requires_human_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object');

CREATE INDEX IF NOT EXISTS idx_crm_sequences_channel_status ON public.crm_sequences(organization_id, channel, status);

CREATE INDEX IF NOT EXISTS idx_crm_sequences_sector ON public.crm_sequences(sector_template_key, status);


-- source: 20260604131559_smtp2go_email_hub.sql
-- Shared SMTP2GO email hub for transactional, operational and marketing email.

CREATE TABLE IF NOT EXISTS public.email_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp2go' CHECK (provider IN ('smtp2go')),
  status TEXT NOT NULL DEFAULT 'needs_setup' CHECK (status IN ('connected', 'stale', 'needs_setup', 'failed')),
  token_reference TEXT,
  default_from_email TEXT,
  default_from_name TEXT,
  daily_send_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
  last_verified_at TIMESTAMPTZ,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS public.smtp2go_subaccounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.email_provider_connections(id) ON DELETE CASCADE,
  smtp2go_account_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  monthly_quota INTEGER NOT NULL DEFAULT 0 CHECK (monthly_quota >= 0),
  daily_send_limit INTEGER NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, smtp2go_account_id)
);

CREATE TABLE IF NOT EXISTS public.email_send_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.email_provider_connections(id) ON DELETE SET NULL,
  subaccount_id UUID REFERENCES public.smtp2go_subaccounts(id) ON DELETE SET NULL,
  email_kind TEXT NOT NULL CHECK (email_kind IN ('transactional', 'marketing', 'operational')),
  module_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_opt_in BOOLEAN NOT NULL DEFAULT false,
  subject TEXT NOT NULL CHECK (BTRIM(subject) <> ''),
  body_html TEXT,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'rejected', 'suppressed')),
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (body_html IS NOT NULL OR body_text IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.email_send_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.email_send_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_payload) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_suppression_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'spam', 'unsubscribe', 'manual', 'provider_reject')),
  source TEXT NOT NULL DEFAULT 'smtp2go',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS public.email_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subaccount_id UUID REFERENCES public.smtp2go_subaccounts(id) ON DELETE SET NULL,
  period_date DATE NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, subaccount_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_email_provider_connections_org ON public.email_provider_connections(organization_id, provider);

CREATE INDEX IF NOT EXISTS idx_smtp2go_subaccounts_org ON public.smtp2go_subaccounts(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_email_send_requests_org_status ON public.email_send_requests(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_requests_recipient ON public.email_send_requests(organization_id, recipient_email);

CREATE INDEX IF NOT EXISTS idx_email_send_events_request ON public.email_send_events(request_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_org_email ON public.email_suppression_entries(organization_id, email);

CREATE INDEX IF NOT EXISTS idx_email_usage_counters_org_date ON public.email_usage_counters(organization_id, period_date DESC);


-- source: 20260604131631_automation_sector_templates.sql
-- Sector template catalog for guided intelligent automations.

CREATE TABLE IF NOT EXISTS public.automation_sector_template_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_template_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  category TEXT NOT NULL DEFAULT 'commercial',
  recommended_modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blueprint JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(blueprint) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sector_template_key, template_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_sector_template_catalog_sector
  ON public.automation_sector_template_catalog(sector_template_key, is_active);

INSERT INTO public.automation_sector_template_catalog (
  sector_template_key,
  template_key,
  name,
  description,
  recommended_modules,
  blueprint
) VALUES
  ('clinic', 'clinic_reactivation_sequence', 'Reativacao de pacientes', 'Sequencia de lembretes e recuperacao de agenda.', ARRAY['crm', 'omnichannel', 'finance'], '{"trigger":"lead.stage_changed","sequenceChannel":"mixed","goal":"appointment_booked","steps":["whatsapp_message","email_reminder","crm_task"]}'),
  ('real_estate', 'real_estate_visit_followup', 'Follow-up de visita imobiliaria', 'Nutre interessados apos visita e alerta corretor.', ARRAY['crm', 'omnichannel', 'proposals'], '{"trigger":"lead.stage_changed","sequenceChannel":"whatsapp","goal":"visit_scheduled","steps":["whatsapp_message","crm_task","proposal_link"]}'),
  ('dealer', 'dealer_quote_recovery', 'Recuperacao de proposta de veiculo', 'Reengaja lead com proposta visualizada e sem resposta.', ARRAY['crm', 'proposals', 'campaigns'], '{"trigger":"proposal.viewed","sequenceChannel":"mixed","goal":"proposal_approved","steps":["email_offer","whatsapp_message","manager_alert"]}'),
  ('workshop', 'workshop_service_reminder', 'Lembrete de manutencao', 'Dispara contato proativo por ciclo de servico.', ARRAY['crm', 'omnichannel', 'support'], '{"trigger":"ticket.overdue","sequenceChannel":"whatsapp","goal":"service_booked","steps":["whatsapp_template","support_ticket","crm_task"]}'),
  ('agency', 'agency_briefing_onboarding', 'Onboarding de briefing', 'Organiza briefing, proposta e projeto para agencias.', ARRAY['crm', 'proposals', 'projects'], '{"trigger":"landing_page.form_submitted","sequenceChannel":"mixed","goal":"proposal_sent","steps":["email_briefing","ai_summary","proposal_task"]}')
ON CONFLICT (sector_template_key, template_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  recommended_modules = EXCLUDED.recommended_modules,
  blueprint = EXCLUDED.blueprint,
  is_active = true,
  updated_at = NOW();


-- source: 20260604221919_yux_hub_admin_platform.sql
-- YUX Hub admin platform data foundation.

DO $$
BEGIN
  CREATE TYPE public.platform_provider_type AS ENUM (
    'llm',
    'email',
    'whatsapp',
    'ads',
    'webhook',
    'automation',
    'storage',
    'database',
    'internal_service'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.platform_provider_status AS ENUM (
    'not_configured',
    'active',
    'degraded',
    'failed',
    'disabled',
    'needs_reauth',
    'stale'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

CREATE TABLE IF NOT EXISTS public.client_module_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  limit_key TEXT NOT NULL,
  limit_value NUMERIC NOT NULL CHECK (limit_value >= 0),
  source TEXT NOT NULL DEFAULT 'contract' CHECK (source IN ('package', 'contract', 'manual_override')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contract_id, module_key, limit_key),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.platform_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type public.platform_provider_type NOT NULL,
  provider_key TEXT NOT NULL CHECK (BTRIM(provider_key) <> ''),
  display_name TEXT NOT NULL CHECK (BTRIM(display_name) <> ''),
  environment TEXT NOT NULL DEFAULT 'production' CHECK (BTRIM(environment) <> ''),
  status public.platform_provider_status NOT NULL DEFAULT 'not_configured',
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_reference TEXT,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  fallback_provider_id UUID REFERENCES public.platform_provider_connections(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_type, provider_key, environment),
  CHECK (fallback_provider_id IS NULL OR fallback_provider_id <> id)
);

CREATE TABLE IF NOT EXISTS public.client_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID NOT NULL REFERENCES public.platform_provider_connections(id) ON DELETE CASCADE,
  module_key TEXT,
  status public.platform_provider_status NOT NULL DEFAULT 'not_configured',
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_reference TEXT,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  inherits_global BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_connection_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.platform_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used_value NUMERIC NOT NULL DEFAULT 0 CHECK (used_value >= 0),
  limit_value NUMERIC CHECK (limit_value IS NULL OR limit_value >= 0),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'near_limit', 'over_limit', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contract_id, module_key, resource_key, period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  safe_before JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_before) = 'object'),
  safe_after JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_after) = 'object'),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_module_limits_org_module
  ON public.client_module_limits(organization_id, module_key);

CREATE INDEX IF NOT EXISTS idx_client_module_limits_contract
  ON public.client_module_limits(contract_id) WHERE contract_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_module_limits_without_contract
  ON public.client_module_limits(organization_id, module_key, limit_key)
  WHERE contract_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_module_limits_effective
  ON public.client_module_limits(effective_from, effective_until);

CREATE INDEX IF NOT EXISTS idx_provider_connections_type_status
  ON public.platform_provider_connections(provider_type, status);

CREATE INDEX IF NOT EXISTS idx_provider_connections_default
  ON public.platform_provider_connections(provider_type, environment) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_client_provider_settings_org
  ON public.client_provider_settings(organization_id, module_key);

CREATE INDEX IF NOT EXISTS idx_client_provider_settings_provider
  ON public.client_provider_settings(provider_connection_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_provider_settings_global_module
  ON public.client_provider_settings(organization_id, provider_connection_id)
  WHERE module_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_usage_counters_org_period
  ON public.platform_usage_counters(organization_id, period_start DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_usage_counters_without_contract
  ON public.platform_usage_counters(organization_id, module_key, resource_key, period_start, period_end)
  WHERE contract_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_usage_counters_status
  ON public.platform_usage_counters(status, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_created
  ON public.platform_admin_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_org
  ON public.platform_admin_audit_events(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_events_entity
  ON public.platform_admin_audit_events(entity_type, entity_id) WHERE entity_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_client_module_limits_updated_at ON public.client_module_limits;

CREATE TRIGGER update_client_module_limits_updated_at
  BEFORE UPDATE ON public.client_module_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_provider_connections_updated_at ON public.platform_provider_connections;

CREATE TRIGGER update_platform_provider_connections_updated_at
  BEFORE UPDATE ON public.platform_provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_provider_settings_updated_at ON public.client_provider_settings;

CREATE TRIGGER update_client_provider_settings_updated_at
  BEFORE UPDATE ON public.client_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_usage_counters_updated_at ON public.platform_usage_counters;

CREATE TRIGGER update_platform_usage_counters_updated_at
  BEFORE UPDATE ON public.platform_usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260604225834_yux_hub_admin_provider_defaults.sql
-- Default global providers for YUX Hub administration.
-- Secret values stay in Supabase/Vercel/server-side secrets. The database stores
-- only safe references and operational metadata.

WITH openai_fallback AS (
  INSERT INTO public.platform_provider_connections (
    provider_type,
    provider_key,
    display_name,
    environment,
    status,
    public_config,
    secret_reference,
    is_default
  )
  VALUES (
    'llm',
    'openai_direct',
    'OpenAI direto',
    'production',
    'not_configured',
    jsonb_build_object(
      'baseUrl', 'https://api.openai.com/v1',
      'defaultModel', 'gpt-4.1-mini',
      'purpose', 'fallback externo quando o OpenRouter estiver indisponivel',
      'managedBy', 'YUX Hub Admin',
      'requiredSecret', 'OPENAI_API_KEY'
    ),
    'OPENAI_API_KEY',
    false
  )
  ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
        secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
        updated_at = NOW()
  RETURNING id
),
openrouter_default AS (
  INSERT INTO public.platform_provider_connections (
    provider_type,
    provider_key,
    display_name,
    environment,
    status,
    public_config,
    secret_reference,
    is_default,
    fallback_provider_id
  )
  VALUES (
    'llm',
    'openrouter',
    'OpenRouter',
    'production',
    'not_configured',
    jsonb_build_object(
      'baseUrl', 'https://openrouter.ai/api/v1',
      'chatCompletionsPath', '/chat/completions',
      'primaryModel', 'openai/gpt-4.1-mini',
      'fallbackModels', jsonb_build_array('anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'),
      'providerRouting', jsonb_build_object(
        'allowFallbacks', true,
        'sort', 'throughput'
      ),
      'externalFallbackProviderKey', 'openai_direct',
      'managedBy', 'YUX Hub Admin',
      'requiredSecret', 'OPENROUTER_API_KEY'
    ),
    'OPENROUTER_API_KEY',
    true,
    (SELECT id FROM openai_fallback)
  )
  ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
        secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
        is_default = true,
        fallback_provider_id = COALESCE(public.platform_provider_connections.fallback_provider_id, EXCLUDED.fallback_provider_id),
        updated_at = NOW()
  RETURNING id
)
INSERT INTO public.platform_provider_connections (
  provider_type,
  provider_key,
  display_name,
  environment,
  status,
  public_config,
  secret_reference,
  is_default
)
VALUES (
  'email',
  'smtp2go',
  'SMTP2GO',
  'production',
  'not_configured',
  jsonb_build_object(
    'purpose', 'infraestrutura compartilhada de email do YUX Hub',
    'subaccounts', true,
    'defaultDailySendLimit', 500,
    'defaultMonthlyQuota', 15000,
    'requiredSecret', 'SMTP2GO_API_KEY',
    'requiredWebhookSecret', 'SMTP2GO_WEBHOOK_SECRET',
    'sendFunction', 'send-email',
    'webhookFunction', 'smtp2go-webhook'
  ),
  'SMTP2GO_API_KEY',
  true
)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
      secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
      is_default = true,
      updated_at = NOW();


-- source: 20260605113540_meta_channel_connectors.sql
-- Official Meta channel connectors for WhatsApp, Instagram Direct and Facebook Messenger.

ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_channel_check;

ALTER TABLE public.channel_connections
  ADD CONSTRAINT channel_connections_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat'));

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat'));

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_verify_state TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS token_state TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS last_provider_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS protected_metadata_references JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_webhook_secret_reference TEXT;

ALTER TABLE public.channel_connections
  ADD COLUMN IF NOT EXISTS provider_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_business_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_display_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_username TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS connected_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS health_summary TEXT,
  ADD COLUMN IF NOT EXISTS fallback_mode TEXT NOT NULL DEFAULT 'official';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_provider_verify_state_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_provider_verify_state_check
      CHECK (provider_verify_state IN ('not_configured', 'pending', 'verified', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_token_state_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_token_state_check
      CHECK (token_state IN ('not_configured', 'connected', 'stale', 'needs_reauth', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_protected_metadata_references_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_protected_metadata_references_check
      CHECK (jsonb_typeof(protected_metadata_references) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_health_status_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_health_status_check
      CHECK (health_status IN ('not_configured', 'pending', 'connected', 'stale', 'needs_reauth', 'failed', 'disabled', 'disconnected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_connections_fallback_mode_check'
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT channel_connections_fallback_mode_check
      CHECK (fallback_mode IN ('official', 'n8n'));
  END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.meta_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_channel TEXT NOT NULL CHECK (requested_channel IN ('whatsapp', 'instagram', 'messenger')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'expired')),
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier_hash TEXT,
  sanitized_result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error_text TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_connection_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('connected', 'reconnected', 'disconnected', 'token_failed', 'webhook_failed', 'status_changed', 'test_sent', 'admin_action')),
  source TEXT NOT NULL CHECK (source IN ('portal', 'admin_yux', 'health_job', 'webhook', 'edge_function')),
  safe_before JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_before) = 'object'),
  safe_after JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_after) = 'object'),
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'email', 'webchat')),
  previous_status TEXT,
  next_status TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('manual', 'scheduled', 'webhook', 'outbound', 'reauth')),
  sanitized_response JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_response) = 'object'),
  protected_error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_connections_meta_org_channel
  ON public.channel_connections(organization_id, channel, health_status, token_state);

CREATE INDEX IF NOT EXISTS idx_channel_connections_meta_asset
  ON public.channel_connections(channel, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_oauth_sessions_org_status
  ON public.meta_oauth_sessions(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_connection_audit_connection
  ON public.channel_connection_audit_events(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_health_checks_connection
  ON public.channel_health_checks(connection_id, created_at DESC);


-- source: 20260605153435_automation_graph_and_materials.sql
-- Support for visual node graphs, branching checks and organization materials.

-- 1. Update builder_mode check constraint on automation_flows to allow 'node'
ALTER TABLE public.automation_flows
  DROP CONSTRAINT IF EXISTS automation_flows_builder_mode_check;

ALTER TABLE public.automation_flows
  ADD CONSTRAINT automation_flows_builder_mode_check CHECK (builder_mode IN ('guided', 'technical', 'node'));

-- 2. Add graph column to automation_flows
ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS graph JSONB CHECK (graph IS NULL OR jsonb_typeof(graph) = 'object');

-- 3. Add max_upload_size_mb to omnichannel_settings
ALTER TABLE public.omnichannel_settings
  ADD COLUMN IF NOT EXISTS max_upload_size_mb INTEGER NOT NULL DEFAULT 10 CHECK (max_upload_size_mb > 0);

-- 4. Create organization_materials table for storing materials
CREATE TABLE IF NOT EXISTS public.organization_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at column
DROP TRIGGER IF EXISTS update_organization_materials_updated_at ON public.organization_materials;

CREATE TRIGGER update_organization_materials_updated_at BEFORE UPDATE ON public.organization_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260605154338_commercial_module_registry.sql
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


-- source: 20260605154538_sector_funnel_blueprints.sql
-- Sector funnel templates and blueprint application assets.

CREATE TABLE public.blueprint_pipeline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, key)
);

CREATE TABLE public.blueprint_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.blueprint_pipeline_templates(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  color TEXT NOT NULL DEFAULT '#64748b',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, key),
  CONSTRAINT blueprint_pipeline_stage_outcome CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE public.blueprint_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  label TEXT NOT NULL CHECK (BTRIM(label) <> ''),
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean')),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, key)
);

CREATE TABLE public.blueprint_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'webchat')),
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, key)
);

CREATE TABLE public.blueprint_automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  trigger_event TEXT NOT NULL CHECK (BTRIM(trigger_event) <> ''),
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(draft_payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, key)
);

CREATE TABLE public.blueprint_report_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  metric_keys TEXT[] NOT NULL DEFAULT '{}',
  layout JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(layout) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, key)
);

CREATE TABLE public.blueprint_application_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(summary) = 'object'),
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, contract_id)
);

CREATE INDEX idx_blueprint_pipeline_templates_blueprint ON public.blueprint_pipeline_templates(blueprint_id);

CREATE INDEX idx_blueprint_pipeline_stages_template ON public.blueprint_pipeline_stages(template_id, order_index);

CREATE INDEX idx_blueprint_custom_fields_blueprint ON public.blueprint_custom_fields(blueprint_id, order_index);

CREATE INDEX idx_blueprint_message_templates_blueprint ON public.blueprint_message_templates(blueprint_id);

CREATE INDEX idx_blueprint_automation_templates_blueprint ON public.blueprint_automation_templates(blueprint_id);

CREATE INDEX idx_blueprint_report_presets_blueprint ON public.blueprint_report_presets(blueprint_id);

CREATE INDEX idx_blueprint_application_runs_contract ON public.blueprint_application_runs(contract_id, status);

CREATE INDEX idx_blueprint_application_runs_organization ON public.blueprint_application_runs(organization_id, status);

CREATE TRIGGER update_blueprint_pipeline_templates_updated_at
  BEFORE UPDATE ON public.blueprint_pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blueprint_pipeline_stages_updated_at
  BEFORE UPDATE ON public.blueprint_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blueprint_custom_fields_updated_at
  BEFORE UPDATE ON public.blueprint_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blueprint_message_templates_updated_at
  BEFORE UPDATE ON public.blueprint_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blueprint_automation_templates_updated_at
  BEFORE UPDATE ON public.blueprint_automation_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blueprint_report_presets_updated_at
  BEFORE UPDATE ON public.blueprint_report_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blueprint_application_runs_updated_at
  BEFORE UPDATE ON public.blueprint_application_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.blueprints (key, name, sector, description)
VALUES
  ('oficinas', 'Oficinas e Assistencias', 'Servicos Tecnicos', 'Blueprint para atendimento, diagnostico, orcamento e reativacao de clientes.')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  description = EXCLUDED.description,
  updated_at = NOW();

WITH blueprint_map(blueprint_key, module_key) AS (
  VALUES
    ('oficinas', 'clients'), ('oficinas', 'crm'), ('oficinas', 'whatsapp_ai'), ('oficinas', 'landing_pages'), ('oficinas', 'campaigns'), ('oficinas', 'bi_reports'), ('oficinas', 'support')
)
INSERT INTO public.blueprint_modules (blueprint_id, module_key)
SELECT b.id, bm.module_key
FROM blueprint_map bm
JOIN public.blueprints b ON b.key = bm.blueprint_key
ON CONFLICT (blueprint_id, module_key) DO NOTHING;

WITH template_seed(blueprint_key, template_key, template_name, template_description) AS (
  VALUES
    ('clinicas', 'clinic_growth', 'Funil de captacao para clinicas', 'Triagem, agendamento, comparecimento e reativacao.'),
    ('imobiliarias', 'real_estate_sales', 'Funil comercial imobiliario', 'Qualificacao de interessados, visita e proposta.'),
    ('revendas_carro', 'vehicle_dealer_sales', 'Funil para revendas de veiculos', 'Interesse, avaliacao, test-drive e fechamento.'),
    ('oficinas', 'repair_shop_service', 'Funil para oficinas e assistencias', 'Diagnostico, orcamento, aprovacao e entrega.'),
    ('agencias', 'agency_growth', 'Funil comercial para agencias', 'Briefing, proposta, negociacao e onboarding.')
)
INSERT INTO public.blueprint_pipeline_templates (blueprint_id, key, name, description)
SELECT b.id, ts.template_key, ts.template_name, ts.template_description
FROM template_seed ts
JOIN public.blueprints b ON b.key = ts.blueprint_key
ON CONFLICT (blueprint_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

WITH stage_seed(blueprint_key, template_key, stage_key, stage_name, color, order_index, is_won, is_lost) AS (
  VALUES
    ('clinicas', 'clinic_growth', 'new', 'Novo lead', '#2563eb', 0, FALSE, FALSE),
    ('clinicas', 'clinic_growth', 'ai_triage', 'Triagem IA', '#7c3aed', 1, FALSE, FALSE),
    ('clinicas', 'clinic_growth', 'appointment_pending', 'Agendamento pendente', '#d97706', 2, FALSE, FALSE),
    ('clinicas', 'clinic_growth', 'appointment_confirmed', 'Consulta confirmada', '#0891b2', 3, FALSE, FALSE),
    ('clinicas', 'clinic_growth', 'attended', 'Compareceu', '#16a34a', 4, TRUE, FALSE),
    ('clinicas', 'clinic_growth', 'post_consultation', 'Pos-consulta', '#64748b', 5, FALSE, FALSE),
    ('clinicas', 'clinic_growth', 'future_reactivation', 'Reativacao futura', '#475569', 6, FALSE, FALSE),
    ('imobiliarias', 'real_estate_sales', 'new', 'Novo interessado', '#2563eb', 0, FALSE, FALSE),
    ('imobiliarias', 'real_estate_sales', 'qualified', 'Perfil qualificado', '#7c3aed', 1, FALSE, FALSE),
    ('imobiliarias', 'real_estate_sales', 'visit_scheduled', 'Visita agendada', '#d97706', 2, FALSE, FALSE),
    ('imobiliarias', 'real_estate_sales', 'proposal', 'Proposta enviada', '#0891b2', 3, FALSE, FALSE),
    ('imobiliarias', 'real_estate_sales', 'won', 'Contrato fechado', '#16a34a', 4, TRUE, FALSE),
    ('imobiliarias', 'real_estate_sales', 'lost', 'Perdido', '#dc2626', 5, FALSE, TRUE),
    ('revendas_carro', 'vehicle_dealer_sales', 'new', 'Novo lead', '#2563eb', 0, FALSE, FALSE),
    ('revendas_carro', 'vehicle_dealer_sales', 'vehicle_match', 'Veiculo de interesse', '#7c3aed', 1, FALSE, FALSE),
    ('revendas_carro', 'vehicle_dealer_sales', 'test_drive', 'Test-drive', '#d97706', 2, FALSE, FALSE),
    ('revendas_carro', 'vehicle_dealer_sales', 'financing', 'Financiamento', '#0891b2', 3, FALSE, FALSE),
    ('revendas_carro', 'vehicle_dealer_sales', 'won', 'Venda fechada', '#16a34a', 4, TRUE, FALSE),
    ('oficinas', 'repair_shop_service', 'new', 'Novo atendimento', '#2563eb', 0, FALSE, FALSE),
    ('oficinas', 'repair_shop_service', 'diagnosis', 'Diagnostico', '#7c3aed', 1, FALSE, FALSE),
    ('oficinas', 'repair_shop_service', 'quote_sent', 'Orcamento enviado', '#d97706', 2, FALSE, FALSE),
    ('oficinas', 'repair_shop_service', 'approved', 'Servico aprovado', '#0891b2', 3, FALSE, FALSE),
    ('oficinas', 'repair_shop_service', 'delivered', 'Entregue', '#16a34a', 4, TRUE, FALSE),
    ('agencias', 'agency_growth', 'new', 'Novo lead', '#2563eb', 0, FALSE, FALSE),
    ('agencias', 'agency_growth', 'briefing', 'Briefing', '#7c3aed', 1, FALSE, FALSE),
    ('agencias', 'agency_growth', 'proposal', 'Proposta', '#d97706', 2, FALSE, FALSE),
    ('agencias', 'agency_growth', 'negotiation', 'Negociacao', '#0891b2', 3, FALSE, FALSE),
    ('agencias', 'agency_growth', 'won', 'Onboarding', '#16a34a', 4, TRUE, FALSE)
)
INSERT INTO public.blueprint_pipeline_stages (template_id, key, name, color, order_index, is_won, is_lost)
SELECT t.id, ss.stage_key, ss.stage_name, ss.color, ss.order_index, ss.is_won, ss.is_lost
FROM stage_seed ss
JOIN public.blueprints b ON b.key = ss.blueprint_key
JOIN public.blueprint_pipeline_templates t ON t.blueprint_id = b.id AND t.key = ss.template_key
ON CONFLICT (template_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  order_index = EXCLUDED.order_index,
  is_won = EXCLUDED.is_won,
  is_lost = EXCLUDED.is_lost,
  updated_at = NOW();

WITH field_seed(blueprint_key, field_key, label, field_type, required, order_index, options) AS (
  VALUES
    ('clinicas', 'specialty', 'Especialidade', 'text', TRUE, 0, '[]'::jsonb),
    ('clinicas', 'desired_date', 'Data desejada', 'date', FALSE, 1, '[]'::jsonb),
    ('imobiliarias', 'property_type', 'Tipo de imovel', 'select', TRUE, 0, '["Apartamento","Casa","Comercial"]'::jsonb),
    ('revendas_carro', 'vehicle_interest', 'Veiculo de interesse', 'text', TRUE, 0, '[]'::jsonb),
    ('oficinas', 'equipment_model', 'Modelo do equipamento', 'text', TRUE, 0, '[]'::jsonb),
    ('agencias', 'budget_range', 'Faixa de investimento', 'select', FALSE, 0, '["Ate 5k","5k a 15k","15k+"]'::jsonb)
)
INSERT INTO public.blueprint_custom_fields (blueprint_id, key, label, field_type, required, order_index, options)
SELECT b.id, fs.field_key, fs.label, fs.field_type, fs.required, fs.order_index, fs.options
FROM field_seed fs
JOIN public.blueprints b ON b.key = fs.blueprint_key
ON CONFLICT (blueprint_id, key) DO UPDATE SET
  label = EXCLUDED.label,
  field_type = EXCLUDED.field_type,
  required = EXCLUDED.required,
  order_index = EXCLUDED.order_index,
  options = EXCLUDED.options,
  updated_at = NOW();

WITH message_seed(blueprint_key, template_key, name, channel, body) AS (
  VALUES
    ('clinicas', 'appointment_confirmation', 'Confirmacao de consulta', 'whatsapp', 'Ola, sua consulta foi confirmada. Podemos ajudar em mais alguma coisa?'),
    ('imobiliarias', 'visit_reminder', 'Lembrete de visita', 'whatsapp', 'Sua visita ao imovel esta confirmada. Enviaremos os detalhes em instantes.'),
    ('revendas_carro', 'test_drive_invite', 'Convite para test-drive', 'whatsapp', 'Temos horario para test-drive. Qual periodo funciona melhor?'),
    ('oficinas', 'quote_follow_up', 'Follow-up de orcamento', 'whatsapp', 'Seu orcamento esta pronto para aprovacao. Posso tirar alguma duvida?'),
    ('agencias', 'proposal_follow_up', 'Follow-up de proposta', 'email', 'Enviamos a proposta e podemos revisar juntos os proximos passos.')
)
INSERT INTO public.blueprint_message_templates (blueprint_id, key, name, channel, body)
SELECT b.id, ms.template_key, ms.name, ms.channel, ms.body
FROM message_seed ms
JOIN public.blueprints b ON b.key = ms.blueprint_key
ON CONFLICT (blueprint_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  channel = EXCLUDED.channel,
  body = EXCLUDED.body,
  updated_at = NOW();

WITH automation_seed(blueprint_key, template_key, name, trigger_event, draft_payload) AS (
  VALUES
    ('clinicas', 'reactivation_30d', 'Reativacao 30 dias', 'lead_stale', '{"days":30}'::jsonb),
    ('imobiliarias', 'visit_no_show', 'Reagendar visita nao realizada', 'visit_missed', '{"delayHours":4}'::jsonb),
    ('revendas_carro', 'test_drive_followup', 'Follow-up pos test-drive', 'test_drive_done', '{"delayHours":2}'::jsonb),
    ('oficinas', 'quote_expiring', 'Orcamento pendente', 'quote_sent', '{"delayHours":24}'::jsonb),
    ('agencias', 'proposal_nudge', 'Lembrete de proposta', 'proposal_sent', '{"delayDays":2}'::jsonb)
)
INSERT INTO public.blueprint_automation_templates (blueprint_id, key, name, trigger_event, draft_payload, status)
SELECT b.id, aus.template_key, aus.name, aus.trigger_event, aus.draft_payload, 'draft'
FROM automation_seed aus
JOIN public.blueprints b ON b.key = aus.blueprint_key
ON CONFLICT (blueprint_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  trigger_event = EXCLUDED.trigger_event,
  draft_payload = EXCLUDED.draft_payload,
  status = 'draft',
  updated_at = NOW();

WITH report_seed(blueprint_key, preset_key, name, metric_keys) AS (
  VALUES
    ('clinicas', 'clinic_roi', 'ROI por campanha e agendamento', ARRAY['spend','leads','appointments','attendance']),
    ('imobiliarias', 'real_estate_conversion', 'Conversao por visita', ARRAY['leads','visits','proposals','won']),
    ('revendas_carro', 'dealer_performance', 'Performance por veiculo', ARRAY['leads','test_drives','financing','won']),
    ('oficinas', 'repair_quotes', 'Orcamentos e aprovacoes', ARRAY['leads','quotes','approved','delivered']),
    ('agencias', 'agency_mroi', 'MROI por proposta', ARRAY['spend','leads','proposals','won'])
)
INSERT INTO public.blueprint_report_presets (blueprint_id, key, name, metric_keys)
SELECT b.id, rs.preset_key, rs.name, rs.metric_keys
FROM report_seed rs
JOIN public.blueprints b ON b.key = rs.blueprint_key
ON CONFLICT (blueprint_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  metric_keys = EXCLUDED.metric_keys,
  updated_at = NOW();


-- source: 20260605154759_landing_pages.sql
-- Landing Pages module: assets, versions, forms, events, change requests, and approvals.

CREATE OR REPLACE FUNCTION private.can_read_landing_page_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'landing_pages'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_landing_page_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_landing_page_contract(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_landing_page_organization(UUID) FROM PUBLIC;

CREATE TABLE public.landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  initial_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  slug TEXT NOT NULL CHECK (BTRIM(slug) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'paused', 'archived')),
  preview_url TEXT,
  published_url TEXT,
  thumbnail_url TEXT,
  primary_cta_type TEXT NOT NULL DEFAULT 'form' CHECK (primary_cta_type IN ('form', 'whatsapp', 'phone', 'external_url')),
  primary_cta_value TEXT NOT NULL CHECK (BTRIM(primary_cta_value) <> ''),
  visits INTEGER NOT NULL DEFAULT 0 CHECK (visits >= 0),
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  pending_approvals INTEGER NOT NULL DEFAULT 0 CHECK (pending_approvals >= 0),
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, slug)
);

CREATE TABLE public.landing_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  preview_url TEXT,
  content_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_snapshot) = 'object'),
  internal_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (landing_page_id, version_number)
);

CREATE TABLE public.landing_page_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  submit_label TEXT NOT NULL DEFAULT 'Enviar',
  success_message TEXT NOT NULL DEFAULT 'Recebemos seus dados.',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_page_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.landing_page_forms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (BTRIM(field_name) <> ''),
  crm_field_key TEXT NOT NULL CHECK (BTRIM(crm_field_key) <> ''),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, field_name)
);

CREATE TABLE public.landing_page_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'lead', 'cta_click', 'form_submit', 'approval')),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_page_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  message TEXT NOT NULL CHECK (BTRIM(message) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.landing_page_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.landing_page_versions(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_page_approval_decision CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  )
);

CREATE INDEX idx_landing_pages_organization_status ON public.landing_pages(organization_id, status);

CREATE INDEX idx_landing_pages_client_status ON public.landing_pages(client_id, status);

CREATE INDEX idx_landing_pages_contract_status ON public.landing_pages(contract_id, status);

CREATE INDEX idx_landing_pages_campaign_id ON public.landing_pages(campaign_id);

CREATE INDEX idx_landing_pages_pipeline_id ON public.landing_pages(pipeline_id);

CREATE INDEX idx_landing_page_versions_page ON public.landing_page_versions(landing_page_id, version_number DESC);

CREATE INDEX idx_landing_page_forms_page ON public.landing_page_forms(landing_page_id);

CREATE INDEX idx_landing_page_field_mappings_form ON public.landing_page_field_mappings(form_id);

CREATE INDEX idx_landing_page_events_page_occurred ON public.landing_page_events(landing_page_id, occurred_at DESC);

CREATE INDEX idx_landing_page_change_requests_page ON public.landing_page_change_requests(landing_page_id, status);

CREATE INDEX idx_landing_page_approvals_page ON public.landing_page_approvals(landing_page_id, status);

CREATE TRIGGER update_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_landing_page_versions_updated_at
  BEFORE UPDATE ON public.landing_page_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_landing_page_forms_updated_at
  BEFORE UPDATE ON public.landing_page_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_landing_page_field_mappings_updated_at
  BEFORE UPDATE ON public.landing_page_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_landing_page_change_requests_updated_at
  BEFORE UPDATE ON public.landing_page_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_landing_page_approvals_updated_at
  BEFORE UPDATE ON public.landing_page_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260605154917_ai_assistant_settings.sql
-- Configurable AI assistant settings for omnichannel conversations.

CREATE TABLE IF NOT EXISTS public.ai_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'consultivo',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  summary_enabled BOOLEAN NOT NULL DEFAULT true,
  classification_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, client_id, contract_id, name)
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  objective_type TEXT NOT NULL CHECK (objective_type IN ('lead_qualification', 'support_triage', 'scheduling', 'sales_conversion', 'retention')),
  label TEXT NOT NULL,
  instructions TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assistant_id, objective_type)
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_required_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'contact' CHECK (source IN ('contact', 'lead', 'conversation', 'custom')),
  is_required BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assistant_id, field_key)
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_handoff_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('human_request', 'sentiment_intent', 'low_confidence', 'missing_required_field', 'safety')),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  min_confidence NUMERIC(4,3) CHECK (min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_safety_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  instructions TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_assistant_knowledge_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  knowledge_entry_id UUID NOT NULL REFERENCES public.knowledge_entries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assistant_id, knowledge_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_assistants_org_scope
  ON public.ai_assistants(organization_id, client_id, contract_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_objectives_assistant_priority
  ON public.ai_assistant_objectives(assistant_id, priority);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_required_fields_assistant_order
  ON public.ai_assistant_required_fields(assistant_id, order_index);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_handoff_rules_assistant_enabled
  ON public.ai_assistant_handoff_rules(assistant_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_safety_rules_assistant_enabled
  ON public.ai_assistant_safety_rules(assistant_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_ai_assistant_knowledge_links_entry
  ON public.ai_assistant_knowledge_links(knowledge_entry_id);


-- source: 20260605154949_operational_reports.sql
-- Operational reports and MROI snapshots.

CREATE TABLE IF NOT EXISTS public.report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'internal' CHECK (scope IN ('internal', 'portal')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_key TEXT NOT NULL,
  title TEXT NOT NULL,
  source_table TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_portal_visible BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, widget_key)
);

CREATE TABLE IF NOT EXISTS public.report_metric_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimensions) = 'object'),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, metric_key, dimensions)
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_org_period ON public.report_snapshots(organization_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_report_widgets_org_order ON public.report_widgets(organization_id, display_order);

CREATE INDEX IF NOT EXISTS idx_report_metric_cache_org_metric ON public.report_metric_cache(organization_id, metric_key, calculated_at DESC);


-- source: 20260605155123_campaigns_ads_api_core.sql
-- Campaigns and Ads API-first core with provider-neutral local mutation model.

CREATE OR REPLACE FUNCTION private.can_read_campaign_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'campaigns'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_campaign_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_campaign_contract(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_campaign_organization(UUID) FROM PUBLIC;

CREATE TABLE public.ad_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'needs_reauth' CHECK (status IN ('connected', 'stale', 'needs_reauth', 'failed')),
  token_reference TEXT,
  last_sync_at TIMESTAMPTZ,
  protected_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider, name)
);

CREATE TABLE public.ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_connection_id UUID NOT NULL REFERENCES public.ad_provider_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  external_account_id TEXT NOT NULL CHECK (BTRIM(external_account_id) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_account_id)
);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_connection_id UUID REFERENCES public.ad_provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ad_account_id UUID REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS initial_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS objective TEXT DEFAULT 'lead_generation',
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS daily_budget DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS total_budget DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpl DECIMAL(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mroi DECIMAL(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS protected_error TEXT;

UPDATE public.campaigns
SET provider = COALESCE(provider, CASE WHEN platform = 'META' THEN 'meta' ELSE 'google' END),
    lifecycle_status = CASE
      WHEN lifecycle_status IN ('draft', 'pending_approval', 'approved', 'syncing', 'active', 'paused', 'archived', 'failed') THEN lifecycle_status
      WHEN status = 'ACTIVE' THEN 'active'
      WHEN status = 'PAUSED' THEN 'paused'
      WHEN status = 'ENDED' THEN 'archived'
      ELSE 'draft'
    END,
    daily_budget = COALESCE(daily_budget, budget),
    total_budget = COALESCE(total_budget, budget),
    starts_at = COALESCE(starts_at, start_date::timestamptz),
    ends_at = COALESCE(ends_at, end_date::timestamptz),
    leads = COALESCE(NULLIF(leads, 0), conversions),
    cpl = CASE WHEN COALESCE(NULLIF(leads, 0), conversions) > 0 THEN spent / COALESCE(NULLIF(leads, 0), conversions) ELSE cpl END,
    mroi = CASE WHEN spent > 0 THEN (attributed_revenue - spent) / spent ELSE mroi END
WHERE provider IS NULL
   OR lifecycle_status IS NULL
   OR daily_budget IS NULL
   OR total_budget IS NULL
   OR starts_at IS NULL;

ALTER TABLE public.campaigns
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN objective SET NOT NULL,
  ALTER COLUMN lifecycle_status SET NOT NULL,
  ALTER COLUMN daily_budget SET NOT NULL;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_provider_check;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_provider_check CHECK (provider IN ('meta', 'google'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_objective_check;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_objective_check CHECK (objective IN ('lead_generation', 'traffic', 'conversions', 'awareness'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_lifecycle_status_check;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_lifecycle_status_check CHECK (lifecycle_status IN ('draft', 'pending_approval', 'approved', 'syncing', 'active', 'paused', 'archived', 'failed'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_budget_positive_check;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_budget_positive_check CHECK (daily_budget >= 0 AND (total_budget IS NULL OR total_budget >= 0));

CREATE TABLE public.campaign_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived', 'failed')),
  daily_budget DECIMAL(15,2),
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(targeting) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_set_id UUID REFERENCES public.campaign_ad_sets(id) ON DELETE SET NULL,
  external_id TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES public.campaign_ads(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  format TEXT NOT NULL DEFAULT 'image' CHECK (format IN ('image', 'video', 'carousel', 'text')),
  headline TEXT,
  body TEXT,
  media_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spend DECIMAL(15,2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
  raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_metrics) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.campaign_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ad_provider_mutation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_connection_id UUID REFERENCES public.ad_provider_connections(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'google')),
  action TEXT NOT NULL CHECK (action IN ('create_campaign', 'update_budget', 'pause_campaign', 'sync_metrics')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_payload) = 'object'),
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response_payload) = 'object'),
  protected_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_provider_connections_org_status ON public.ad_provider_connections(organization_id, status);

CREATE INDEX idx_ad_accounts_connection ON public.ad_accounts(provider_connection_id);

CREATE INDEX idx_campaigns_org_status ON public.campaigns(organization_id, lifecycle_status);

CREATE INDEX idx_campaigns_client_status ON public.campaigns(client_id, lifecycle_status);

CREATE INDEX idx_campaigns_contract_status ON public.campaigns(contract_id, lifecycle_status);

CREATE INDEX idx_campaigns_provider_connection ON public.campaigns(provider_connection_id);

CREATE INDEX idx_campaign_creatives_campaign ON public.campaign_creatives(campaign_id);

CREATE INDEX idx_campaign_metric_snapshots_campaign ON public.campaign_metric_snapshots(campaign_id, snapshot_at DESC);

CREATE INDEX idx_campaign_recommendations_campaign ON public.campaign_recommendations(campaign_id, status);

CREATE INDEX idx_campaign_alerts_campaign ON public.campaign_alerts(campaign_id, status);

CREATE INDEX idx_ad_provider_mutation_runs_campaign ON public.ad_provider_mutation_runs(campaign_id, created_at DESC);

CREATE TRIGGER update_ad_provider_connections_updated_at BEFORE UPDATE ON public.ad_provider_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_accounts_updated_at BEFORE UPDATE ON public.ad_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_ad_sets_updated_at BEFORE UPDATE ON public.campaign_ad_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_ads_updated_at BEFORE UPDATE ON public.campaign_ads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_creatives_updated_at BEFORE UPDATE ON public.campaign_creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_recommendations_updated_at BEFORE UPDATE ON public.campaign_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaign_alerts_updated_at BEFORE UPDATE ON public.campaign_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ad_provider_mutation_runs_updated_at BEFORE UPDATE ON public.ad_provider_mutation_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260605155240_crm_cockpit_upgrade.sql
-- CRM cockpit upgrade: templates, commercial lead fields, custom fields, and lead tasks.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_kind TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attribution_context JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.leads
  ALTER COLUMN status SET DEFAULT 'open',
  ALTER COLUMN score SET DEFAULT 0,
  ALTER COLUMN attribution_context SET DEFAULT '{}'::jsonb;

UPDATE public.leads
SET status = CASE
    WHEN UPPER(stage) = 'WON' THEN 'won'
    WHEN UPPER(stage) = 'LOST' THEN 'lost'
    WHEN status IN ('open', 'won', 'lost') THEN status
    ELSE 'open'
  END,
  won_at = CASE
    WHEN UPPER(stage) = 'WON' OR status = 'won' THEN COALESCE(won_at, updated_at, created_at, NOW())
    ELSE NULL
  END,
  lost_at = CASE
    WHEN UPPER(stage) = 'LOST' OR status = 'lost' THEN COALESCE(lost_at, updated_at, created_at, NOW())
    ELSE NULL
  END,
  owner_id = COALESCE(owner_id, assigned_to),
  last_activity_at = COALESCE(last_activity_at, updated_at, created_at),
  source_kind = CASE
    WHEN source_kind IN ('paid_campaign', 'landing_page', 'whatsapp_cta', 'organic', 'referral', 'manual') THEN source_kind
    WHEN LOWER(source) LIKE '%whatsapp%' THEN 'whatsapp_cta'
    WHEN LOWER(source) LIKE '%google%' OR LOWER(source) LIKE '%meta%' OR LOWER(source) LIKE '%ads%' THEN 'paid_campaign'
    WHEN LOWER(source) LIKE '%organic%' THEN 'organic'
    WHEN LOWER(source) LIKE '%referral%' OR LOWER(source) LIKE '%indic%' THEN 'referral'
    ELSE 'manual'
  END,
  attribution_context = COALESCE(attribution_context, '{}'::jsonb)
WHERE status IS NULL
   OR status NOT IN ('open', 'won', 'lost')
   OR owner_id IS NULL
   OR (status = 'won' AND won_at IS NULL)
   OR (status = 'lost' AND lost_at IS NULL)
   OR (status = 'open' AND (won_at IS NOT NULL OR lost_at IS NOT NULL))
   OR last_activity_at IS NULL
   OR source_kind IS NULL
   OR attribution_context IS NULL;

ALTER TABLE public.leads
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN source_kind SET NOT NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_commercial_status_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_commercial_status_check
  CHECK (status IN ('open', 'won', 'lost'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_kind_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_source_kind_check
  CHECK (source_kind IN ('paid_campaign', 'landing_page', 'whatsapp_cta', 'organic', 'referral', 'manual'));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_score_range_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_score_range_check
  CHECK (score >= 0 AND score <= 100);

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_attribution_context_object_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_attribution_context_object_check
  CHECK (jsonb_typeof(attribution_context) = 'object');

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_outcome_timestamps_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_outcome_timestamps_check
  CHECK (
    (status = 'won' AND won_at IS NOT NULL AND lost_at IS NULL)
    OR (status = 'lost' AND lost_at IS NOT NULL)
    OR (status = 'open' AND won_at IS NULL AND lost_at IS NULL)
  );

CREATE TABLE public.pipeline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sector_key TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE TABLE public.pipeline_template_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.pipeline_templates(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, key),
  CONSTRAINT pipeline_template_stage_outcome CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE public.lead_custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL CHECK (BTRIM(field_key) <> ''),
  field_label TEXT NOT NULL CHECK (BTRIM(field_label) <> ''),
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, field_key)
);

CREATE TABLE public.lead_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_tasks_completion_state CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

INSERT INTO public.lead_tasks (
  id,
  organization_id,
  lead_id,
  title,
  description,
  status,
  due_at,
  completed_at,
  assigned_to,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  lead_id,
  title,
  description,
  status,
  due_at,
  CASE WHEN status = 'completed' THEN updated_at ELSE NULL END,
  assigned_to,
  NOW(),
  NOW()
FROM public.crm_tasks
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pipeline_templates (key, name, description, sector_key, is_default)
VALUES
  ('commercial_default', 'Pipeline comercial padrao', 'Modelo comercial base para operacoes YUX Hub.', 'default', TRUE),
  ('clinic_growth', 'Clinicas: captacao e agendamento', 'Modelo para triagem, agendamento e reativacao de pacientes.', 'clinicas', FALSE),
  ('real_estate_sales', 'Imobiliarias: atendimento a interessados', 'Modelo para qualificacao, visita e proposta imobiliaria.', 'imobiliarias', FALSE)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO public.pipeline_template_stages (template_id, key, name, color, order_index, is_won, is_lost)
SELECT pt.id, stage.key, stage.name, stage.color, stage.order_index, stage.is_won, stage.is_lost
FROM public.pipeline_templates pt
CROSS JOIN (
  VALUES
    ('new', 'Novo lead', '#2563eb', 0, FALSE, FALSE),
    ('qualified', 'Qualificado', '#7c3aed', 1, FALSE, FALSE),
    ('proposal', 'Proposta', '#d97706', 2, FALSE, FALSE),
    ('negotiation', 'Negociacao', '#0891b2', 3, FALSE, FALSE),
    ('won', 'Ganho', '#16a34a', 4, TRUE, FALSE),
    ('lost', 'Perdido', '#dc2626', 5, FALSE, TRUE)
) AS stage(key, name, color, order_index, is_won, is_lost)
WHERE pt.key = 'commercial_default'
ON CONFLICT (template_id, key) DO NOTHING;

CREATE INDEX idx_leads_owner_id ON public.leads(owner_id);

CREATE INDEX idx_leads_status_stage ON public.leads(status, stage_id);

CREATE INDEX idx_leads_last_activity ON public.leads(last_activity_at DESC);

CREATE INDEX idx_leads_next_follow_up ON public.leads(next_follow_up_at);

CREATE INDEX idx_leads_source_kind ON public.leads(source_kind);

CREATE INDEX idx_pipeline_templates_organization ON public.pipeline_templates(organization_id, is_active);

CREATE INDEX idx_pipeline_templates_sector ON public.pipeline_templates(sector_key, is_active);

CREATE INDEX idx_pipeline_template_stages_template ON public.pipeline_template_stages(template_id, order_index);

CREATE INDEX idx_lead_custom_field_values_organization ON public.lead_custom_field_values(organization_id);

CREATE INDEX idx_lead_custom_field_values_lead ON public.lead_custom_field_values(lead_id);

CREATE INDEX idx_lead_tasks_organization_status ON public.lead_tasks(organization_id, status);

CREATE INDEX idx_lead_tasks_lead_due ON public.lead_tasks(lead_id, due_at);

CREATE INDEX idx_lead_tasks_assignee_due ON public.lead_tasks(assigned_to, due_at);

CREATE TRIGGER update_pipeline_templates_updated_at
  BEFORE UPDATE ON public.pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipeline_template_stages_updated_at
  BEFORE UPDATE ON public.pipeline_template_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_custom_field_values_updated_at
  BEFORE UPDATE ON public.lead_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_tasks_updated_at
  BEFORE UPDATE ON public.lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260605155502_crm_governance_by_contract.sql
-- Govern contracted CRM instances, seats, teams, configuration versions, and lead assignment.

DO $$
BEGIN
  CREATE TYPE public.crm_instance_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.crm_instance_role AS ENUM ('seller', 'manager', 'client_admin', 'yux_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.crm_member_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.crm_assignment_mode AS ENUM ('manual', 'queue', 'round_robin', 'pull_next');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.crm_assignment_state AS ENUM ('unassigned', 'assigned', 'in_queue', 'reassigned');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.crm_publication_status AS ENUM ('draft', 'reviewing', 'published', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$
BEGIN
  CREATE TYPE public.crm_migration_strategy AS ENUM ('keep_existing', 'migrate_all', 'migrate_open', 'mapped_stages');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

CREATE TABLE IF NOT EXISTS public.crm_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  status public.crm_instance_status NOT NULL DEFAULT 'draft',
  sector_key TEXT,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  blueprint_application_run_id UUID REFERENCES public.blueprint_application_runs(id) ON DELETE SET NULL,
  seller_seat_limit INTEGER NOT NULL DEFAULT 1 CHECK (seller_seat_limit >= 0),
  manager_seat_limit INTEGER NOT NULL DEFAULT 0 CHECK (manager_seat_limit >= 0),
  admin_seat_limit INTEGER NOT NULL DEFAULT 1 CHECK (admin_seat_limit >= 0),
  max_pipeline_count INTEGER NOT NULL DEFAULT 1 CHECK (max_pipeline_count >= 1),
  max_custom_field_count INTEGER NOT NULL DEFAULT 0 CHECK (max_custom_field_count >= 0),
  max_automation_count INTEGER NOT NULL DEFAULT 0 CHECK (max_automation_count >= 0),
  allow_client_pipeline_customization BOOLEAN NOT NULL DEFAULT false,
  allow_client_field_customization BOOLEAN NOT NULL DEFAULT false,
  allow_client_category_customization BOOLEAN NOT NULL DEFAULT false,
  default_assignment_mode public.crm_assignment_mode NOT NULL DEFAULT 'queue',
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE IF NOT EXISTS public.crm_instance_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.crm_instance_role NOT NULL,
  status public.crm_member_status NOT NULL DEFAULT 'invited',
  display_name TEXT,
  email TEXT,
  invited_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.crm_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  assignment_mode public.crm_assignment_mode NOT NULL DEFAULT 'queue',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.crm_instance_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('seller', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.crm_pipeline_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  source_pipeline_id UUID REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  status public.crm_publication_status NOT NULL DEFAULT 'draft',
  snapshot_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, source_pipeline_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.crm_stage_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_version_id UUID NOT NULL REFERENCES public.crm_pipeline_versions(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_version_id, stable_key),
  CONSTRAINT crm_stage_version_outcome CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE IF NOT EXISTS public.crm_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  version_number INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key, version_number)
);

CREATE TABLE IF NOT EXISTS public.crm_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key)
);

CREATE TABLE IF NOT EXISTS public.crm_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key)
);

CREATE TABLE IF NOT EXISTS public.crm_loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, stable_key)
);

CREATE TABLE IF NOT EXISTS public.crm_configuration_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_configuration_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  draft_id UUID REFERENCES public.crm_configuration_drafts(id) ON DELETE SET NULL,
  status public.crm_publication_status NOT NULL DEFAULT 'reviewing',
  migration_strategy public.crm_migration_strategy NOT NULL DEFAULT 'keep_existing',
  impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_by UUID REFERENCES public.users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_configuration_migration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  publication_id UUID NOT NULL REFERENCES public.crm_configuration_publications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.crm_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_version_id UUID REFERENCES public.crm_pipeline_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_version_id UUID REFERENCES public.crm_stage_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_state public.crm_assignment_state NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS assignment_mode public.crm_assignment_mode,
  ADD COLUMN IF NOT EXISTS last_assignment_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_instances_organization_id ON public.crm_instances(organization_id);

CREATE INDEX IF NOT EXISTS idx_crm_instances_contract_id ON public.crm_instances(contract_id);

CREATE INDEX IF NOT EXISTS idx_crm_instance_members_instance_id ON public.crm_instance_members(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_instance_members_user_id ON public.crm_instance_members(user_id);

CREATE INDEX IF NOT EXISTS idx_crm_teams_instance_id ON public.crm_teams(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_team_members_team_id ON public.crm_team_members(team_id);

CREATE INDEX IF NOT EXISTS idx_crm_team_members_member_id ON public.crm_team_members(member_id);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_versions_instance_id ON public.crm_pipeline_versions(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_stage_versions_pipeline_version_id ON public.crm_stage_versions(pipeline_version_id);

CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_instance_id ON public.crm_custom_field_definitions(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_configuration_drafts_instance_id ON public.crm_configuration_drafts(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_configuration_publications_instance_id ON public.crm_configuration_publications(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_migration_runs_instance_id ON public.crm_configuration_migration_runs(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_crm_audit_events_instance_id ON public.crm_audit_events(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_leads_crm_instance_id ON public.leads(crm_instance_id);

CREATE INDEX IF NOT EXISTS idx_leads_crm_owner_member_id ON public.leads(owner_member_id);

CREATE INDEX IF NOT EXISTS idx_leads_crm_team_id ON public.leads(team_id);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_instance_id ON public.crm_pipelines(crm_instance_id);

CREATE OR REPLACE FUNCTION private.can_manage_crm_members(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_manage_crm_instance(target_instance_id);
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_team(target_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.crm_teams t
    WHERE t.id = target_team_id
      AND private.can_access_crm_instance(t.crm_instance_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_crm_lead_v2(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = target_lead_id
      AND (
        l.crm_instance_id IS NULL
        OR private.is_internal_user()
        OR COALESCE(private.crm_member_role(l.crm_instance_id) IN ('client_admin', 'yux_admin'), false)
        OR l.owner_member_id = private.current_crm_member_id(l.crm_instance_id)
        OR EXISTS (
          SELECT 1
          FROM public.crm_team_members tm
          WHERE tm.team_id = l.team_id
            AND tm.member_id = private.current_crm_member_id(l.crm_instance_id)
            AND tm.role = 'manager'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_update_crm_lead_v2(target_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = target_lead_id
      AND (
        l.crm_instance_id IS NULL
        OR private.is_internal_user()
        OR COALESCE(private.crm_member_role(l.crm_instance_id) IN ('client_admin', 'yux_admin'), false)
        OR l.owner_member_id = private.current_crm_member_id(l.crm_instance_id)
        OR EXISTS (
          SELECT 1
          FROM public.crm_team_members tm
          WHERE tm.team_id = l.team_id
            AND tm.member_id = private.current_crm_member_id(l.crm_instance_id)
            AND tm.role = 'manager'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_publish_crm_configuration(target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.can_manage_crm_instance(target_instance_id);
$$;

CREATE OR REPLACE FUNCTION private.crm_instance_for_contract(target_contract_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ci.id
  FROM public.crm_instances ci
  WHERE ci.contract_id = target_contract_id
  LIMIT 1;
$$;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'crm_instances', 'crm_instance_members', 'crm_teams', 'crm_pipeline_versions',
    'crm_stage_versions', 'crm_custom_field_definitions', 'crm_categories',
    'crm_tags', 'crm_loss_reasons', 'crm_configuration_drafts',
    'crm_configuration_publications', 'crm_configuration_migration_runs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;

INSERT INTO public.crm_instances (
  organization_id,
  contract_id,
  status,
  seller_seat_limit,
  manager_seat_limit,
  admin_seat_limit,
  max_pipeline_count,
  max_custom_field_count,
  max_automation_count,
  allow_client_pipeline_customization,
  allow_client_field_customization,
  allow_client_category_customization,
  default_assignment_mode
)
SELECT
  o.id,
  c.id,
  'active',
  3,
  1,
  1,
  3,
  20,
  5,
  true,
  true,
  true,
  'queue'
FROM public.contracts c
JOIN public.contract_modules cm ON cm.contract_id = c.id AND cm.module_key = 'crm' AND cm.enabled
JOIN public.organizations o ON o.client_id = c.client_id AND o.kind = 'client'
WHERE c.status = 'active'
ON CONFLICT (contract_id) DO NOTHING;

UPDATE public.crm_pipelines p
SET crm_instance_id = ci.id
FROM public.crm_instances ci
WHERE p.crm_instance_id IS NULL
  AND p.organization_id = ci.organization_id;

UPDATE public.leads l
SET crm_instance_id = ci.id,
    assignment_state = CASE
      WHEN l.owner_id IS NOT NULL OR l.assigned_to IS NOT NULL THEN 'assigned'::public.crm_assignment_state
      ELSE 'in_queue'::public.crm_assignment_state
    END,
    assignment_mode = COALESCE(l.assignment_mode, ci.default_assignment_mode)
FROM public.crm_instances ci
WHERE l.crm_instance_id IS NULL
  AND l.organization_id = ci.organization_id;

REVOKE ALL ON FUNCTION private.can_access_crm_instance(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.crm_member_role(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.current_crm_member_id(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_crm_instance(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_crm_members(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_crm_team(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_crm_lead_v2(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_update_crm_lead_v2(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_publish_crm_configuration(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.crm_instance_for_contract(UUID) FROM PUBLIC;


-- source: 20260605155606_crm_commercial_cockpit.sql
-- Commercial CRM cockpit: lead profile, tags, saved views, imports, next actions and calendar.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS interest TEXT,
  ADD COLUMN IF NOT EXISTS temperature TEXT CHECK (temperature IS NULL OR temperature IN ('hot', 'warm', 'cold', 'unqualified')),
  ADD COLUMN IF NOT EXISTS urgency TEXT CHECK (urgency IS NULL OR urgency IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS consent_lgpd BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS competitor TEXT,
  ADD COLUMN IF NOT EXISTS objections TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS current_stage_entered_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  changed_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, name)
);

CREATE TABLE IF NOT EXISTS public.lead_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.lead_loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  required_for_lost BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, label)
);

CREATE TABLE IF NOT EXISTS public.lead_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  duplicate_lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('email', 'phone', 'whatsapp', 'manual')),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (confidence >= 0 AND confidence <= 100),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_duplicates_distinct CHECK (lead_id <> duplicate_lead_id),
  UNIQUE (lead_id, duplicate_lead_id, match_kind)
);

CREATE TABLE IF NOT EXISTS public.lead_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_saved_views_owner CHECK (user_id IS NOT NULL OR team_id IS NOT NULL OR is_shared)
);

CREATE TABLE IF NOT EXISTS public.lead_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'processing', 'completed', 'failed', 'cancelled')),
  file_name TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  created_by UUID REFERENCES public.users(id),
  executed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES public.lead_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_id, row_number)
);

CREATE TABLE IF NOT EXISTS public.lead_next_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('respond_now', 'send_proposal', 'schedule_meeting', 'send_sector_case', 'request_budget', 'reactivate', 'reassign', 'mark_lost')),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  assigned_to_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_calendar_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('task', 'meeting', 'follow_up', 'sla')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  owner_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_temperature ON public.leads(crm_instance_id, temperature);

CREATE INDEX IF NOT EXISTS idx_leads_current_stage_entered_at ON public.leads(crm_instance_id, current_stage_entered_at);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_instance ON public.lead_stage_history(crm_instance_id, lead_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_tags_instance ON public.lead_tags(crm_instance_id, is_active);

CREATE INDEX IF NOT EXISTS idx_lead_tag_assignments_instance ON public.lead_tag_assignments(crm_instance_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_loss_reasons_instance ON public.lead_loss_reasons(crm_instance_id, is_active);

CREATE INDEX IF NOT EXISTS idx_lead_duplicates_instance ON public.lead_duplicates(crm_instance_id, lead_id, status);

CREATE INDEX IF NOT EXISTS idx_lead_saved_views_instance ON public.lead_saved_views(crm_instance_id, user_id, team_id);

CREATE INDEX IF NOT EXISTS idx_lead_imports_instance ON public.lead_imports(crm_instance_id, status);

CREATE INDEX IF NOT EXISTS idx_lead_import_rows_import ON public.lead_import_rows(import_id, row_number);

CREATE INDEX IF NOT EXISTS idx_lead_next_actions_instance ON public.lead_next_actions(crm_instance_id, lead_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_crm_activity_calendar_entries_instance ON public.crm_activity_calendar_entries(crm_instance_id, starts_at);

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_tags', 'lead_loss_reasons', 'lead_duplicates', 'lead_saved_views',
    'lead_imports', 'lead_next_actions', 'crm_activity_calendar_entries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;


-- source: 20260605155729_crm_whatsapp_ai.sql
-- CRM WhatsApp AI: lead-conversation links, AI insights, response suggestions and SLA events.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'unknown')),
  ADD COLUMN IF NOT EXISTS urgency_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_conversation_at TIMESTAMPTZ;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.lead_conversation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  status TEXT NOT NULL DEFAULT 'linked' CHECK (status IN ('suggested', 'linked', 'rejected', 'archived')),
  match_method TEXT NOT NULL DEFAULT 'manual' CHECK (match_method IN ('phone', 'email', 'manual', 'ai', 'webchat')),
  match_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 100),
  contact_phone TEXT,
  contact_email TEXT,
  linked_by UUID REFERENCES public.users(id),
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS public.lead_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ai_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  intent TEXT,
  sentiment TEXT NOT NULL DEFAULT 'unknown' CHECK (sentiment IN ('positive', 'neutral', 'negative', 'unknown')),
  urgency TEXT NOT NULL DEFAULT 'none' CHECK (urgency IN ('high', 'medium', 'low', 'none')),
  objections TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  risks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  next_best_action TEXT,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_ai_field_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  field_key TEXT NOT NULL,
  current_value JSONB,
  suggested_value JSONB NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),
  confirmed_by UUID REFERENCES public.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_ai_field_suggestions_confirmed CHECK (
    status <> 'confirmed' OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.lead_response_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'rejected')),
  template_id UUID,
  quick_reply_id UUID,
  ai_insight_id UUID REFERENCES public.lead_ai_insights(id) ON DELETE SET NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES public.users(id),
  sent_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_sla_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('first_response', 'follow_up', 'human_handoff', 'stale_conversation')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'breached', 'resolved', 'cancelled')),
  due_at TIMESTAMPTZ NOT NULL,
  breached_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  owner_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_handoff_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  locked_by UUID REFERENCES public.users(id),
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  channel TEXT CHECK (channel IS NULL OR channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, label)
);

CREATE TABLE IF NOT EXISTS public.crm_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_instance_id UUID NOT NULL REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  requires_opt_in BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (crm_instance_id, channel, name)
);

DO $$
BEGIN
  ALTER TABLE public.lead_response_suggestions
    ADD CONSTRAINT lead_response_suggestions_template_fk
    FOREIGN KEY (template_id) REFERENCES public.crm_message_templates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.lead_response_suggestions
    ADD CONSTRAINT lead_response_suggestions_quick_reply_fk
    FOREIGN KEY (quick_reply_id) REFERENCES public.crm_quick_replies(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON public.conversations(lead_id);

CREATE INDEX IF NOT EXISTS idx_leads_last_conversation_at ON public.leads(crm_instance_id, last_conversation_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_conversation_links_instance ON public.lead_conversation_links(crm_instance_id, lead_id, status);

CREATE INDEX IF NOT EXISTS idx_lead_conversation_links_conversation ON public.lead_conversation_links(conversation_id);

CREATE INDEX IF NOT EXISTS idx_lead_ai_insights_lead ON public.lead_ai_insights(crm_instance_id, lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_ai_field_suggestions_lead ON public.lead_ai_field_suggestions(crm_instance_id, lead_id, status);

CREATE INDEX IF NOT EXISTS idx_lead_response_suggestions_conversation ON public.lead_response_suggestions(conversation_id, status);

CREATE INDEX IF NOT EXISTS idx_lead_sla_events_due ON public.lead_sla_events(crm_instance_id, status, due_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_handoff_locks_active
  ON public.lead_handoff_locks(conversation_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_crm_quick_replies_instance ON public.crm_quick_replies(crm_instance_id, is_active);

CREATE INDEX IF NOT EXISTS idx_crm_message_templates_instance ON public.crm_message_templates(crm_instance_id, channel, status);

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_conversation_links', 'lead_response_suggestions', 'lead_sla_events',
    'crm_quick_replies', 'crm_message_templates'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;


-- source: 20260605155846_crm_proposals_closing.sql
-- CRM proposals closing: CRM-facing proposal orchestration, events, checklists and onboarding.

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommended_package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lead_proposal_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  module_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  score NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (score >= 0),
  reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, package_id)
);

CREATE TABLE IF NOT EXISTS public.proposal_view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'viewed', 'adjustment_requested', 'accepted', 'rejected', 'converted')),
  actor_type TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('internal', 'client', 'system')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ NOT NULL,
  assigned_to_member_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handled', 'dismissed')),
  handled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_closing_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'blocked')),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id)
);

ALTER TABLE public.proposal_conversion_runs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS invoice_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.proposal_conversion_runs r
SET organization_id = p.organization_id,
    crm_instance_id = p.crm_instance_id,
    lead_id = p.lead_id,
    idempotency_key = COALESCE(r.idempotency_key, 'proposal:' || r.proposal_id::TEXT || ':conversion')
FROM public.proposals p
WHERE p.id = r.proposal_id
  AND (r.organization_id IS NULL OR r.lead_id IS NULL OR r.idempotency_key IS NULL);

DO $$
BEGIN
  ALTER TABLE public.proposal_conversion_runs
    DROP CONSTRAINT IF EXISTS proposal_conversion_runs_status_check;
  ALTER TABLE public.proposal_conversion_runs
    ADD CONSTRAINT proposal_conversion_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.proposal_conversion_runs
      ADD CONSTRAINT proposal_conversion_runs_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposal_conversion_runs_idempotency
  ON public.proposal_conversion_runs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.client_onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.client_onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.client_onboarding_checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_crm_instance ON public.proposals(crm_instance_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_contracts_source_proposal ON public.contracts(source_proposal_id);

CREATE INDEX IF NOT EXISTS idx_projects_source_lead ON public.projects(source_lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_proposal_recommendations_lead ON public.lead_proposal_recommendations(crm_instance_id, lead_id, status);

CREATE INDEX IF NOT EXISTS idx_proposal_view_events_proposal ON public.proposal_view_events(proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_follow_up_tasks_due ON public.proposal_follow_up_tasks(crm_instance_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_proposal_objections_proposal ON public.proposal_objections(proposal_id, status);

CREATE INDEX IF NOT EXISTS idx_proposal_closing_checklists_proposal ON public.proposal_closing_checklists(proposal_id);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_checklists_client ON public.client_onboarding_checklists(client_id, status);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_tasks_checklist ON public.client_onboarding_tasks(checklist_id, status);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_source_proposal ON public.invoices(source_proposal_id);
  END IF;
END;
$$;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_proposal_recommendations', 'proposal_follow_up_tasks',
    'proposal_objections', 'proposal_closing_checklists',
    'client_onboarding_checklists'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS update_proposal_conversion_runs_updated_at ON public.proposal_conversion_runs;

CREATE TRIGGER update_proposal_conversion_runs_updated_at
  BEFORE UPDATE ON public.proposal_conversion_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_onboarding_tasks_updated_at ON public.client_onboarding_tasks;

CREATE TRIGGER update_client_onboarding_tasks_updated_at
  BEFORE UPDATE ON public.client_onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260605160028_crm_attribution_mroi.sql
-- CRM attribution, source rollups and MROI reporting.

CREATE OR REPLACE FUNCTION private.can_access_crm_attribution(target_organization_id UUID, target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR (
      target_instance_id IS NOT NULL
      AND private.can_access_crm_instance(target_instance_id)
    )
    OR private.can_access_crm_organization(target_organization_id);
$$;

CREATE OR REPLACE FUNCTION private.can_manage_crm_attribution(target_organization_id UUID, target_instance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR (
      target_instance_id IS NOT NULL
      AND private.can_manage_crm_instance(target_instance_id)
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_crm_attribution(UUID, UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_manage_crm_attribution(UUID, UUID) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (BTRIM(key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('paid_campaign', 'landing_page', 'whatsapp', 'organic', 'referral', 'direct', 'manual')),
  provider TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  media_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (media_cost >= 0),
  operational_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (operational_cost >= 0),
  client_visible_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (client_visible_cost >= 0),
  is_client_cost_visible BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, crm_instance_id, key)
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS primary_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_confidence TEXT NOT NULL DEFAULT 'low';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_confidence_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_source_confidence_check
  CHECK (source_confidence IN ('high', 'medium', 'low'));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS crm_performance_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_crm_performance_status_check;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_crm_performance_status_check
  CHECK (crm_performance_status IN ('excellent', 'healthy', 'watch', 'critical', 'unknown'));

ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS crm_source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices
      ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lead_attribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('first_touch', 'lead_created', 'campaign_click', 'landing_page_submit', 'whatsapp_click', 'proposal_approved', 'invoice_paid')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  invoice_id UUID,
  revenue_amount DECIMAL(15,2) CHECK (revenue_amount IS NULL OR revenue_amount >= 0),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.lead_attribution_events
      ADD CONSTRAINT lead_attribution_events_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.lead_source_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.lead_sources(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  opportunities INTEGER NOT NULL DEFAULT 0 CHECK (opportunities >= 0),
  sales INTEGER NOT NULL DEFAULT 0 CHECK (sales >= 0),
  media_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (media_cost >= 0),
  operational_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (operational_cost >= 0),
  client_visible_cost DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (client_visible_cost >= 0),
  attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (attributed_revenue >= 0),
  cpl DECIMAL(15,4) NOT NULL DEFAULT 0,
  opportunity_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  conversion_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  mroi DECIMAL(12,4) NOT NULL DEFAULT 0,
  seller_id UUID REFERENCES public.crm_instance_members(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.crm_teams(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (source_id, period_start, period_end, seller_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.campaign_crm_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  opportunities INTEGER NOT NULL DEFAULT 0 CHECK (opportunities >= 0),
  sales INTEGER NOT NULL DEFAULT 0 CHECK (sales >= 0),
  spend DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  attributed_revenue DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (attributed_revenue >= 0),
  cpl DECIMAL(15,4) NOT NULL DEFAULT 0,
  conversion_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
  mroi DECIMAL(12,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('excellent', 'healthy', 'watch', 'critical', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (campaign_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.crm_revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  invoice_id UUID,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  attribution_model TEXT NOT NULL DEFAULT 'primary_source' CHECK (attribution_model IN ('primary_source', 'manual', 'proposal_source', 'invoice_source')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.crm_revenue_attribution
      ADD CONSTRAINT crm_revenue_attribution_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.crm_mroi_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'success')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  description TEXT NOT NULL DEFAULT '',
  metric_key TEXT NOT NULL CHECK (metric_key IN ('cpl', 'conversion_rate', 'mroi', 'revenue')),
  metric_value DECIMAL(15,4) NOT NULL DEFAULT 0,
  threshold_value DECIMAL(15,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.crm_report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crm_instance_id UUID REFERENCES public.crm_instances(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'internal' CHECK (scope IN ('internal', 'portal')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  csv TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

INSERT INTO public.lead_sources (
  organization_id,
  crm_instance_id,
  key,
  name,
  kind,
  campaign_id,
  utm_source,
  utm_medium,
  utm_campaign,
  client_visible_cost
)
SELECT DISTINCT
  l.organization_id,
  l.crm_instance_id,
  COALESCE(NULLIF(LOWER(REGEXP_REPLACE(l.source, '[^a-zA-Z0-9]+', '_', 'g')), ''), 'manual') AS key,
  COALESCE(NULLIF(l.source, ''), 'Manual') AS name,
  CASE
    WHEN l.source_kind = 'whatsapp_cta' THEN 'whatsapp'
    WHEN l.source_kind IN ('paid_campaign', 'landing_page', 'organic', 'referral', 'manual') THEN l.source_kind
    ELSE 'manual'
  END,
  l.campaign_id,
  NULLIF(l.attribution_context->>'utmSource', ''),
  NULLIF(l.attribution_context->>'utmMedium', ''),
  NULLIF(l.attribution_context->>'utmCampaign', ''),
  0
FROM public.leads l
WHERE l.organization_id IS NOT NULL
ON CONFLICT (organization_id, crm_instance_id, key) DO NOTHING;

UPDATE public.leads l
SET primary_source_id = s.id,
    source_confidence = CASE
      WHEN l.campaign_id IS NOT NULL OR COALESCE(l.attribution_context, '{}'::jsonb) <> '{}'::jsonb THEN 'high'
      WHEN l.source IS NOT NULL AND BTRIM(l.source) <> '' THEN 'medium'
      ELSE 'low'
    END
FROM public.lead_sources s
WHERE l.primary_source_id IS NULL
  AND l.organization_id = s.organization_id
  AND COALESCE(l.crm_instance_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(s.crm_instance_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND COALESCE(NULLIF(LOWER(REGEXP_REPLACE(l.source, '[^a-zA-Z0-9]+', '_', 'g')), ''), 'manual') = s.key;

INSERT INTO public.lead_attribution_events (
  organization_id,
  crm_instance_id,
  lead_id,
  source_id,
  event_kind,
  occurred_at,
  campaign_id,
  utm_source,
  utm_medium,
  utm_campaign,
  metadata
)
SELECT
  l.organization_id,
  l.crm_instance_id,
  l.id,
  l.primary_source_id,
  'lead_created',
  COALESCE(l.created_at, NOW()),
  l.campaign_id,
  NULLIF(l.attribution_context->>'utmSource', ''),
  NULLIF(l.attribution_context->>'utmMedium', ''),
  NULLIF(l.attribution_context->>'utmCampaign', ''),
  jsonb_build_object('seeded_from_existing_lead', true)
FROM public.leads l
WHERE l.organization_id IS NOT NULL
  AND l.primary_source_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.proposals
SET source_lead_id = COALESCE(source_lead_id, lead_id)
WHERE source_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_sources_org_kind ON public.lead_sources(organization_id, crm_instance_id, kind);

CREATE INDEX IF NOT EXISTS idx_lead_sources_campaign ON public.lead_sources(campaign_id);

CREATE INDEX IF NOT EXISTS idx_leads_primary_source ON public.leads(primary_source_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_crm_performance_status ON public.campaigns(crm_performance_status);

CREATE INDEX IF NOT EXISTS idx_landing_pages_crm_source ON public.landing_pages(crm_source_id);

CREATE INDEX IF NOT EXISTS idx_proposals_source_lead ON public.proposals(source_lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_lead ON public.lead_attribution_events(lead_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_source ON public.lead_attribution_events(source_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_source_rollups_period ON public.lead_source_rollups(crm_instance_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_campaign_crm_performance_period ON public.campaign_crm_performance_snapshots(campaign_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_crm_revenue_attribution_lead ON public.crm_revenue_attribution(lead_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_mroi_alerts_status ON public.crm_mroi_alerts(crm_instance_id, status, severity);

CREATE INDEX IF NOT EXISTS idx_crm_report_exports_scope ON public.crm_report_exports(crm_instance_id, scope, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_source_lead ON public.invoices(source_lead_id);
  END IF;
END;
$$;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'lead_sources', 'lead_source_rollups', 'campaign_crm_performance_snapshots',
    'crm_mroi_alerts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      target_table,
      target_table
    );
  END LOOP;
END;
$$;


-- source: 20260605160400_remove_second_cleanup_marker_from_history.sql

-- source: 20260605220328_marketing_studio_foundation.sql
-- YUX Marketing Studio foundation: module contract, content pipeline, calendar,
-- approvals, agent metadata, and AI credits.

CREATE OR REPLACE FUNCTION private.has_active_marketing_studio_contract(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts c
    JOIN public.contract_modules cm
      ON cm.contract_id = c.id
     AND cm.module_key = 'marketing_studio'
     AND cm.enabled = TRUE
    WHERE c.client_id = target_organization_id
      AND c.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_marketing_studio_organization(target_organization_id UUID, target_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE target_action
    WHEN 'read' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.read')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.write')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.configure')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    WHEN 'write' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.write')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.configure')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    WHEN 'configure' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.configure')
      OR private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    WHEN 'supervise' THEN
      private.has_marketing_studio_permission(target_organization_id, 'marketing_studio.supervise')
    ELSE FALSE
  END;
$$;

REVOKE ALL ON FUNCTION private.has_active_marketing_studio_contract(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.has_marketing_studio_permission(UUID, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION private.can_access_marketing_studio_organization(UUID, TEXT) FROM PUBLIC;

CREATE TABLE public.marketing_studio_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  operation_mode TEXT NOT NULL DEFAULT 'managed_by_yux'
    CHECK (operation_mode IN ('managed_by_yux', 'assisted_client', 'advanced_partner')),
  monthly_credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credit_limit >= 0),
  current_credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_credit_balance >= 0),
  approval_policy JSONB NOT NULL DEFAULT jsonb_build_object(
    'publishSocial', true,
    'publishWordPress', true,
    'paidCampaignDraft', true,
    'premiumImage', true,
    'regulatedContent', true
  ) CHECK (jsonb_typeof(approval_policy) = 'object'),
  allowed_channels TEXT[] NOT NULL DEFAULT ARRAY['linkedin','instagram','blog','newsletter']::TEXT[],
  tone_of_voice TEXT,
  persona TEXT,
  visual_preferences TEXT,
  forbidden_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  priority_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE public.marketing_agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  default_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  default_model TEXT,
  fallback_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.marketing_agent_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  agent_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  base_prompt TEXT,
  default_model TEXT,
  fallback_model TEXT,
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
  max_cost_per_run NUMERIC(12,4),
  max_runs_per_day INTEGER CHECK (max_runs_per_day IS NULL OR max_runs_per_day >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('rss','blog','news','youtube','competitor','crm','omnichannel','campaign','manual')),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','failed','archived')),
  last_read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.marketing_sources(id) ON DELETE SET NULL,
  source_reference_id UUID,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'captured' CHECK (status IN ('captured','curated','approved','rejected','converted')),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','radar','crm','omnichannel','campaign','report')),
  source_url TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  opportunity_score INTEGER NOT NULL DEFAULT 0 CHECK (opportunity_score BETWEEN 0 AND 100),
  suggested_channel TEXT,
  rejection_reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  content_type TEXT NOT NULL CHECK (content_type IN ('social_post','blog_article','newsletter','email','ad_copy','video_script','carousel_text','creative_brief')),
  channel TEXT NOT NULL CHECK (BTRIM(channel) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','changes_requested','approved','scheduled','published','rejected','archived')),
  brief TEXT,
  body TEXT,
  cta TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  source_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  internal_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  body TEXT,
  change_summary TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_item_id, version_number)
);

CREATE TABLE public.content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes_requested','rejected')),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  comments TEXT,
  checklist JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(checklist) = 'object'),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.editorial_calendar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  channel TEXT NOT NULL CHECK (BTRIM(channel) <> ''),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','scheduled','published','missed','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  responsible_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ai_credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  monthly_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
  current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  monthly_used INTEGER NOT NULL DEFAULT 0 CHECK (monthly_used >= 0),
  reset_day INTEGER NOT NULL DEFAULT 1 CHECK (reset_day BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE public.ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.ai_credit_wallets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  workflow_run_id UUID,
  action TEXT NOT NULL CHECK (BTRIM(action) <> ''),
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  tool_name TEXT,
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketing_settings_org_contract ON public.marketing_studio_settings(organization_id, contract_id);

CREATE INDEX idx_marketing_agents_org_type_status ON public.marketing_agents(organization_id, agent_type, status);

CREATE INDEX idx_marketing_sources_contract_status ON public.marketing_sources(contract_id, status);

CREATE INDEX idx_marketing_ideas_contract_status ON public.marketing_ideas(contract_id, status, priority);

CREATE INDEX idx_content_items_contract_status ON public.content_items(contract_id, status, channel);

CREATE INDEX idx_content_items_campaign_id ON public.content_items(campaign_id);

CREATE INDEX idx_content_items_landing_page_id ON public.content_items(landing_page_id);

CREATE INDEX idx_content_versions_item_version ON public.content_versions(content_item_id, version_number DESC);

CREATE INDEX idx_content_reviews_item_status ON public.content_reviews(content_item_id, status);

CREATE INDEX idx_editorial_calendar_contract_start ON public.editorial_calendar_items(contract_id, starts_at);

CREATE INDEX idx_ai_credit_wallets_contract ON public.ai_credit_wallets(contract_id);

CREATE INDEX idx_ai_usage_ledger_contract_created ON public.ai_usage_ledger(contract_id, created_at DESC);

CREATE INDEX idx_ai_usage_ledger_agent_created ON public.ai_usage_ledger(agent_id, created_at DESC);

CREATE TRIGGER update_marketing_studio_settings_updated_at BEFORE UPDATE ON public.marketing_studio_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_agent_templates_updated_at BEFORE UPDATE ON public.marketing_agent_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_agents_updated_at BEFORE UPDATE ON public.marketing_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_sources_updated_at BEFORE UPDATE ON public.marketing_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_ideas_updated_at BEFORE UPDATE ON public.marketing_ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_items_updated_at BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_reviews_updated_at BEFORE UPDATE ON public.content_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_editorial_calendar_items_updated_at BEFORE UPDATE ON public.editorial_calendar_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_credit_wallets_updated_at BEFORE UPDATE ON public.ai_credit_wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.marketing_agent_templates (agent_type, name, description, default_tools, requires_human_approval)
VALUES
  ('content_radar', 'Radar de Conteudo', 'Encontra oportunidades de conteudo a partir de fontes curadas e internas.', ARRAY['jina_reader','jina_search','curated_sources']::TEXT[], TRUE),
  ('strategic_curator', 'Curador Estrategico', 'Filtra, prioriza e rejeita ideias com justificativa.', ARRAY['curated_sources','rag_search']::TEXT[], TRUE),
  ('content_strategist', 'Estrategista de Conteudo', 'Transforma ideias aprovadas em briefings multicanal.', ARRAY['curated_sources','rag_search']::TEXT[], TRUE),
  ('multichannel_writer', 'Redator Multicanal', 'Gera textos adaptados por canal e tom de voz.', ARRAY['rag_search']::TEXT[], TRUE),
  ('brand_quality_reviewer', 'Revisor de Marca e Qualidade', 'Revisa seguranca, qualidade, tom e necessidade de grounding.', ARRAY['rag_search','jina_grounding']::TEXT[], TRUE),
  ('campaign_strategist', 'Estrategista de Campanhas', 'Sugere angulos, copies, publicos, CTAs e campanhas rascunho.', ARRAY['campaign_draft','rag_search']::TEXT[], TRUE),
  ('visual_creative_generator', 'Gerador de Criativos Visuais', 'Cria prompts, conceitos visuais e variacoes com limites de credito.', ARRAY['image_generation','rag_search']::TEXT[], TRUE),
  ('editorial_calendar_manager', 'Gestor de Calendario Editorial', 'Organiza conteudos aprovados em calendario e tarefas.', ARRAY['create_task']::TEXT[], TRUE),
  ('controlled_publisher', 'Publicador Controlado', 'Cria rascunhos e publica somente apos aprovacao.', ARRAY['create_task','create_wordpress_draft']::TEXT[], TRUE),
  ('performance_analyst', 'Analista de Performance', 'Analisa resultados e retroalimenta novos ciclos.', ARRAY['rag_search']::TEXT[], TRUE)
ON CONFLICT (agent_type) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_tools = EXCLUDED.default_tools,
    requires_human_approval = EXCLUDED.requires_human_approval,
    updated_at = NOW();

INSERT INTO public.platform_modules (key, name, base, internal_route, portal_route, required_permissions)
VALUES (
  'marketing_studio',
  'Marketing Studio',
  FALSE,
  '/marketing-studio',
  '/portal/marketing-studio',
  ARRAY['marketing_studio.read']::TEXT[]
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    internal_route = EXCLUDED.internal_route,
    portal_route = EXCLUDED.portal_route,
    required_permissions = EXCLUDED.required_permissions,
    updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'marketing_studio.read'),
  ('yux_admin', 'marketing_studio.write'),
  ('yux_admin', 'marketing_studio.configure'),
  ('yux_admin', 'marketing_studio.supervise'),
  ('yux_manager', 'marketing_studio.read'),
  ('yux_manager', 'marketing_studio.write'),
  ('yux_manager', 'marketing_studio.configure'),
  ('yux_manager', 'marketing_studio.supervise'),
  ('yux_member', 'marketing_studio.read'),
  ('yux_member', 'marketing_studio.write'),
  ('client_admin', 'marketing_studio.read'),
  ('client_admin', 'marketing_studio.write'),
  ('client_admin', 'marketing_studio.configure'),
  ('client_member', 'marketing_studio.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;


-- source: 20260606233110_marketing_studio_knowledge_rag.sql
-- Marketing Studio knowledge, brand voice, structured offers, and simple RAG.

-- pgvector is optional in the self-hosted stack. The default postgres:17-alpine
-- image does not ship the extension, so vector embeddings use JSONB until the
-- operator intentionally swaps to a pgvector-enabled image.

CREATE TABLE public.marketing_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  tone_of_voice TEXT NOT NULL DEFAULT '',
  persona TEXT NOT NULL DEFAULT '',
  brand_voice_summary TEXT NOT NULL DEFAULT '',
  vocabulary_do TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  vocabulary_dont TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  forbidden_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  priority_topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  visual_guidelines TEXT,
  compliance_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id)
);

CREATE TABLE public.marketing_products_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  category TEXT,
  description TEXT NOT NULL DEFAULT '',
  value_proposition TEXT,
  target_audience TEXT,
  proof_points TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  objections TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  cta TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  document_type TEXT NOT NULL DEFAULT 'brand' CHECK (document_type IN ('brand','product','service','faq','case','campaign','policy','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','indexing','indexed','published','archived')),
  storage_path TEXT,
  source_url TEXT,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.marketing_knowledge_documents(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES public.knowledge_entries(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  title TEXT,
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  token_count INTEGER NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  embedding_model TEXT,
  embedding JSONB CHECK (embedding IS NULL OR jsonb_typeof(embedding) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX idx_marketing_brand_profiles_contract ON public.marketing_brand_profiles(contract_id, status);

CREATE INDEX idx_marketing_products_services_contract_status ON public.marketing_products_services(contract_id, status);

CREATE INDEX idx_marketing_knowledge_documents_contract_status ON public.marketing_knowledge_documents(contract_id, status);

CREATE INDEX idx_marketing_knowledge_chunks_contract_document ON public.marketing_knowledge_chunks(contract_id, document_id, chunk_index);

CREATE INDEX idx_marketing_knowledge_chunks_body_fts ON public.marketing_knowledge_chunks USING GIN (to_tsvector('portuguese', body));

-- Vector index omitted until pgvector is installed in the VPS Postgres image.

CREATE TRIGGER update_marketing_brand_profiles_updated_at BEFORE UPDATE ON public.marketing_brand_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_products_services_updated_at BEFORE UPDATE ON public.marketing_products_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_knowledge_documents_updated_at BEFORE UPDATE ON public.marketing_knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_knowledge_chunks_updated_at BEFORE UPDATE ON public.marketing_knowledge_chunks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.match_marketing_knowledge(
  target_contract_id UUID,
  search_query TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  title TEXT,
  body TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.id AS chunk_id,
    c.document_id,
    COALESCE(c.title, d.title) AS title,
    c.body,
    ts_rank_cd(to_tsvector('portuguese', c.body), plainto_tsquery('portuguese', search_query)) AS rank
  FROM public.marketing_knowledge_chunks c
  LEFT JOIN public.marketing_knowledge_documents d ON d.id = c.document_id
  WHERE c.contract_id = target_contract_id
    AND private.can_access_marketing_studio_organization(c.organization_id, 'read')
    AND (
      BTRIM(COALESCE(search_query, '')) = ''
      OR to_tsvector('portuguese', c.body) @@ plainto_tsquery('portuguese', search_query)
      OR c.body ILIKE '%' || search_query || '%'
      OR COALESCE(c.title, d.title, '') ILIKE '%' || search_query || '%'
    )
  ORDER BY rank DESC, c.updated_at DESC
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

REVOKE ALL ON FUNCTION public.match_marketing_knowledge(UUID, TEXT, INTEGER) FROM PUBLIC;


-- source: 20260607000807_yux_agent_harness_langgraph.sql
-- YUX Marketing Studio Phase 4: LangGraph runtime contracts, agent harness
-- governance, prompt layering, tool permissions, model routing and run logs.

ALTER TABLE public.marketing_agents
  ADD COLUMN IF NOT EXISTS prompt_config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(prompt_config) = 'object'),
  ADD COLUMN IF NOT EXISTS context_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context_policy) = 'object'),
  ADD COLUMN IF NOT EXISTS quality_gates JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(quality_gates) = 'object'),
  ADD COLUMN IF NOT EXISTS model_parameters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(model_parameters) = 'object'),
  ADD COLUMN IF NOT EXISTS prompt_version INTEGER NOT NULL DEFAULT 1 CHECK (prompt_version > 0);

CREATE TABLE public.marketing_agent_global_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketing_agent_templates(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  system_prompt TEXT NOT NULL CHECK (BTRIM(system_prompt) <> ''),
  prompt_version INTEGER NOT NULL DEFAULT 1 CHECK (prompt_version > 0),
  default_context_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_context_policy) = 'object'),
  default_model_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_model_policy) = 'object'),
  default_quality_gates JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_quality_gates) = 'object'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id),
  UNIQUE (agent_type)
);

CREATE TABLE public.marketing_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL CHECK (BTRIM(workflow_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','scheduled','event','webhook')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, workflow_key)
);

CREATE TABLE public.marketing_workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.marketing_workflows(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL CHECK (BTRIM(node_key) <> ''),
  node_type TEXT NOT NULL CHECK (node_type IN ('agent','tool','gate','approval','output')),
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  tool_key TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  position_x NUMERIC(10,2) NOT NULL DEFAULT 0,
  position_y NUMERIC(10,2) NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, node_key)
);

CREATE TABLE public.marketing_workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.marketing_workflows(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES public.marketing_workflow_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.marketing_workflow_nodes(id) ON DELETE CASCADE,
  condition_key TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, source_node_id, target_node_id, condition_key)
);

CREATE TABLE public.marketing_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.marketing_workflows(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  run_type TEXT NOT NULL DEFAULT 'manual' CHECK (run_type IN ('manual','scheduled','event','retry')),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  context_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context_snapshot) = 'object'),
  result_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(result_payload) = 'object'),
  credit_debit INTEGER NOT NULL DEFAULT 0 CHECK (credit_debit >= 0),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  error_message TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.marketing_workflow_runs(id) ON DELETE CASCADE,
  workflow_node_id UUID REFERENCES public.marketing_workflow_nodes(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.marketing_agent_templates(id) ON DELETE SET NULL,
  global_prompt_id UUID REFERENCES public.marketing_agent_global_prompts(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled')),
  agent_prompt_snapshot TEXT,
  prompt_config_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(prompt_config_snapshot) = 'object'),
  context_summary TEXT,
  compiled_prompt_hash TEXT,
  model_provider TEXT,
  model_name TEXT,
  fallback_model_name TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.marketing_workflow_runs(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL CHECK (BTRIM(tool_key) <> ''),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.agent_budget_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  agent_type TEXT,
  max_cost_per_run NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_run >= 0),
  max_credits_per_run INTEGER NOT NULL DEFAULT 0 CHECK (max_credits_per_run >= 0),
  max_runs_per_day INTEGER NOT NULL DEFAULT 0 CHECK (max_runs_per_day >= 0),
  monthly_credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credit_limit >= 0),
  require_approval_over_credits INTEGER NOT NULL DEFAULT 0 CHECK (require_approval_over_credits >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agent_id IS NOT NULL OR agent_type IS NOT NULL)
);

CREATE TABLE public.model_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  agent_type TEXT,
  routing_tier TEXT NOT NULL DEFAULT 'default' CHECK (routing_tier IN ('cheap','default','premium','fallback')),
  provider TEXT NOT NULL CHECK (BTRIM(provider) <> ''),
  model_name TEXT NOT NULL CHECK (BTRIM(model_name) <> ''),
  fallback_model_name TEXT,
  max_input_tokens INTEGER NOT NULL DEFAULT 8000 CHECK (max_input_tokens > 0),
  max_output_tokens INTEGER NOT NULL DEFAULT 2000 CHECK (max_output_tokens > 0),
  temperature NUMERIC(4,3) NOT NULL DEFAULT 0.4 CHECK (temperature >= 0 AND temperature <= 2),
  max_cost_per_run NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_run >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agent_id IS NOT NULL OR agent_type IS NOT NULL)
);

CREATE TABLE public.marketing_agent_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  agent_type TEXT,
  tool_key TEXT NOT NULL CHECK (BTRIM(tool_key) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requires_human_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_calls_per_run INTEGER NOT NULL DEFAULT 1 CHECK (max_calls_per_run >= 0),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (agent_id IS NOT NULL OR agent_type IS NOT NULL)
);

CREATE INDEX idx_marketing_global_prompts_type_status ON public.marketing_agent_global_prompts(agent_type, status);

CREATE INDEX idx_marketing_agents_contract_type_status ON public.marketing_agents(contract_id, agent_type, status);

CREATE INDEX idx_marketing_workflows_contract_status ON public.marketing_workflows(contract_id, status);

CREATE INDEX idx_marketing_workflow_nodes_workflow ON public.marketing_workflow_nodes(workflow_id, node_type);

CREATE INDEX idx_marketing_workflow_edges_workflow ON public.marketing_workflow_edges(workflow_id);

CREATE INDEX idx_marketing_workflow_runs_contract_status ON public.marketing_workflow_runs(contract_id, status, created_at DESC);

CREATE INDEX idx_marketing_agent_runs_workflow_status ON public.marketing_agent_runs(workflow_run_id, status, created_at DESC);

CREATE INDEX idx_marketing_tool_runs_workflow_status ON public.marketing_tool_runs(workflow_run_id, status, created_at DESC);

CREATE INDEX idx_agent_budget_policies_contract_agent ON public.agent_budget_policies(contract_id, agent_id, agent_type);

CREATE INDEX idx_model_routing_rules_contract_agent ON public.model_routing_rules(contract_id, agent_id, agent_type, routing_tier);

CREATE INDEX idx_marketing_agent_tool_policies_contract_agent ON public.marketing_agent_tool_policies(contract_id, agent_id, agent_type, tool_key);

CREATE TRIGGER update_marketing_agent_global_prompts_updated_at BEFORE UPDATE ON public.marketing_agent_global_prompts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_workflows_updated_at BEFORE UPDATE ON public.marketing_workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_workflow_nodes_updated_at BEFORE UPDATE ON public.marketing_workflow_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_workflow_runs_updated_at BEFORE UPDATE ON public.marketing_workflow_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_budget_policies_updated_at BEFORE UPDATE ON public.agent_budget_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_model_routing_rules_updated_at BEFORE UPDATE ON public.model_routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_agent_tool_policies_updated_at BEFORE UPDATE ON public.marketing_agent_tool_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_usage_ledger
  ADD CONSTRAINT ai_usage_ledger_workflow_run_id_fkey
  FOREIGN KEY (workflow_run_id)
  REFERENCES public.marketing_workflow_runs(id)
  ON DELETE SET NULL
  NOT VALID;

INSERT INTO public.marketing_agent_global_prompts (
  template_id,
  agent_type,
  system_prompt,
  prompt_version,
  default_context_policy,
  default_model_policy,
  default_quality_gates
)
SELECT
  t.id,
  t.agent_type,
  CASE t.agent_type
    WHEN 'content_radar' THEN 'Voce e o Radar de Conteudo da YUX. Encontre oportunidades de marketing usando apenas fontes e ferramentas autorizadas. Nunca publique, compre midia ou afirme dados sem fonte.'
    WHEN 'strategic_curator' THEN 'Voce e o Curador Estrategico da YUX. Priorize ideias por impacto comercial, aderencia ao cliente e risco. Explique rejeicoes de forma objetiva.'
    WHEN 'content_strategist' THEN 'Voce e o Estrategista de Conteudo da YUX. Transforme ideias aprovadas em briefings claros, com objetivo, publico, funil, canal, CTA e criterios de qualidade.'
    WHEN 'multichannel_writer' THEN 'Voce e o Redator Multicanal da YUX. Escreva com base no tom da marca, RAG e restricoes do contrato. Evite promessas absolutas e preserve clareza comercial.'
    WHEN 'brand_quality_reviewer' THEN 'Voce e o Revisor de Marca e Qualidade da YUX. Avalie tom, clareza, riscos, LGPD, promessas comerciais, grounding necessario e criterios do canal.'
    WHEN 'campaign_strategist' THEN 'Voce e o Estrategista de Campanhas da YUX. Crie apenas rascunhos e hipoteses de campanha, com publicos, copies, CTA, UTM e riscos. Nunca ative campanha.'
    WHEN 'visual_creative_generator' THEN 'Voce e o Gerador de Criativos Visuais da YUX. Produza conceitos e prompts visuais aderentes a marca, com limites de creditos e aprovacao humana quando exigida.'
    WHEN 'editorial_calendar_manager' THEN 'Voce e o Gestor de Calendario Editorial da YUX. Distribua conteudos com equilibrio de temas, canais e prazos. Nunca publique sem aprovacao.'
    WHEN 'controlled_publisher' THEN 'Voce e o Publicador Controlado da YUX. Crie rascunhos e tarefas somente quando autorizado. Publicacao final sempre depende da politica de aprovacao.'
    WHEN 'performance_analyst' THEN 'Voce e o Analista de Performance da YUX. Analise resultados, gere hipoteses e recomende proximos temas com base em dados disponiveis e rastreaveis.'
    ELSE 'Voce e um agente de marketing da YUX. Siga as permissoes, contexto e limites do contrato.'
  END,
  1,
  jsonb_build_object('includeBrandProfile', true, 'includeProducts', true, 'includeKnowledge', true, 'includeRecentContent', true),
  jsonb_build_object('routingTier', 'default'),
  jsonb_build_object('requiresHumanApproval', t.requires_human_approval, 'minimumQualityScore', 70)
FROM public.marketing_agent_templates t
ON CONFLICT (template_id) DO UPDATE
SET agent_type = EXCLUDED.agent_type,
    system_prompt = EXCLUDED.system_prompt,
    default_context_policy = EXCLUDED.default_context_policy,
    default_model_policy = EXCLUDED.default_model_policy,
    default_quality_gates = EXCLUDED.default_quality_gates,
    updated_at = NOW();

INSERT INTO public.model_routing_rules (
  agent_type,
  routing_tier,
  provider,
  model_name,
  fallback_model_name,
  max_input_tokens,
  max_output_tokens,
  temperature,
  max_cost_per_run
)
VALUES
  ('content_radar', 'cheap', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 8000, 1200, 0.2, 0),
  ('strategic_curator', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 8000, 1200, 0.3, 0),
  ('content_strategist', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 12000, 1800, 0.4, 0),
  ('multichannel_writer', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 12000, 2200, 0.7, 0),
  ('brand_quality_reviewer', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 12000, 1200, 0.2, 0),
  ('campaign_strategist', 'premium', 'openrouter', 'openai/gpt-4o', 'openai/gpt-4o-mini', 16000, 2200, 0.5, 0),
  ('visual_creative_generator', 'default', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o', 8000, 1200, 0.6, 0),
  ('editorial_calendar_manager', 'cheap', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 8000, 1000, 0.2, 0),
  ('controlled_publisher', 'cheap', 'openrouter', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini', 4000, 800, 0.1, 0),
  ('performance_analyst', 'premium', 'openrouter', 'openai/gpt-4o', 'openai/gpt-4o-mini', 16000, 2400, 0.3, 0)
ON CONFLICT DO NOTHING;


-- source: 20260607003007_marketing_studio_radar_research.sql
-- YUX Marketing Studio Phase 5: controlled research, source ingestion,
-- Radar runs, source item deduplication and research cache.

CREATE TABLE public.marketing_source_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.marketing_sources(id) ON DELETE SET NULL,
  radar_run_id UUID,
  item_type TEXT NOT NULL DEFAULT 'article'
    CHECK (item_type IN ('article','search_result','rss_entry','youtube_video','crm_topic','omnichannel_question','campaign_signal','manual')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  source_url TEXT,
  normalized_url TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  summary TEXT NOT NULL DEFAULT '',
  raw_excerpt TEXT,
  language TEXT NOT NULL DEFAULT 'pt',
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  dedupe_key TEXT NOT NULL CHECK (BTRIM(dedupe_key) <> ''),
  relevance_score INTEGER NOT NULL DEFAULT 0 CHECK (relevance_score BETWEEN 0 AND 100),
  novelty_score INTEGER NOT NULL DEFAULT 0 CHECK (novelty_score BETWEEN 0 AND 100),
  commercial_score INTEGER NOT NULL DEFAULT 0 CHECK (commercial_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'captured'
    CHECK (status IN ('captured','summarized','idea_generated','dismissed','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, dedupe_key)
);

CREATE TABLE public.marketing_research_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('jina_reader','jina_search','tavily','serper','firecrawl','internal')),
  request_type TEXT NOT NULL CHECK (request_type IN ('reader','search','crawl','internal_lookup')),
  request_key TEXT NOT NULL CHECK (BTRIM(request_key) <> ''),
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_payload) = 'object'),
  response_summary TEXT NOT NULL DEFAULT '',
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(response_payload) = 'object'),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, provider, request_type, request_key)
);

CREATE TABLE public.marketing_radar_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','collecting','curating','completed','failed','cancelled')),
  period_start DATE,
  period_end DATE,
  query TEXT,
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  idea_count INTEGER NOT NULL DEFAULT 0 CHECK (idea_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  summary TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketing_source_items
  ADD CONSTRAINT marketing_source_items_radar_run_id_fkey
  FOREIGN KEY (radar_run_id)
  REFERENCES public.marketing_radar_runs(id)
  ON DELETE SET NULL;

ALTER TABLE public.marketing_ideas
  ADD COLUMN IF NOT EXISTS source_item_id UUID REFERENCES public.marketing_source_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS radar_run_id UUID REFERENCES public.marketing_radar_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curation_notes TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT;

CREATE INDEX idx_marketing_source_items_contract_status ON public.marketing_source_items(contract_id, status, created_at DESC);

CREATE INDEX idx_marketing_source_items_source_created ON public.marketing_source_items(source_id, created_at DESC);

CREATE INDEX idx_marketing_source_items_radar_run ON public.marketing_source_items(radar_run_id);

CREATE INDEX idx_marketing_research_cache_contract_provider ON public.marketing_research_cache(contract_id, provider, request_type, created_at DESC);

CREATE INDEX idx_marketing_research_cache_expires ON public.marketing_research_cache(expires_at);

CREATE INDEX idx_marketing_radar_runs_contract_status ON public.marketing_radar_runs(contract_id, status, created_at DESC);

CREATE INDEX idx_marketing_ideas_source_item ON public.marketing_ideas(source_item_id);

CREATE INDEX idx_marketing_ideas_radar_run ON public.marketing_ideas(radar_run_id);

CREATE TRIGGER update_marketing_source_items_updated_at BEFORE UPDATE ON public.marketing_source_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_radar_runs_updated_at BEFORE UPDATE ON public.marketing_radar_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260607003928_yux_hub_jina_provider_defaults.sql
-- Jina AI global provider default for Marketing Studio research tools.
-- Secret values stay in Supabase/Vercel/server-side secrets. The database stores
-- only safe references and operational metadata.

INSERT INTO public.platform_provider_connections (
  provider_type,
  provider_key,
  display_name,
  environment,
  status,
  public_config,
  secret_reference,
  is_default
)
VALUES (
  'internal_service',
  'jina_ai',
  'Jina AI',
  'production',
  'not_configured',
  jsonb_build_object(
    'baseUrl', 'https://api.jina.ai/v1',
    'readerBaseUrl', 'https://r.jina.ai',
    'searchBaseUrl', 'https://s.jina.ai',
    'readerTool', 'jina_reader',
    'searchTool', 'jina_search',
    'groundingTool', 'jina_grounding',
    'purpose', 'leitura, busca e grounding controlados para Marketing Studio',
    'managedBy', 'YUX Hub Admin',
    'requiredSecret', 'JINA_API_KEY'
  ),
  'JINA_API_KEY',
  true
)
ON CONFLICT (provider_type, provider_key, environment) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      public_config = public.platform_provider_connections.public_config || EXCLUDED.public_config,
      secret_reference = COALESCE(public.platform_provider_connections.secret_reference, EXCLUDED.secret_reference),
      is_default = EXCLUDED.is_default,
      updated_at = NOW();


-- source: 20260607141134_marketing_studio_writing_review_grounding.sql
-- YUX Marketing Studio Phase 6: provider-neutral writing, review, quality
-- gates and grounding control. Live LLM/Jina execution stays outside this
-- migration; these tables store the operational contracts and logs.

CREATE TABLE public.marketing_content_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  writer_agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  reviewer_agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  source_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  content_version_id UUID REFERENCES public.content_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','writing','reviewing','grounding','waiting_approval','succeeded','failed','cancelled')),
  content_type TEXT NOT NULL DEFAULT 'social_post'
    CHECK (content_type IN ('social_post','blog_article','newsletter','email','ad_copy','video_script','carousel_text','creative_brief')),
  channel TEXT NOT NULL CHECK (BTRIM(channel) <> ''),
  brief_snapshot TEXT NOT NULL DEFAULT '',
  context_summary TEXT NOT NULL DEFAULT '',
  prompt_snapshot TEXT,
  output_title TEXT,
  output_body TEXT,
  output_cta TEXT,
  variation_count INTEGER NOT NULL DEFAULT 0 CHECK (variation_count >= 0),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  requires_grounding BOOLEAN NOT NULL DEFAULT FALSE,
  grounding_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (grounding_status IN ('not_required','required','running','succeeded','failed','blocked')),
  checklist JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(checklist) = 'object'),
  error_message TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_content_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  generation_run_id UUID REFERENCES public.marketing_content_generation_runs(id) ON DELETE SET NULL,
  reviewer_agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  grounding_tool_run_id UUID REFERENCES public.marketing_tool_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','passed','needs_changes','rejected','failed')),
  quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  checklist JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(checklist) = 'object'),
  risk_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  grounding_required BOOLEAN NOT NULL DEFAULT FALSE,
  grounding_summary TEXT,
  comments TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketing_generation_runs_contract_status
  ON public.marketing_content_generation_runs(contract_id, status, created_at DESC);

CREATE INDEX idx_marketing_generation_runs_content
  ON public.marketing_content_generation_runs(content_item_id, created_at DESC);

CREATE INDEX idx_marketing_generation_runs_idea
  ON public.marketing_content_generation_runs(source_idea_id, created_at DESC);

CREATE INDEX idx_marketing_quality_checks_contract_status
  ON public.marketing_content_quality_checks(contract_id, status, created_at DESC);

CREATE INDEX idx_marketing_quality_checks_content
  ON public.marketing_content_quality_checks(content_item_id, created_at DESC);

CREATE TRIGGER update_marketing_content_generation_runs_updated_at
  BEFORE UPDATE ON public.marketing_content_generation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_content_quality_checks_updated_at
  BEFORE UPDATE ON public.marketing_content_quality_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.marketing_agent_global_prompts
SET default_quality_gates = default_quality_gates || jsonb_build_object(
      'minimumQualityScore', 75,
      'requireCta', true,
      'blockForbiddenTopics', true,
      'groundingWhenFactual', true
    ),
    updated_at = NOW()
WHERE agent_type IN ('multichannel_writer', 'brand_quality_reviewer');


-- source: 20260607150115_marketing_studio_wordpress_publishing.sql
-- Marketing Studio Phase 7: WordPress controlled publishing.

CREATE TABLE public.publishing_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'wordpress' CHECK (provider IN ('wordpress')),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  status TEXT NOT NULL DEFAULT 'needs_setup'
    CHECK (status IN ('needs_setup','connected','stale','needs_reauth','failed','disabled')),
  site_url TEXT NOT NULL CHECK (BTRIM(site_url) <> ''),
  username TEXT,
  auth_type TEXT NOT NULL DEFAULT 'application_password'
    CHECK (auth_type IN ('application_password','token_reference')),
  token_reference TEXT,
  provider_account_id TEXT,
  last_verified_at TIMESTAMPTZ,
  protected_error TEXT,
  public_config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(public_config) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contract_id, provider, name)
);

CREATE TABLE public.publishing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.publishing_connections(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  calendar_item_id UUID REFERENCES public.editorial_calendar_items(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create_draft','update_draft','publish')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  provider_post_id TEXT,
  published_url TEXT,
  idempotency_key TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_payload) = 'object'),
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(response_payload) = 'object'),
  protected_error TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, idempotency_key)
);

CREATE INDEX idx_publishing_connections_contract_status ON public.publishing_connections(contract_id, provider, status);

CREATE INDEX idx_publishing_runs_contract_status ON public.publishing_runs(contract_id, status, created_at DESC);

CREATE INDEX idx_publishing_runs_content_action ON public.publishing_runs(content_item_id, action, status);

CREATE TRIGGER update_publishing_connections_updated_at BEFORE UPDATE ON public.publishing_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_publishing_runs_updated_at BEFORE UPDATE ON public.publishing_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.marketing_agent_templates
SET default_tools = ARRAY['create_task','create_wordpress_draft','publish_wordpress']::TEXT[]
WHERE agent_type = 'controlled_publisher';


-- source: 20260607152544_marketing_studio_campaign_creatives.sql
-- Marketing Studio Phase 8: campaign and creative suggestions.

CREATE TABLE public.marketing_campaign_creative_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  source_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  created_by_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','changes_requested','rejected','converted','archived')),
  provider TEXT NOT NULL DEFAULT 'meta' CHECK (provider IN ('meta','google')),
  objective TEXT NOT NULL DEFAULT 'lead_generation'
    CHECK (objective IN ('lead_generation','traffic','conversions','awareness')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  campaign_name TEXT NOT NULL CHECK (BTRIM(campaign_name) <> ''),
  angle TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  funnel_stage TEXT NOT NULL DEFAULT 'consideration'
    CHECK (funnel_stage IN ('awareness','consideration','conversion','retention')),
  cta TEXT,
  daily_budget NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (daily_budget >= 0),
  total_budget NUMERIC(15,2) CHECK (total_budget IS NULL OR total_budget >= 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  utm_source TEXT,
  utm_medium TEXT NOT NULL DEFAULT 'paid',
  utm_campaign TEXT,
  copy_variations JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(copy_variations) = 'array'),
  creative_concepts JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(creative_concepts) = 'array'),
  targeting_suggestions JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(targeting_suggestions) = 'object'),
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  risk_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.marketing_campaign_draft_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES public.marketing_campaign_creative_suggestions(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  workflow_run_id UUID REFERENCES public.marketing_workflow_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  idempotency_key TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(request_payload) = 'object'),
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(response_payload) = 'object'),
  protected_error TEXT,
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (suggestion_id, idempotency_key)
);

CREATE INDEX idx_marketing_campaign_suggestions_contract_status ON public.marketing_campaign_creative_suggestions(contract_id, status, created_at DESC);

CREATE INDEX idx_marketing_campaign_suggestions_campaign ON public.marketing_campaign_creative_suggestions(campaign_id);

CREATE INDEX idx_marketing_campaign_suggestions_landing_page ON public.marketing_campaign_creative_suggestions(landing_page_id);

CREATE INDEX idx_marketing_campaign_draft_runs_contract_status ON public.marketing_campaign_draft_runs(contract_id, status, created_at DESC);

CREATE TRIGGER update_marketing_campaign_suggestions_updated_at
  BEFORE UPDATE ON public.marketing_campaign_creative_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_campaign_draft_runs_updated_at
  BEFORE UPDATE ON public.marketing_campaign_draft_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.marketing_agent_templates
SET default_tools = ARRAY['campaign_draft','rag_search']::TEXT[]
WHERE agent_type = 'campaign_strategist';


-- source: 20260607175945_marketing_studio_native_integrations.sql
-- Marketing Studio Phase 9: native Meta and Google integrations.
-- OAuth sessions are visible only through Marketing Studio RLS. Encrypted

CREATE TABLE public.provider_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('meta_social','google_business_profile','meta_ads','google_ads')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('publishing','ads')),
  state_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','failed','expired')),
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  redirect_uri TEXT,
  sanitized_result JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(sanitized_result) = 'object'),
  protected_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.provider_integration_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('meta_social','google_business_profile','meta_ads','google_ads','wordpress')),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('publishing','ads')),
  connection_table TEXT NOT NULL CHECK (connection_table IN ('publishing_connections','ad_provider_connections','channel_connections')),
  connection_id UUID NOT NULL,
  secret_kind TEXT NOT NULL CHECK (secret_kind IN ('access_token','refresh_token','client_secret','application_password')),
  reference TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL CHECK (BTRIM(ciphertext) <> ''),
  nonce TEXT NOT NULL CHECK (BTRIM(nonce) <> ''),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_provider_check;

ALTER TABLE public.publishing_connections
  ADD CONSTRAINT publishing_connections_provider_check
  CHECK (provider IN ('wordpress','meta_facebook','meta_instagram','google_business_profile'));

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_status_check;

ALTER TABLE public.publishing_connections
  ADD CONSTRAINT publishing_connections_status_check
  CHECK (status IN ('needs_setup','connected','stale','needs_reauth','failed','disabled'));

ALTER TABLE public.publishing_connections
  DROP CONSTRAINT IF EXISTS publishing_connections_site_url_check;

ALTER TABLE public.publishing_connections
  ALTER COLUMN site_url DROP NOT NULL,
  ADD CONSTRAINT publishing_connections_site_url_check
  CHECK (site_url IS NULL OR BTRIM(site_url) <> '');

ALTER TABLE public.publishing_connections
  ADD COLUMN IF NOT EXISTS provider_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_asset_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_parent_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ;

ALTER TABLE public.publishing_runs
  ADD COLUMN IF NOT EXISTS external_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS external_parent_id TEXT;

ALTER TABLE public.ad_provider_connections
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reauth_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS time_zone TEXT,
  ADD COLUMN IF NOT EXISTS can_manage_campaigns BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.ad_provider_mutation_runs
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_set_id TEXT,
  ADD COLUMN IF NOT EXISTS external_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX idx_provider_oauth_sessions_org_status
  ON public.provider_oauth_sessions(organization_id, provider, target_kind, status, created_at DESC);

CREATE INDEX idx_provider_integration_secrets_connection
  ON public.provider_integration_secrets(connection_table, connection_id, secret_kind);

CREATE INDEX idx_publishing_connections_provider_asset
  ON public.publishing_connections(provider, provider_asset_id)
  WHERE provider_asset_id IS NOT NULL;

CREATE INDEX idx_publishing_runs_provider_post
  ON public.publishing_runs(provider_post_id)
  WHERE provider_post_id IS NOT NULL;

CREATE INDEX idx_ad_provider_connections_contract
  ON public.ad_provider_connections(contract_id, provider, status)
  WHERE contract_id IS NOT NULL;

CREATE TRIGGER update_provider_oauth_sessions_updated_at
  BEFORE UPDATE ON public.provider_oauth_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_integration_secrets_updated_at
  BEFORE UPDATE ON public.provider_integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260608095633_portal_phase6_rls_visibility.sql
-- Phase 6 portal visibility fixes.
-- Marketing Studio records are scoped by organization_id, while contracts are
-- scoped by client_id. The original helper compared those ids directly, which
-- hid valid portal rows from client users.
CREATE OR REPLACE FUNCTION private.has_active_marketing_studio_contract(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    JOIN public.contracts c
      ON c.client_id = o.client_id
     AND c.status = 'active'
    JOIN public.contract_modules cm
      ON cm.contract_id = c.id
     AND cm.module_key = 'marketing_studio'
     AND cm.enabled = TRUE
    WHERE o.id = target_organization_id
      AND o.kind = 'client'
  );
$$;

REVOKE ALL ON FUNCTION private.has_active_marketing_studio_contract(UUID) FROM PUBLIC;

UPDATE public.contract_modules
SET enabled = TRUE,
    updated_at = NOW()
WHERE contract_id = '660e8400-e29b-41d4-a716-446655440001'
  AND module_key = 'finance';


-- source: 20260608130000_growth_workspace_foundation.sql
-- Growth Workspace foundation for Campanha 360, onboarding and smart segments.

CREATE TABLE IF NOT EXISTS public.growth_campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  objective TEXT NOT NULL CHECK (objective IN (
    'lead_generation',
    'whatsapp_capture',
    'offer_promotion',
    'reactivation',
    'appointment_booking',
    'service_launch',
    'remarketing'
  )),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN (
    'draft',
    'planning',
    'waiting_assets',
    'waiting_approval',
    'ready',
    'active',
    'paused',
    'completed',
    'cancelled'
  )),
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source_blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_campaign_plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.growth_campaign_plans(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL CHECK (step_key IN (
    'segment',
    'landing_page',
    'form',
    'creative',
    'ad',
    'organic_post',
    'whatsapp_or_email_followup',
    'automation',
    'approval',
    'report'
  )),
  label TEXT NOT NULL CHECK (BTRIM(label) <> ''),
  description TEXT,
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started',
    'blocked',
    'in_progress',
    'linked',
    'completed',
    'skipped'
  )),
  linked_entity_type TEXT,
  linked_entity_id UUID,
  owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  depends_on TEXT[] NOT NULL DEFAULT '{}'::text[],
  blocked_reason TEXT,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, step_key)
);

CREATE TABLE IF NOT EXISTS public.growth_smart_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  estimated_size INTEGER NOT NULL DEFAULT 0 CHECK (estimated_size >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  source_blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.growth_onboarding_checklists(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  label TEXT NOT NULL CHECK (BTRIM(label) <> ''),
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  skipped_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (checklist_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_growth_campaign_plans_org ON public.growth_campaign_plans(organization_id);

CREATE INDEX IF NOT EXISTS idx_growth_campaign_plans_contract ON public.growth_campaign_plans(contract_id);

CREATE INDEX IF NOT EXISTS idx_growth_campaign_plan_steps_plan ON public.growth_campaign_plan_steps(plan_id);

CREATE INDEX IF NOT EXISTS idx_growth_smart_segments_org ON public.growth_smart_segments(organization_id);

CREATE INDEX IF NOT EXISTS idx_growth_smart_segments_contract ON public.growth_smart_segments(contract_id);

CREATE INDEX IF NOT EXISTS idx_growth_onboarding_checklists_org ON public.growth_onboarding_checklists(organization_id);

CREATE INDEX IF NOT EXISTS idx_growth_onboarding_checklists_contract ON public.growth_onboarding_checklists(contract_id);

CREATE INDEX IF NOT EXISTS idx_growth_onboarding_steps_checklist ON public.growth_onboarding_steps(checklist_id);


-- source: 20260611190000_yux_strategy_engine.sql
-- YUX Strategy Engine foundation: shared commercial doctrine, strategy
-- profiles, action policies, commercial stage taxonomy and conversation role
-- ownership for cross-module AI agents.

-- pgvector is optional in the self-hosted stack. Keep vector payloads as JSONB
-- for the initial VPS bootstrap.

CREATE TABLE IF NOT EXISTS public.yux_strategy_doctrines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctrine_key TEXT NOT NULL UNIQUE CHECK (BTRIM(doctrine_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  rules JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(rules) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctrine_id UUID REFERENCES public.yux_strategy_doctrines(id) ON DELETE SET NULL,
  skill_key TEXT NOT NULL UNIQUE CHECK (BTRIM(skill_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  priority INTEGER NOT NULL DEFAULT 100,
  global_rules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  decision_rules JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(decision_rules) = 'array'),
  output_contract JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_contract) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_skill_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES public.yux_strategy_skills(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL CHECK (BTRIM(section_key) <> ''),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  body TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, section_key)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key TEXT NOT NULL UNIQUE CHECK (BTRIM(profile_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  purpose TEXT NOT NULL DEFAULT '',
  allowed_modules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  forbidden_actions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_approval_for TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  default_context_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(default_context_policy) = 'object'),
  approval_policy JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(approval_policy) = 'object'),
  output_schema JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_schema) = 'object'),
  max_context_chars INTEGER NOT NULL DEFAULT 5000 CHECK (max_context_chars > 0),
  max_cards INTEGER NOT NULL DEFAULT 8 CHECK (max_cards >= 0),
  max_chunks INTEGER NOT NULL DEFAULT 4 CHECK (max_chunks >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_profile_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.yux_strategy_skills(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  context_weight NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (context_weight >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL CHECK (binding_type IN ('marketing_agent_type', 'marketing_agent', 'ai_assistant', 'workflow', 'system')),
  marketing_agent_type TEXT,
  marketing_agent_id UUID REFERENCES public.marketing_agents(id) ON DELETE CASCADE,
  ai_assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  workflow_key TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (binding_type = 'marketing_agent_type' AND marketing_agent_type IS NOT NULL AND marketing_agent_id IS NULL AND ai_assistant_id IS NULL)
    OR (binding_type = 'marketing_agent' AND marketing_agent_id IS NOT NULL)
    OR (binding_type = 'ai_assistant' AND ai_assistant_id IS NOT NULL)
    OR (binding_type = 'workflow' AND workflow_key IS NOT NULL)
    OR (binding_type = 'system')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_yux_strategy_bindings_marketing_type
  ON public.yux_strategy_agent_bindings(profile_id, marketing_agent_type)
  WHERE binding_type = 'marketing_agent_type' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_yux_strategy_bindings_marketing_agent
  ON public.yux_strategy_agent_bindings(profile_id, marketing_agent_id)
  WHERE binding_type = 'marketing_agent' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_yux_strategy_bindings_ai_assistant
  ON public.yux_strategy_agent_bindings(profile_id, ai_assistant_id)
  WHERE binding_type = 'ai_assistant' AND status = 'active';

CREATE TABLE IF NOT EXISTS public.yux_strategy_profile_tool_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL CHECK (BTRIM(tool_key) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requires_human_approval BOOLEAN NOT NULL DEFAULT FALSE,
  max_calls_per_run INTEGER NOT NULL DEFAULT 1 CHECK (max_calls_per_run >= 0),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, tool_key)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_profile_action_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL CHECK (BTRIM(action_key) <> ''),
  policy TEXT NOT NULL CHECK (policy IN ('allow', 'require_approval', 'deny')),
  reason TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, action_key)
);

CREATE TABLE IF NOT EXISTS public.yux_commercial_stage_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key TEXT NOT NULL UNIQUE CHECK (BTRIM(stage_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  stage_group TEXT NOT NULL CHECK (stage_group IN ('audience', 'lead', 'opportunity', 'customer', 'recovery', 'excluded')),
  default_temperature TEXT CHECK (default_temperature IS NULL OR default_temperature IN ('cold', 'warm', 'hot', 'unknown')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_contact_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.omnichannel_contacts(id) ON DELETE SET NULL,
  previous_stage TEXT,
  new_stage TEXT NOT NULL CHECK (BTRIM(new_stage) <> ''),
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'crm', 'omnichannel', 'campaign', 'proposal', 'import')),
  source_record_id UUID,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL)
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS commercial_stage TEXT,
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT CHECK (lead_temperature IS NULL OR lead_temperature IN ('cold','warm','hot','unknown')),
  ADD COLUMN IF NOT EXISTS source_channel TEXT,
  ADD COLUMN IF NOT EXISTS last_meaningful_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_human_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_ai_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_best_action TEXT,
  ADD COLUMN IF NOT EXISTS main_objection TEXT,
  ADD COLUMN IF NOT EXISTS fit_status TEXT CHECK (fit_status IS NULL OR fit_status IN ('good_fit','unclear','bad_fit')),
  ADD COLUMN IF NOT EXISTS handoff_status TEXT CHECK (handoff_status IS NULL OR handoff_status IN ('none','suggested','pending','completed','rejected')),
  ADD COLUMN IF NOT EXISTS customer_lifecycle_stage TEXT;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS conversation_current_role TEXT CHECK (conversation_current_role IS NULL OR conversation_current_role IN ('sdr','closer','support','retention','custom')),
  ADD COLUMN IF NOT EXISTS conversation_current_strategy_profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_stage TEXT,
  ADD COLUMN IF NOT EXISTS last_handoff_id UUID,
  ADD COLUMN IF NOT EXISTS role_locked_until TIMESTAMPTZ;

ALTER TABLE public.ai_assistants
  ADD COLUMN IF NOT EXISTS assistant_role TEXT CHECK (assistant_role IS NULL OR assistant_role IN ('sdr','closer','support','retention','custom')),
  ADD COLUMN IF NOT EXISTS strategy_profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routing_priority INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS routing_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(routing_metadata) = 'object');

CREATE TABLE IF NOT EXISTS public.ai_assistant_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  channel TEXT CHECK (channel IS NULL OR channel IN ('whatsapp', 'instagram', 'email', 'webchat')),
  required_role TEXT CHECK (required_role IS NULL OR required_role IN ('sdr','closer','support','retention','custom')),
  stage_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  intent_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  keyword_patterns TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  default_rule BOOLEAN NOT NULL DEFAULT FALSE,
  score_weight INTEGER NOT NULL DEFAULT 10 CHECK (score_weight >= 0),
  lock_role_minutes INTEGER NOT NULL DEFAULT 0 CHECK (lock_role_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  doctrine_id UUID REFERENCES public.yux_strategy_doctrines(id) ON DELETE SET NULL,
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'docx', 'html', 'markdown', 'text', 'url', 'manual')),
  source_title TEXT NOT NULL CHECK (BTRIM(source_title) <> ''),
  source_hash TEXT NOT NULL CHECK (BTRIM(source_hash) <> ''),
  original_filename TEXT,
  storage_path TEXT,
  page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0),
  language TEXT NOT NULL DEFAULT 'pt-BR',
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.yux_strategy_source_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  page_hash TEXT NOT NULL CHECK (BTRIM(page_hash) <> ''),
  ocr_text TEXT,
  clean_text TEXT,
  image_storage_path TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, page_number),
  UNIQUE (page_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.yux_strategy_source_documents(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.yux_strategy_source_pages(id) ON DELETE SET NULL,
  section_key TEXT NOT NULL DEFAULT 'section',
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_hash TEXT NOT NULL CHECK (BTRIM(chunk_hash) <> ''),
  chunk_text TEXT NOT NULL CHECK (BTRIM(chunk_text) <> ''),
  token_estimate INTEGER NOT NULL DEFAULT 0 CHECK (token_estimate >= 0),
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_source_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.yux_strategy_source_documents(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.yux_strategy_source_pages(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('page_image', 'diagram', 'table', 'chart', 'screenshot', 'other')),
  asset_hash TEXT NOT NULL CHECK (BTRIM(asset_hash) <> ''),
  storage_path TEXT NOT NULL CHECK (BTRIM(storage_path) <> ''),
  mime_type TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_concept_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctrine_id UUID REFERENCES public.yux_strategy_doctrines(id) ON DELETE SET NULL,
  source_document_id UUID REFERENCES public.yux_strategy_source_documents(id) ON DELETE SET NULL,
  source_chunk_id UUID REFERENCES public.yux_strategy_source_chunks(id) ON DELETE SET NULL,
  concept TEXT NOT NULL CHECK (BTRIM(concept) <> ''),
  category TEXT NOT NULL CHECK (BTRIM(category) <> ''),
  source_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (source_scope IN ('internal', 'client', 'public', 'system')),
  visibility TEXT NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only', 'client_safe')),
  problem_solved TEXT NOT NULL DEFAULT '',
  trigger_signals TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  diagnosis_questions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  decision_rules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  anti_patterns TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  recommended_actions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  allowed_agent_profile_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  stage_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  retrieval_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  yux_modules TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  human_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (human_review_status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  quality_score INTEGER CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (concept, category)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_card_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.yux_strategy_concept_cards(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL CHECK (BTRIM(embedding_model) <> ''),
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding JSONB CHECK (embedding IS NULL OR jsonb_typeof(embedding) = 'array'),
  embedding_values JSONB CHECK (embedding_values IS NULL OR jsonb_typeof(embedding_values) = 'array'),
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, embedding_model, content_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES public.yux_strategy_source_chunks(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL CHECK (BTRIM(embedding_model) <> ''),
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding JSONB CHECK (embedding IS NULL OR jsonb_typeof(embedding) = 'array'),
  embedding_values JSONB CHECK (embedding_values IS NULL OR jsonb_typeof(embedding_values) = 'array'),
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chunk_id, embedding_model, content_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_asset_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.yux_strategy_source_assets(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL CHECK (BTRIM(embedding_model) <> ''),
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding JSONB CHECK (embedding IS NULL OR jsonb_typeof(embedding) = 'array'),
  embedding_values JSONB CHECK (embedding_values IS NULL OR jsonb_typeof(embedding_values) = 'array'),
  content_hash TEXT NOT NULL CHECK (BTRIM(content_hash) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, embedding_model, content_hash)
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_retrieval_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL CHECK (BTRIM(profile_key) <> ''),
  query TEXT NOT NULL CHECK (BTRIM(query) <> ''),
  intent TEXT,
  stage TEXT,
  include_images BOOLEAN NOT NULL DEFAULT FALSE,
  portal_safe BOOLEAN NOT NULL DEFAULT FALSE,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(filters) = 'object'),
  result_card_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  result_chunk_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  result_asset_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  score_metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(score_metadata) = 'object'),
  context_chars INTEGER NOT NULL DEFAULT 0 CHECK (context_chars >= 0),
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'empty', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_cash_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end DATE,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_margin NUMERIC(8,4),
  marketing_spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  sales_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  operational_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  new_customers INTEGER NOT NULL DEFAULT 0 CHECK (new_customers >= 0),
  average_ticket NUMERIC(14,2) NOT NULL DEFAULT 0,
  ltv NUMERIC(14,2) NOT NULL DEFAULT 0,
  cac NUMERIC(14,2),
  roas NUMERIC(14,4),
  mroi NUMERIC(14,4),
  cash_priority TEXT NOT NULL DEFAULT 'monitor' CHECK (cash_priority IN ('low','monitor','high_priority','critical')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_funnel_stage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entered_count INTEGER NOT NULL DEFAULT 0 CHECK (entered_count >= 0),
  converted_count INTEGER NOT NULL DEFAULT 0 CHECK (converted_count >= 0),
  lost_count INTEGER NOT NULL DEFAULT 0 CHECK (lost_count >= 0),
  average_time_in_stage_hours NUMERIC(12,2),
  follow_up_response_rate NUMERIC(8,4),
  conversion_rate NUMERIC(8,4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_channel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0 CHECK (leads >= 0),
  raised_hands INTEGER NOT NULL DEFAULT 0 CHECK (raised_hands >= 0),
  customers INTEGER NOT NULL DEFAULT 0 CHECK (customers >= 0),
  roas NUMERIC(14,4),
  mroi NUMERIC(14,4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_metrics_recovery_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('inactive_customer','lost_proposal','non_customer','ex_customer','stuck_opportunity')),
  stage_key TEXT,
  inactive_days INTEGER CHECK (inactive_days IS NULL OR inactive_days >= 0),
  average_ticket NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_recovery_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  recoverable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'monitor' CHECK (priority IN ('low','monitor','high_priority','critical')),
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','recovered','dismissed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_objection_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_playbook_action TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_objection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.yux_objection_categories(id) ON DELETE SET NULL,
  category_key TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  normalized_text TEXT NOT NULL DEFAULT '',
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  assistant_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  recommendation_id UUID,
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative','unknown')),
  source_channel TEXT,
  requires_follow_up BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_objection_playbook_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.yux_objection_categories(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  title TEXT NOT NULL,
  recommended_response TEXT NOT NULL DEFAULT '',
  recommended_action TEXT NOT NULL DEFAULT '',
  target_profiles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  visibility TEXT NOT NULL DEFAULT 'internal_only' CHECK (visibility IN ('internal_only','client_safe')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_offer_improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  repeated_count INTEGER NOT NULL DEFAULT 1 CHECK (repeated_count > 0),
  suggestion TEXT NOT NULL,
  target_surface TEXT NOT NULL DEFAULT 'offer' CHECK (target_surface IN ('offer','landing_page','proposal','script','content','campaign')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','implemented')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  source_profile_key TEXT NOT NULL,
  target_profile_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_output TEXT NOT NULL DEFAULT '',
  related_module TEXT,
  related_record_id UUID,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','critical')),
  context_summary TEXT NOT NULL DEFAULT '',
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','rejected','cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_agent_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  objective TEXT NOT NULL,
  audience TEXT NOT NULL,
  stage TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT NOT NULL,
  owner TEXT NOT NULL,
  metric TEXT NOT NULL,
  next_step TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  supporting_cards UUID[] NOT NULL DEFAULT '{}'::UUID[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','in_progress','completed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_outcome_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  recommendation_id UUID REFERENCES public.yux_strategy_agent_recommendations(id) ON DELETE SET NULL,
  handoff_id UUID REFERENCES public.yux_strategy_agent_handoffs(id) ON DELETE SET NULL,
  agent_run_id UUID REFERENCES public.marketing_agent_runs(id) ON DELETE SET NULL,
  ai_message_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE SET NULL,
  outcome_score NUMERIC(8,4),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  skill_key TEXT,
  card_id UUID REFERENCES public.yux_strategy_concept_cards(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  commercial_stage TEXT,
  outcome_type TEXT NOT NULL,
  outcome_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  confidence_before NUMERIC(5,4),
  human_feedback TEXT,
  aggregation_window TEXT NOT NULL DEFAULT 'daily',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_doctrines_status ON public.yux_strategy_doctrines(status, visibility);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_skills_status ON public.yux_strategy_skills(status, visibility);

CREATE INDEX IF NOT EXISTS idx_yux_skill_sections_skill_priority ON public.yux_strategy_skill_sections(skill_id, priority);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_profiles_key_status ON public.yux_strategy_agent_profiles(profile_key, status);

CREATE INDEX IF NOT EXISTS idx_yux_profile_skills_profile_priority ON public.yux_strategy_agent_profile_skills(profile_id, priority);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_bindings_type_status ON public.yux_strategy_agent_bindings(binding_type, status);

CREATE INDEX IF NOT EXISTS idx_yux_tool_policies_profile ON public.yux_strategy_profile_tool_policies(profile_id, tool_key);

CREATE INDEX IF NOT EXISTS idx_yux_action_policies_profile ON public.yux_strategy_profile_action_policies(profile_id, action_key);

CREATE INDEX IF NOT EXISTS idx_yux_stage_definitions_group_order ON public.yux_commercial_stage_definitions(stage_group, sort_order);

CREATE INDEX IF NOT EXISTS idx_yux_stage_events_org_lead_created ON public.yux_contact_stage_events(organization_id, lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_commercial_stage ON public.leads(organization_id, commercial_stage);

CREATE INDEX IF NOT EXISTS idx_leads_touch_next_action ON public.leads(organization_id, last_meaningful_touch_at, next_follow_up_at);

CREATE INDEX IF NOT EXISTS idx_conversations_strategy_role ON public.conversations(organization_id, conversation_current_role, conversation_stage);

CREATE INDEX IF NOT EXISTS idx_ai_assistants_strategy_role ON public.ai_assistants(organization_id, assistant_role, status, routing_priority);

CREATE INDEX IF NOT EXISTS idx_ai_routing_rules_assistant_status ON public.ai_assistant_routing_rules(assistant_id, status);

CREATE INDEX IF NOT EXISTS idx_yux_source_documents_scope_visibility ON public.yux_strategy_source_documents(source_scope, visibility, human_review_status);

CREATE INDEX IF NOT EXISTS idx_yux_source_documents_org_contract ON public.yux_strategy_source_documents(organization_id, contract_id);

CREATE INDEX IF NOT EXISTS idx_yux_source_pages_document_page ON public.yux_strategy_source_pages(document_id, page_number);

CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_document_section ON public.yux_strategy_source_chunks(document_id, section_key, chunk_index);

CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_tags ON public.yux_strategy_source_chunks USING gin(retrieval_tags);

CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_stage_tags ON public.yux_strategy_source_chunks USING gin(stage_tags);

CREATE INDEX IF NOT EXISTS idx_yux_source_chunks_profiles ON public.yux_strategy_source_chunks USING gin(allowed_agent_profile_keys);

CREATE INDEX IF NOT EXISTS idx_yux_source_assets_document_type ON public.yux_strategy_source_assets(document_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_yux_source_assets_profiles ON public.yux_strategy_source_assets USING gin(allowed_agent_profile_keys);

CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_category_visibility ON public.yux_strategy_concept_cards(category, visibility, human_review_status);

CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_tags ON public.yux_strategy_concept_cards USING gin(retrieval_tags);

CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_stage_tags ON public.yux_strategy_concept_cards USING gin(stage_tags);

CREATE INDEX IF NOT EXISTS idx_yux_concept_cards_profiles ON public.yux_strategy_concept_cards USING gin(allowed_agent_profile_keys);

CREATE INDEX IF NOT EXISTS idx_yux_card_embeddings_card_model ON public.yux_strategy_card_embeddings(card_id, embedding_model);

CREATE INDEX IF NOT EXISTS idx_yux_chunk_embeddings_chunk_model ON public.yux_strategy_chunk_embeddings(chunk_id, embedding_model);

CREATE INDEX IF NOT EXISTS idx_yux_asset_embeddings_asset_model ON public.yux_strategy_asset_embeddings(asset_id, embedding_model);

CREATE INDEX IF NOT EXISTS idx_yux_retrieval_queries_profile_created ON public.yux_strategy_retrieval_queries(profile_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_retrieval_queries_org_created ON public.yux_strategy_retrieval_queries(organization_id, created_at DESC);

-- Vector indexes omitted until pgvector is installed in the VPS Postgres image.

-- Vector indexes omitted until pgvector is installed in the VPS Postgres image.

-- Vector indexes omitted until pgvector is installed in the VPS Postgres image.

CREATE INDEX IF NOT EXISTS idx_yux_metrics_cash_org_date ON public.yux_metrics_cash_snapshots(organization_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_yux_metrics_funnel_org_stage ON public.yux_metrics_funnel_stage_snapshots(organization_id, stage_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_yux_metrics_channel_org_channel ON public.yux_metrics_channel_snapshots(organization_id, channel_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_yux_metrics_recovery_org_status ON public.yux_metrics_recovery_opportunities(organization_id, status, priority);

CREATE INDEX IF NOT EXISTS idx_yux_objection_events_org_category ON public.yux_objection_events(organization_id, category_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_objection_events_lead ON public.yux_objection_events(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_objection_playbook_category ON public.yux_objection_playbook_items(category_key, status, visibility);

CREATE INDEX IF NOT EXISTS idx_yux_offer_suggestions_org_status ON public.yux_offer_improvement_suggestions(organization_id, status, category_key);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_handoffs_target_status ON public.yux_strategy_agent_handoffs(target_profile_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_recommendations_profile_status ON public.yux_strategy_agent_recommendations(profile_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_outcomes_org_type ON public.yux_strategy_outcome_events(organization_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_learning_profile ON public.yux_strategy_learning_signals(profile_key, outcome_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.match_yux_strategy_concept_cards(
  query_embedding JSONB,
  match_profile_key TEXT,
  match_stage TEXT DEFAULT NULL,
  match_portal_safe BOOLEAN DEFAULT FALSE,
  match_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  card_id UUID,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::UUID AS card_id, NULL::DOUBLE PRECISION AS similarity
  WHERE FALSE
$$;

CREATE OR REPLACE FUNCTION public.match_yux_strategy_source_chunks(
  query_embedding JSONB,
  match_profile_key TEXT,
  match_stage TEXT DEFAULT NULL,
  match_portal_safe BOOLEAN DEFAULT FALSE,
  match_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  chunk_id UUID,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::UUID AS chunk_id, NULL::DOUBLE PRECISION AS similarity
  WHERE FALSE
$$;

CREATE TRIGGER update_yux_strategy_doctrines_updated_at BEFORE UPDATE ON public.yux_strategy_doctrines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_skills_updated_at BEFORE UPDATE ON public.yux_strategy_skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_skill_sections_updated_at BEFORE UPDATE ON public.yux_strategy_skill_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_agent_profiles_updated_at BEFORE UPDATE ON public.yux_strategy_agent_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_agent_bindings_updated_at BEFORE UPDATE ON public.yux_strategy_agent_bindings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_profile_tool_policies_updated_at BEFORE UPDATE ON public.yux_strategy_profile_tool_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_profile_action_policies_updated_at BEFORE UPDATE ON public.yux_strategy_profile_action_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_commercial_stage_definitions_updated_at BEFORE UPDATE ON public.yux_commercial_stage_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_assistant_routing_rules_updated_at BEFORE UPDATE ON public.ai_assistant_routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_source_documents_updated_at BEFORE UPDATE ON public.yux_strategy_source_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_source_pages_updated_at BEFORE UPDATE ON public.yux_strategy_source_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_source_chunks_updated_at BEFORE UPDATE ON public.yux_strategy_source_chunks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_source_assets_updated_at BEFORE UPDATE ON public.yux_strategy_source_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_concept_cards_updated_at BEFORE UPDATE ON public.yux_strategy_concept_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_metrics_cash_snapshots_updated_at BEFORE UPDATE ON public.yux_metrics_cash_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_metrics_recovery_opportunities_updated_at BEFORE UPDATE ON public.yux_metrics_recovery_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_objection_categories_updated_at BEFORE UPDATE ON public.yux_objection_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_objection_playbook_items_updated_at BEFORE UPDATE ON public.yux_objection_playbook_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_offer_suggestions_updated_at BEFORE UPDATE ON public.yux_offer_improvement_suggestions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_handoffs_updated_at BEFORE UPDATE ON public.yux_strategy_agent_handoffs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yux_strategy_recommendations_updated_at BEFORE UPDATE ON public.yux_strategy_agent_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.yux_strategy_doctrines (
  doctrine_key,
  name,
  description,
  source_scope,
  visibility,
  status,
  rules,
  metadata
)
VALUES (
  'yux_growth_doctrine_core',
  'Doutrina YUX Growth Core',
  'Regras operacionais internas para diagnosticar gargalos comerciais, priorizar caixa e orientar agentes YUX.',
  'internal',
  'internal_only',
  'active',
  jsonb_build_array(
    'Diagnosticar antes de automatizar.',
    'Nao recomendar aquisicao fria antes de avaliar base atual, follow-up, CRM, ticket, recorrencia e oportunidades perdidas.',
    'Separar lead frio, levantada de mao, oportunidade, cliente e ex-cliente.',
    'Toda recomendacao deve ter objetivo, publico, acao, canal, responsavel, metrica e proximo passo.',
    'CRM e centro de controle comercial, nao cadastro passivo.'
  ),
  jsonb_build_object('versionLabel', 'v1')
)
ON CONFLICT (doctrine_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    rules = EXCLUDED.rules,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

WITH doctrine AS (
  SELECT id FROM public.yux_strategy_doctrines WHERE doctrine_key = 'yux_growth_doctrine_core'
)
INSERT INTO public.yux_strategy_skills (
  doctrine_id,
  skill_key,
  name,
  description,
  global_rules,
  decision_rules,
  output_contract
)
SELECT doctrine.id, skill_key, name, description, global_rules, decision_rules, output_contract
FROM doctrine
CROSS JOIN (
  VALUES
    ('yux_growth_strategy_core', 'YUX Growth Strategy Core', 'Skill central de diagnostico, priorizacao e decisao comercial.', ARRAY['priorizar caixa antes de complexidade', 'sempre classificar estagio comercial']::TEXT[], jsonb_build_array('avaliar gargalo antes de recomendar canal'), jsonb_build_object('requiresStructuredRecommendation', true)),
    ('yux_stage_classification', 'Classificacao de Estagios Comerciais', 'Classifica contatos por maturidade, oportunidade e ciclo de vida.', ARRAY['lead frio nao e oportunidade', 'levantada de mao exige acao comercial individual']::TEXT[], jsonb_build_array('usar commercial_stage e lead_temperature'), jsonb_build_object('requiresStage', true)),
    ('yux_spin_diagnosis', 'SPIN e Diagnostico Comercial', 'Orienta perguntas de situacao, problema, implicacao e necessidade.', ARRAY['perguntar antes de apresentar solucao']::TEXT[], jsonb_build_array('qualificar antes de vender'), jsonb_build_object('requiresQuestions', true)),
    ('yux_crm_controller', 'CRM Controller', 'Monitora oportunidades, follow-ups, tarefas e dados comerciais.', ARRAY['CRM precisa ter proxima acao', 'lead parado e perda potencial']::TEXT[], jsonb_build_array('criar tarefa quando nao houver proximo passo'), jsonb_build_object('requiresNextAction', true)),
    ('yux_comercial_1_sdr', 'Comercial 1 SDR', 'Qualificacao, triagem, levantada de mao e handoff.', ARRAY['SDR qualifica e agenda; nao promete entrega complexa']::TEXT[], jsonb_build_array('transferir para humano quando houver proposta ou objecao sensivel'), jsonb_build_object('requiresHandoffRules', true)),
    ('yux_comercial_2_customer_growth', 'Comercial 2 Customer Growth', 'Recorrencia, carteira, segunda venda, LTV e churn.', ARRAY['base atual vem antes de lead frio']::TEXT[], jsonb_build_array('avaliar cliente ativo, inativo e recorrente'), jsonb_build_object('requiresLifecycleStage', true)),
    ('yux_revenue_recovery', 'Revenue Recovery', 'Recuperacao de ex-clientes, nao-clientes e propostas perdidas.', ARRAY['reativar oportunidades perdidas antes de aumentar CAC']::TEXT[], jsonb_build_array('priorizar valor recuperavel'), jsonb_build_object('requiresRecoveryValue', true)),
    ('yux_offer_conversion', 'Offer And Conversion', 'Oferta, copy, landing page, proposta, objeÃ§Ãµes e conversao.', ARRAY['objecoes alimentam oferta e copy']::TEXT[], jsonb_build_array('mapear objecao para melhoria de oferta'), jsonb_build_object('requiresObjectionMap', true)),
    ('yux_objection_intelligence', 'Objection Intelligence', 'Registra e transforma objeÃ§Ãµes em playbooks, conteudos e ajustes comerciais.', ARRAY['objecao repetida vira melhoria de playbook']::TEXT[], jsonb_build_array('registrar categoria e acao recomendada'), jsonb_build_object('requiresObjectionCategory', true)),
    ('yux_marketing_by_funnel_stage', 'Marketing Por Estagio Do Funil', 'Cria conteudo e campanha por publico, consciencia e etapa comercial.', ARRAY['conteudo tem funcao comercial']::TEXT[], jsonb_build_array('alinhar canal e etapa'), jsonb_build_object('requiresFunnelStage', true)),
    ('yux_referral_growth', 'Referral Growth', 'IndicaÃ§Ãµes, prova social e crescimento por clientes promotores.', ARRAY['pedir indicacao no momento correto']::TEXT[], jsonb_build_array('verificar satisfacao antes do pedido'), jsonb_build_object('requiresSatisfactionSignal', true)),
    ('yux_metrics_cash_mroi', 'Metrics Cash And MROI', 'CAC, ticket, LTV, MROI, margem e decisao de investimento.', ARRAY['avaliar lucro e caixa, nao apenas lead']::TEXT[], jsonb_build_array('comparar CAC, ticket, margem e LTV'), jsonb_build_object('requiresFinancialMetric', true)),
    ('yux_proposal_delivery_strategy', 'Proposal And Delivery Strategy', 'Proposta, escopo, implementacao e transicao para entrega.', ARRAY['proposta deve conectar diagnostico, acao e resultado esperado']::TEXT[], jsonb_build_array('explicitar escopo e proximo passo'), jsonb_build_object('requiresProposalNextStep', true))
) AS seed(skill_key, name, description, global_rules, decision_rules, output_contract)
ON CONFLICT (skill_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    global_rules = EXCLUDED.global_rules,
    decision_rules = EXCLUDED.decision_rules,
    output_contract = EXCLUDED.output_contract,
    updated_at = NOW();

INSERT INTO public.yux_strategy_agent_profiles (
  profile_key,
  name,
  description,
  purpose,
  allowed_modules,
  allowed_tools,
  forbidden_actions,
  requires_human_approval_for,
  default_context_policy,
  approval_policy,
  output_schema,
  max_context_chars,
  max_cards,
  max_chunks
)
VALUES
  ('growth_strategist', 'Growth Strategist', 'Diagnostico, priorizacao e roadmap comercial YUX.', 'Analisar gargalos e recomendar sequencia de implantacao.', ARRAY['crm','omnichannel','marketing_studio','campaigns','landing_pages','reports','automations','proposals']::TEXT[], ARRAY['strategy_retrieval','crm_read','metrics_read','recommendation_create']::TEXT[], ARRAY['send_external_message','activate_campaign','change_ads_budget']::TEXT[], ARRAY['client_visible_recommendation','proposal_scope_change']::TEXT[], jsonb_build_object('breadth','broad','includeMetrics',true), jsonb_build_object('humanRequired',true), jsonb_build_object('required', ARRAY['objective','audience','stage','action','channel','owner','metric','next_step']::TEXT[]), 9000, 12, 8),
  ('crm_controller', 'CRM Controller', 'Controle operacional de pipeline, follow-up e disciplina comercial.', 'Detectar leads parados, falta de proxima acao e inconsistencias de etapa.', ARRAY['crm','omnichannel','proposals','reports','automations']::TEXT[], ARRAY['strategy_retrieval','crm_read','task_create','recommendation_create']::TEXT[], ARRAY['activate_campaign','publish_content','promise_discount']::TEXT[], ARRAY['send_message','change_stage']::TEXT[], jsonb_build_object('breadth','focused','includeCrm',true), jsonb_build_object('humanRequiredForExternalMessage',true), jsonb_build_object('required', ARRAY['lead_id','action','owner','due_at','metric']::TEXT[]), 6500, 8, 4),
  ('ai_sdr_comercial_1', 'AI SDR / Comercial 1', 'Qualificacao, SPIN, levantada de mao e handoff.', 'Atender e qualificar leads sem tratar lead frio como oportunidade.', ARRAY['omnichannel','crm']::TEXT[], ARRAY['strategy_retrieval','conversation_read','crm_update_suggestion','handoff_create']::TEXT[], ARRAY['activate_campaign','promise_discount','send_contractual_commitment']::TEXT[], ARRAY['send_external_message','handoff_to_human']::TEXT[], jsonb_build_object('breadth','narrow','includeSpin',true), jsonb_build_object('humanRequiredForSensitive',true), jsonb_build_object('required', ARRAY['question','stage','next_step','handoff_required']::TEXT[]), 4500, 6, 3),
  ('ai_closer', 'AI Closer', 'Follow-up de proposta e tratamento de objecoes comerciais.', 'Ajudar fechamento sem prometer desconto ou alterar termos sem aprovacao.', ARRAY['omnichannel','crm','proposals']::TEXT[], ARRAY['strategy_retrieval','conversation_read','proposal_read','objection_create','handoff_create']::TEXT[], ARRAY['promise_discount_without_approved_offer','change_proposal_terms_without_approval','activate_campaign']::TEXT[], ARRAY['send_external_message','proposal_term_change']::TEXT[], jsonb_build_object('breadth','focused','includeObjections',true), jsonb_build_object('humanRequiredForDiscount',true), jsonb_build_object('required', ARRAY['objection','response_angle','next_step','approval_needed']::TEXT[]), 5500, 7, 4),
  ('support_assistant', 'Support Assistant', 'Atendimento receptivo, suporte e triagem.', 'Resolver duvidas e encaminhar suporte sem pressao comercial indevida.', ARRAY['omnichannel','support','knowledge_base']::TEXT[], ARRAY['knowledge_search','conversation_read','ticket_create','handoff_create']::TEXT[], ARRAY['send_sales_pressure_message','promise_discount','activate_campaign']::TEXT[], ARRAY['upsell_message','sensitive_support_answer']::TEXT[], jsonb_build_object('breadth','support','excludeSalesPressure',true), jsonb_build_object('humanRequiredForSensitive',true), jsonb_build_object('required', ARRAY['answer','ticket_needed','handoff_required']::TEXT[]), 4000, 4, 4),
  ('customer_growth_comercial_2', 'Comercial 2 / Customer Growth', 'Carteira, recorrencia, upsell, churn e LTV.', 'Expandir valor de clientes atuais e reduzir perda pos-venda.', ARRAY['crm','omnichannel','reports','automations','finance']::TEXT[], ARRAY['strategy_retrieval','crm_read','metrics_read','recommendation_create']::TEXT[], ARRAY['activate_campaign','change_financial_record']::TEXT[], ARRAY['upsell_message','reactivation_message']::TEXT[], jsonb_build_object('breadth','lifecycle','includeLtv',true), jsonb_build_object('humanRequiredForCommercialMessage',true), jsonb_build_object('required', ARRAY['customer_stage','action','metric','next_step']::TEXT[]), 6500, 8, 4),
  ('revenue_recovery', 'Revenue Recovery', 'Recuperacao de nao-clientes, ex-clientes e propostas perdidas.', 'Priorizar caixa escondido em oportunidades perdidas e clientes inativos.', ARRAY['crm','omnichannel','proposals','reports','automations']::TEXT[], ARRAY['strategy_retrieval','crm_read','proposal_read','metrics_read','recommendation_create']::TEXT[], ARRAY['activate_campaign','promise_discount_without_approved_offer']::TEXT[], ARRAY['recovery_message','offer_change']::TEXT[], jsonb_build_object('breadth','recovery','includeLostReasons',true), jsonb_build_object('humanRequiredForRecoveryOffer',true), jsonb_build_object('required', ARRAY['segment','recoverable_value','action','next_step']::TEXT[]), 6500, 8, 5),
  ('offer_conversion', 'Offer And Conversion', 'Oferta, copy, proposta, landing pages e conversao.', 'Transformar objecoes e sinais em melhoria de oferta e mensagem.', ARRAY['marketing_studio','landing_pages','campaigns','crm','proposals']::TEXT[], ARRAY['strategy_retrieval','objection_read','content_recommendation','recommendation_create']::TEXT[], ARRAY['publish_without_approval','activate_paid_campaign_without_approval']::TEXT[], ARRAY['client_visible_copy','offer_change']::TEXT[], jsonb_build_object('breadth','conversion','includeObjections',true), jsonb_build_object('humanRequiredForPublishing',true), jsonb_build_object('required', ARRAY['objection','copy_angle','asset','metric']::TEXT[]), 6500, 8, 4),
  ('marketing_strategist', 'Marketing Strategist', 'Orquestrador estrategico dos subagentes do Marketing Studio.', 'Direcionar pesquisa, curadoria, conteudo, criativos e performance por etapa comercial.', ARRAY['marketing_studio','campaigns','landing_pages','crm','reports']::TEXT[], ARRAY['strategy_retrieval','rag_search','jina_reader','jina_search','content_create','campaign_draft']::TEXT[], ARRAY['publish_without_approval','activate_paid_campaign_without_approval']::TEXT[], ARRAY['publish_content','paid_campaign_draft','client_visible_content']::TEXT[], jsonb_build_object('breadth','marketing','includeFunnelStage',true), jsonb_build_object('humanRequiredForPublishing',true), jsonb_build_object('required', ARRAY['funnel_stage','content_job','channel','metric']::TEXT[]), 7000, 8, 5),
  ('referral_growth', 'Referral Growth', 'Indicacoes, depoimentos e prova social.', 'Identificar clientes promotores e gerar indicacoes com timing adequado.', ARRAY['crm','omnichannel','marketing_studio']::TEXT[], ARRAY['strategy_retrieval','crm_read','recommendation_create']::TEXT[], ARRAY['send_message_without_satisfaction_signal']::TEXT[], ARRAY['referral_request_message']::TEXT[], jsonb_build_object('breadth','referral','includeSatisfaction',true), jsonb_build_object('humanRequiredForReferralAsk',true), jsonb_build_object('required', ARRAY['promoter_signal','ask_timing','next_step']::TEXT[]), 4500, 5, 3),
  ('metrics_cash_mroi', 'Metrics And Cash', 'CAC, LTV, MROI, margem, funil e decisao de investimento.', 'Orientar investimento e prioridade por caixa, lucro e eficiencia comercial.', ARRAY['reports','campaigns','crm','finance']::TEXT[], ARRAY['metrics_read','strategy_retrieval','recommendation_create']::TEXT[], ARRAY['change_ads_budget_without_approval','alter_financial_records']::TEXT[], ARRAY['budget_recommendation','client_visible_financial_claim']::TEXT[], jsonb_build_object('breadth','metrics','includeFinancials',true), jsonb_build_object('humanRequiredForBudgetChange',true), jsonb_build_object('required', ARRAY['metric','finding','risk','recommendation']::TEXT[]), 7000, 6, 6),
  ('proposal_delivery', 'Proposal And Delivery', 'Propostas, escopo, implantacao e transicao para entrega.', 'Gerar recomendacoes de escopo e transicao com base no diagnostico.', ARRAY['proposals','projects','crm','reports']::TEXT[], ARRAY['strategy_retrieval','proposal_read','project_plan_suggestion','recommendation_create']::TEXT[], ARRAY['change_proposal_terms_without_approval','promise_delivery_without_capacity_check']::TEXT[], ARRAY['proposal_scope_change','delivery_commitment']::TEXT[], jsonb_build_object('breadth','proposal','includeDeliveryRisk',true), jsonb_build_object('humanRequiredForCommitment',true), jsonb_build_object('required', ARRAY['scope','risk','delivery_step','approval_needed']::TEXT[]), 6000, 6, 4)
ON CONFLICT (profile_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    purpose = EXCLUDED.purpose,
    allowed_modules = EXCLUDED.allowed_modules,
    allowed_tools = EXCLUDED.allowed_tools,
    forbidden_actions = EXCLUDED.forbidden_actions,
    requires_human_approval_for = EXCLUDED.requires_human_approval_for,
    default_context_policy = EXCLUDED.default_context_policy,
    approval_policy = EXCLUDED.approval_policy,
    output_schema = EXCLUDED.output_schema,
    max_context_chars = EXCLUDED.max_context_chars,
    max_cards = EXCLUDED.max_cards,
    max_chunks = EXCLUDED.max_chunks,
    updated_at = NOW();

INSERT INTO public.yux_commercial_stage_definitions (
  stage_key,
  name,
  description,
  stage_group,
  default_temperature,
  sort_order,
  is_terminal
)
VALUES
  ('anonymous', 'Anonimo', 'Publico ainda nao identificado.', 'audience', 'cold', 10, FALSE),
  ('follower', 'Seguidor', 'Publico identificado em canal, ainda sem lead claro.', 'audience', 'cold', 20, FALSE),
  ('lead_cold', 'Lead frio', 'Contato capturado sem sinal comercial forte.', 'lead', 'cold', 30, FALSE),
  ('lead_warm', 'Lead morno', 'Contato com algum interesse ou interacao relevante.', 'lead', 'warm', 40, FALSE),
  ('raised_hand', 'Levantada de mao', 'Contato pediu conversa, proposta, agenda ou demonstrou intencao comercial.', 'opportunity', 'hot', 50, FALSE),
  ('qualified_opportunity', 'Oportunidade qualificada', 'Levantada de mao com fit, necessidade e proximo passo comercial.', 'opportunity', 'hot', 60, FALSE),
  ('almost_customer', 'Quase cliente', 'Proposta, negociacao ou fechamento em andamento.', 'opportunity', 'hot', 70, FALSE),
  ('non_customer', 'Nao-cliente', 'Contato que nao comprou apos tentativa comercial.', 'recovery', 'warm', 80, FALSE),
  ('first_purchase_customer', 'Cliente primeira compra', 'Cliente convertido com primeira compra/contrato.', 'customer', 'hot', 90, FALSE),
  ('recurring_customer', 'Cliente recorrente', 'Cliente ativo com recorrencia, recompra ou contrato continuo.', 'customer', 'hot', 100, FALSE),
  ('ex_customer', 'Ex-cliente', 'Cliente encerrado ou inativo por ciclo relevante.', 'recovery', 'warm', 110, FALSE),
  ('referral', 'Indicado', 'Contato vindo por indicacao.', 'lead', 'warm', 120, FALSE),
  ('bad_fit', 'Bad fit', 'Contato fora do perfil ou sem condicao de atendimento.', 'excluded', 'unknown', 130, TRUE)
ON CONFLICT (stage_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    stage_group = EXCLUDED.stage_group,
    default_temperature = EXCLUDED.default_temperature,
    sort_order = EXCLUDED.sort_order,
    is_terminal = EXCLUDED.is_terminal,
    updated_at = NOW();

INSERT INTO public.yux_objection_categories (category_key, name, description, default_playbook_action)
VALUES
  ('price', 'Preco', 'ObjeÃ§Ã£o relacionada a valor, orÃ§amento ou percepÃ§Ã£o de custo.', 'Reforcar valor percebido, prova e custo de inacao.'),
  ('timing', 'Timing', 'Lead diz que nÃ£o Ã© o momento certo.', 'Criar follow-up com gatilho temporal e implicacao.'),
  ('trust', 'ConfianÃ§a', 'Falta de confianÃ§a na empresa, prova ou promessa.', 'Adicionar prova social, cases e garantias operacionais.'),
  ('authority', 'Autoridade', 'Contato nao decide sozinho ou precisa validar com terceiros.', 'Mapear decisores e criar material de apoio.'),
  ('urgency', 'Urgencia', 'Lead nao percebe prioridade para agir agora.', 'Explicitar consequencia da inacao e proximo passo simples.'),
  ('product_fit', 'Fit de Produto', 'Duvida se a oferta resolve o caso especifico.', 'Refinar diagnostico e ajustar proposta/escopo.'),
  ('competitor', 'Concorrente', 'Comparacao com alternativa ou fornecedor atual.', 'Criar comparativo etico e destacar diferencial comprovavel.'),
  ('implementation_effort', 'Esforco de Implantacao', 'Medo de complexidade, tempo ou trabalho para implantar.', 'Reduzir friccao com roadmap e responsabilidade clara.'),
  ('unclear_value', 'Valor Incerto', 'Lead nao entendeu valor, ROI ou ganho esperado.', 'Reformular promessa, metricas e exemplos concretos.'),
  ('no_response', 'Sem Resposta', 'Silencio apos contato, proposta ou follow-up.', 'Acionar sequencia de retomada e pesquisa de motivo.')
ON CONFLICT (category_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    default_playbook_action = EXCLUDED.default_playbook_action,
    updated_at = NOW();

INSERT INTO public.yux_objection_playbook_items (category_key, title, recommended_response, recommended_action, target_profiles, visibility, status)
SELECT category_key,
       name || ' - resposta operacional',
       default_playbook_action,
       default_playbook_action,
       ARRAY['ai_closer','offer_conversion','marketing_strategist']::TEXT[],
       'internal_only',
       'active'
FROM public.yux_objection_categories
ON CONFLICT DO NOTHING;

WITH profiles AS (
  SELECT id, profile_key FROM public.yux_strategy_agent_profiles
),
skills AS (
  SELECT id, skill_key FROM public.yux_strategy_skills
),
profile_skill_map AS (
  SELECT * FROM (VALUES
    ('growth_strategist', 'yux_growth_strategy_core', 10),
    ('growth_strategist', 'yux_metrics_cash_mroi', 20),
    ('growth_strategist', 'yux_stage_classification', 30),
    ('crm_controller', 'yux_crm_controller', 10),
    ('crm_controller', 'yux_stage_classification', 20),
    ('crm_controller', 'yux_objection_intelligence', 30),
    ('ai_sdr_comercial_1', 'yux_comercial_1_sdr', 10),
    ('ai_sdr_comercial_1', 'yux_spin_diagnosis', 20),
    ('ai_sdr_comercial_1', 'yux_stage_classification', 30),
    ('ai_closer', 'yux_offer_conversion', 10),
    ('ai_closer', 'yux_objection_intelligence', 20),
    ('support_assistant', 'yux_stage_classification', 10),
    ('customer_growth_comercial_2', 'yux_comercial_2_customer_growth', 10),
    ('customer_growth_comercial_2', 'yux_metrics_cash_mroi', 20),
    ('revenue_recovery', 'yux_revenue_recovery', 10),
    ('revenue_recovery', 'yux_objection_intelligence', 20),
    ('offer_conversion', 'yux_offer_conversion', 10),
    ('offer_conversion', 'yux_objection_intelligence', 20),
    ('marketing_strategist', 'yux_marketing_by_funnel_stage', 10),
    ('marketing_strategist', 'yux_offer_conversion', 20),
    ('referral_growth', 'yux_referral_growth', 10),
    ('metrics_cash_mroi', 'yux_metrics_cash_mroi', 10),
    ('proposal_delivery', 'yux_proposal_delivery_strategy', 10)
  ) AS m(profile_key, skill_key, priority)
)
INSERT INTO public.yux_strategy_agent_profile_skills (profile_id, skill_id, priority, required)
SELECT p.id, s.id, m.priority, TRUE
FROM profile_skill_map m
JOIN profiles p ON p.profile_key = m.profile_key
JOIN skills s ON s.skill_key = m.skill_key
ON CONFLICT (profile_id, skill_id) DO UPDATE
SET priority = EXCLUDED.priority,
    required = EXCLUDED.required;

WITH profiles AS (
  SELECT id, profile_key FROM public.yux_strategy_agent_profiles
),
bindings AS (
  SELECT * FROM (VALUES
    ('content_radar', 'marketing_strategist'),
    ('strategic_curator', 'marketing_strategist'),
    ('content_strategist', 'marketing_strategist'),
    ('multichannel_writer', 'marketing_strategist'),
    ('brand_quality_reviewer', 'marketing_strategist'),
    ('campaign_strategist', 'marketing_strategist'),
    ('campaign_strategist', 'offer_conversion'),
    ('visual_creative_generator', 'marketing_strategist'),
    ('editorial_calendar_manager', 'marketing_strategist'),
    ('controlled_publisher', 'marketing_strategist'),
    ('performance_analyst', 'metrics_cash_mroi')
  ) AS b(marketing_agent_type, profile_key)
)
INSERT INTO public.yux_strategy_agent_bindings (profile_id, binding_type, marketing_agent_type, config)
SELECT p.id, 'marketing_agent_type', b.marketing_agent_type, jsonb_build_object('source', 'seed')
FROM bindings b
JOIN profiles p ON p.profile_key = b.profile_key
ON CONFLICT DO NOTHING;

WITH profile_actions AS (
  SELECT p.id AS profile_id, action_key, policy, reason
  FROM public.yux_strategy_agent_profiles p
  CROSS JOIN LATERAL (
    SELECT unnest(p.forbidden_actions) AS action_key, 'deny'::TEXT AS policy, 'Forbidden by strategy profile policy.'::TEXT AS reason
  ) denied
)
INSERT INTO public.yux_strategy_profile_action_policies (profile_id, action_key, policy, reason)
SELECT profile_id, action_key, policy, reason
FROM profile_actions
ON CONFLICT (profile_id, action_key) DO UPDATE
SET policy = EXCLUDED.policy,
    reason = EXCLUDED.reason,
    updated_at = NOW();


-- source: 20260612183708_yux_strategy_admin_chat.sql
-- Admin-only strategic chat for the internal YUX Growth Strategist.

CREATE TABLE IF NOT EXISTS public.yux_strategy_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.yux_strategy_agent_profiles(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL DEFAULT 'growth_strategist' CHECK (BTRIM(profile_key) <> ''),
  title TEXT NOT NULL DEFAULT 'Nova conversa estrategica' CHECK (BTRIM(title) <> ''),
  mode TEXT NOT NULL DEFAULT 'general' CHECK (mode IN ('general','initial_analysis','diagnostic_48h','service_plan','proposal','roadmap_30_60_90','do_not_do')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yux_strategy_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.yux_strategy_chat_sessions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL CHECK (BTRIM(content) <> ''),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed')),
  model_provider TEXT,
  model_name TEXT,
  routing_rule_id UUID REFERENCES public.model_routing_rules(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  raw_cost_estimate NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (raw_cost_estimate >= 0),
  safe_context JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_context) = 'object'),
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tool_results) = 'array'),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_chat_sessions_actor_created
  ON public.yux_strategy_chat_sessions(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_chat_sessions_scope
  ON public.yux_strategy_chat_sessions(organization_id, client_id, contract_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_yux_strategy_chat_messages_session_created
  ON public.yux_strategy_chat_messages(session_id, created_at);

DROP TRIGGER IF EXISTS update_yux_strategy_chat_sessions_updated_at ON public.yux_strategy_chat_sessions;

CREATE TRIGGER update_yux_strategy_chat_sessions_updated_at
  BEFORE UPDATE ON public.yux_strategy_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- source: 20260612184513_yux_strategy_growth_route_seed.sql
INSERT INTO public.model_routing_rules (
  agent_type,
  routing_tier,
  provider,
  model_name,
  fallback_model_name,
  max_input_tokens,
  max_output_tokens,
  temperature,
  max_cost_per_run,
  status
)
SELECT
  'growth_strategist',
  'default',
  'openrouter',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  16000,
  2200,
  0.35,
  0,
  'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.model_routing_rules
  WHERE agent_type = 'growth_strategist'
    AND routing_tier = 'default'
    AND status = 'active'
);


-- source: 20260613191046_yux_agent_harness_runtime.sql
-- YUX Agent Harness runtime: central event queue, execution trace,
-- autonomy policies, strategic workflow specs, subagent runs and
-- controlled active-learning governance.

CREATE TABLE IF NOT EXISTS public.agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  source_channel TEXT NOT NULL DEFAULT 'unknown' CHECK (BTRIM(source_channel) <> ''),
  event_type TEXT NOT NULL CHECK (BTRIM(event_type) <> ''),
  external_event_id TEXT,
  inbound_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  normalized_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(normalized_payload) = 'object'),
  content_text TEXT NOT NULL DEFAULT '',
  media_summary TEXT NOT NULL DEFAULT '',
  signature_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (signature_status IN ('not_checked','valid','invalid','missing')),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','debounced','queued','processing','processed','ignored','failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.agent_queue_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.agent_events(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  queue_name TEXT NOT NULL DEFAULT 'agent.default' CHECK (BTRIM(queue_name) <> ''),
  job_type TEXT NOT NULL CHECK (BTRIM(job_type) <> ''),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled','dead_letter')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  result_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(result_payload) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_autonomy_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE CASCADE,
  profile_key TEXT,
  channel TEXT,
  intent_key TEXT,
  stage_key TEXT,
  action_key TEXT,
  autonomy_mode TEXT NOT NULL DEFAULT 'suggestion' CHECK (autonomy_mode IN ('draft','suggestion','auto_send','approval_required','handoff','blocked')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  requires_business_hours BOOLEAN NOT NULL DEFAULT FALSE,
  max_auto_send_per_conversation INTEGER NOT NULL DEFAULT 0 CHECK (max_auto_send_per_conversation >= 0),
  confidence_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.75 CHECK (confidence_threshold BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategy_workflow_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL CHECK (BTRIM(workflow_key) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT NOT NULL DEFAULT '',
  profile_key TEXT NOT NULL DEFAULT 'growth_strategist',
  workflow_type TEXT NOT NULL DEFAULT 'strategic' CHECK (workflow_type IN ('whatsapp','strategic','retrieval','evaluation','learning')),
  trigger_modes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  planner_profile_key TEXT NOT NULL DEFAULT 'growth_strategist',
  node_spec JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(node_spec) = 'object'),
  subagent_specs JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(subagent_specs) = 'array'),
  verifier_spec JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(verifier_spec) = 'object'),
  synthesis_spec JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(synthesis_spec) = 'object'),
  max_subagents INTEGER NOT NULL DEFAULT 4 CHECK (max_subagents >= 0),
  max_retries_per_node INTEGER NOT NULL DEFAULT 1 CHECK (max_retries_per_node >= 0),
  max_cost_per_run NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_run >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_key, version)
);

CREATE TABLE IF NOT EXISTS public.agent_execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.agent_events(id) ON DELETE SET NULL,
  queue_job_id UUID REFERENCES public.agent_queue_jobs(id) ON DELETE SET NULL,
  workflow_spec_id UUID REFERENCES public.strategy_workflow_specs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ai_message_run_id UUID REFERENCES public.ai_message_runs(id) ON DELETE SET NULL,
  strategy_chat_session_id UUID REFERENCES public.yux_strategy_chat_sessions(id) ON DELETE SET NULL,
  run_source TEXT NOT NULL DEFAULT 'runtime' CHECK (run_source IN ('whatsapp','strategy_admin','marketing_studio','scheduled','runtime','test')),
  profile_key TEXT NOT NULL,
  assistant_id UUID REFERENCES public.ai_assistants(id) ON DELETE SET NULL,
  agent_role TEXT,
  workflow_key TEXT,
  autonomy_mode TEXT NOT NULL DEFAULT 'suggestion' CHECK (autonomy_mode IN ('draft','suggestion','auto_send','approval_required','handoff','blocked')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting_approval','succeeded','failed','cancelled','blocked','retried')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  model_provider TEXT,
  model_name TEXT,
  fallback_model_name TEXT,
  routing_rule_id UUID REFERENCES public.model_routing_rules(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  decision_summary TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_execution_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  parent_step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  step_key TEXT NOT NULL CHECK (BTRIM(step_key) <> ''),
  step_type TEXT NOT NULL CHECK (step_type IN ('ingest','debounce','classify','retrieval','planner','agent','subagent','tool','verifier','global_evaluator','synthesizer','policy','dispatch','learning')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','retried','skipped')),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  model_provider TEXT,
  model_name TEXT,
  prompt_hash TEXT,
  context_hash TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(input_payload) = 'object'),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  decision JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(decision) = 'object'),
  warnings TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_context_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  profile_key TEXT NOT NULL,
  context_kind TEXT NOT NULL DEFAULT 'runtime' CHECK (context_kind IN ('runtime','rag','crm','conversation','metrics','workflow','subagent')),
  safe_context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(safe_context) = 'object'),
  card_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  chunk_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  asset_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  context_hash TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0 CHECK (token_estimate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  verifier_key TEXT NOT NULL CHECK (BTRIM(verifier_key) <> ''),
  subject_step_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passed','failed','warning','skipped')),
  score NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1),
  rubric JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rubric) = 'object'),
  findings JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(findings) = 'array'),
  follow_up_prompt TEXT NOT NULL DEFAULT '',
  retry_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategy_subagent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_execution_runs(id) ON DELETE CASCADE,
  planner_step_id UUID REFERENCES public.agent_execution_steps(id) ON DELETE SET NULL,
  subagent_key TEXT NOT NULL CHECK (BTRIM(subagent_key) <> ''),
  profile_key TEXT NOT NULL,
  objective TEXT NOT NULL,
  context_summary TEXT NOT NULL DEFAULT '',
  allowed_tools TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  rubric JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rubric) = 'object'),
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts > 0),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  output_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(output_payload) = 'object'),
  verification_result_id UUID REFERENCES public.agent_verification_results(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  outcome_type TEXT NOT NULL CHECK (BTRIM(outcome_type) <> ''),
  outcome_direction TEXT NOT NULL DEFAULT 'neutral' CHECK (outcome_direction IN ('positive','neutral','negative','unknown')),
  outcome_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  observed_value NUMERIC(14,2),
  attribution_window TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  outcome_id UUID REFERENCES public.agent_outcomes(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (BTRIM(signal_type) <> ''),
  target_type TEXT NOT NULL CHECK (target_type IN ('concept_card','chunk','playbook','prompt','model_route','autonomy_policy','workflow','subagent','offer','script')),
  target_id TEXT,
  signal_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object'),
  aggregation_window TEXT NOT NULL DEFAULT 'event',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_improvement_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('concept_card','playbook','prompt','model_route','autonomy_policy','workflow','subagent','rag_rerank')),
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  rationale TEXT NOT NULL DEFAULT '',
  target_type TEXT,
  target_id TEXT,
  proposed_change JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(proposed_change) = 'object'),
  baseline_metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(baseline_metrics) = 'object'),
  candidate_metrics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(candidate_metrics) = 'object'),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','shadow_testing','approved','rejected','promoted','rolled_back','archived')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  created_by_run_id UUID REFERENCES public.agent_execution_runs(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_shadow_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES public.agent_improvement_recommendations(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  experiment_key TEXT NOT NULL CHECK (BTRIM(experiment_key) <> ''),
  baseline_version TEXT NOT NULL DEFAULT 'current',
  candidate_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('draft','running','completed','failed','cancelled')),
  sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  success_metric TEXT NOT NULL DEFAULT 'quality_score',
  baseline_score NUMERIC(8,4),
  candidate_score NUMERIC(8,4),
  result_summary TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_org_status_created ON public.agent_events(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_conversation_created ON public.agent_events(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_queue_jobs_status_available ON public.agent_queue_jobs(status, available_at, priority);

CREATE INDEX IF NOT EXISTS idx_agent_queue_jobs_conversation ON public.agent_queue_jobs(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_autonomy_scope ON public.agent_autonomy_policies(organization_id, client_id, assistant_id, profile_key, status);

CREATE INDEX IF NOT EXISTS idx_strategy_workflow_specs_key_status ON public.strategy_workflow_specs(workflow_key, status, version DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_org_status_created ON public.agent_execution_runs(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation_created ON public.agent_execution_runs(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_profile_status ON public.agent_execution_runs(profile_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run_created ON public.agent_execution_steps(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_steps_type_status ON public.agent_execution_steps(step_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_context_run_kind ON public.agent_context_snapshots(run_id, context_kind);

CREATE INDEX IF NOT EXISTS idx_agent_verification_run_status ON public.agent_verification_results(run_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_subagent_runs_run_status ON public.strategy_subagent_runs(run_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_outcomes_org_type ON public.agent_outcomes(organization_id, outcome_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_learning_profile_target ON public.agent_learning_signals(profile_key, target_type, signal_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_improvements_status_risk ON public.agent_improvement_recommendations(status, risk_level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_shadow_recommendation_status ON public.agent_shadow_experiments(recommendation_id, status);

CREATE TRIGGER update_agent_queue_jobs_updated_at BEFORE UPDATE ON public.agent_queue_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_autonomy_policies_updated_at BEFORE UPDATE ON public.agent_autonomy_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_strategy_workflow_specs_updated_at BEFORE UPDATE ON public.strategy_workflow_specs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_execution_runs_updated_at BEFORE UPDATE ON public.agent_execution_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_improvement_recommendations_updated_at BEFORE UPDATE ON public.agent_improvement_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_shadow_experiments_updated_at BEFORE UPDATE ON public.agent_shadow_experiments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.strategy_workflow_specs (
  workflow_key,
  name,
  description,
  profile_key,
  workflow_type,
  trigger_modes,
  node_spec,
  subagent_specs,
  verifier_spec,
  synthesis_spec,
  max_subagents,
  max_retries_per_node,
  version
)
VALUES
  (
    'diagnostic_48h',
    'Diagnostico 48h',
    'Workflow estrategico para diagnostico rapido de gargalos, caixa, CRM, oferta e proximos passos.',
    'growth_strategist',
    'strategic',
    ARRAY['strategy_admin','manual'],
    jsonb_build_object('planner','growth_strategist','retrieval','strategy_rag','evaluator','risk_auditor'),
    jsonb_build_array(
      jsonb_build_object('key','crm_pipeline_analyst','profile_key','crm_controller','objective','Avaliar funil, follow-up e oportunidades paradas.'),
      jsonb_build_object('key','cash_metrics_analyst','profile_key','metrics_cash_mroi','objective','Avaliar caixa, CAC, ticket, LTV e riscos financeiros.'),
      jsonb_build_object('key','offer_conversion_analyst','profile_key','offer_conversion','objective','Avaliar oferta, objecoes e ambiente de conversao.'),
      jsonb_build_object('key','risk_auditor','profile_key','growth_strategist','objective','Validar riscos, premissas e o que nao fazer.')
    ),
    jsonb_build_object('minimum_score',0.75,'retry_on_fail',true,'required_fields',jsonb_build_array('objective','action','owner','metric','next_step')),
    jsonb_build_object('format','consultative_plan','include_risks',true,'include_30_60_90',false),
    4,
    1,
    1
  ),
  (
    'proposal_consultative',
    'Proposta Consultiva',
    'Workflow para transformar diagnostico em escopo, fases, entregaveis, riscos e proposta YUX.',
    'proposal_delivery',
    'strategic',
    ARRAY['strategy_admin','manual'],
    jsonb_build_object('planner','proposal_delivery','retrieval','strategy_rag','evaluator','risk_auditor'),
    jsonb_build_array(
      jsonb_build_object('key','proposal_scope_analyst','profile_key','proposal_delivery','objective','Montar escopo e fases com premissas claras.'),
      jsonb_build_object('key','cash_metrics_analyst','profile_key','metrics_cash_mroi','objective','Validar impacto financeiro e prioridade por caixa.'),
      jsonb_build_object('key','risk_auditor','profile_key','growth_strategist','objective','Auditar riscos comerciais e de entrega.')
    ),
    jsonb_build_object('minimum_score',0.8,'retry_on_fail',true,'required_fields',jsonb_build_array('scope','risk','delivery_step','approval_needed')),
    jsonb_build_object('format','proposal_outline','include_assumptions',true),
    3,
    1,
    1
  ),
  (
    'whatsapp_conversation_turn',
    'Turno Conversacional WhatsApp',
    'Workflow de conversa para classificar, recuperar contexto, gerar resposta e aplicar policy de autonomia.',
    'ai_sdr_comercial_1',
    'whatsapp',
    ARRAY['whatsapp','omnichannel'],
    jsonb_build_object('classify','conversation_classifier','retrieval','strategy_rag','policy','autonomy_policy'),
    jsonb_build_array(),
    jsonb_build_object('minimum_score',0.7,'retry_on_fail',false,'required_fields',jsonb_build_array('message','next_step','handoff_required')),
    jsonb_build_object('format','conversation_reply','include_policy_decision',true),
    0,
    0,
    1
  )
ON CONFLICT (workflow_key, version) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    node_spec = EXCLUDED.node_spec,
    subagent_specs = EXCLUDED.subagent_specs,
    verifier_spec = EXCLUDED.verifier_spec,
    synthesis_spec = EXCLUDED.synthesis_spec,
    updated_at = NOW();

INSERT INTO public.agent_autonomy_policies (
  profile_key,
  channel,
  action_key,
  autonomy_mode,
  risk_level,
  confidence_threshold,
  config
)
VALUES
  ('ai_sdr_comercial_1', 'whatsapp', 'send_external_message', 'suggestion', 'medium', 0.75, jsonb_build_object('defaultPolicy', true)),
  ('ai_closer', 'whatsapp', 'send_external_message', 'approval_required', 'high', 0.85, jsonb_build_object('defaultPolicy', true)),
  ('support_assistant', 'whatsapp', 'send_external_message', 'suggestion', 'medium', 0.75, jsonb_build_object('defaultPolicy', true)),
  ('customer_growth_comercial_2', 'whatsapp', 'upsell_message', 'approval_required', 'high', 0.85, jsonb_build_object('defaultPolicy', true)),
  ('growth_strategist', 'strategy_admin', 'client_visible_recommendation', 'approval_required', 'high', 0.9, jsonb_build_object('defaultPolicy', true))
ON CONFLICT DO NOTHING;
