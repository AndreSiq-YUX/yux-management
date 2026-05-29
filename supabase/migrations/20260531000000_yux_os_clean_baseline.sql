-- YUX OS clean baseline for new Supabase projects.
-- This replaces the historical conflicting migration chain for fresh installs.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('ADMIN', 'MANAGER', 'CLIENT');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_modules ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users','clients','projects','project_phases','project_tasks','campaigns','leads',
    'interactions','system_config','organizations','roles','role_permissions','memberships',
    'platform_modules','packages','package_modules','contracts','contract_modules',
    'blueprints','blueprint_modules'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read %s" ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY "Authenticated users can read %s" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'')', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can write %s" ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY "Authenticated users can write %s" ON public.%I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', table_name, table_name);
  END LOOP;
END
$$;

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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

NOTIFY pgrst, 'reload schema';
