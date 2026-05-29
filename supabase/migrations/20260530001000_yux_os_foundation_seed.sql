-- Idempotent YUX OS platform seed.

INSERT INTO public.organizations (id, name, slug, kind)
VALUES ('650e8400-e29b-41d4-a716-446655440001', 'YUX Solucoes em IA', 'yux', 'yux')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  updated_at = NOW();

INSERT INTO public.roles (key, name, scope)
VALUES
  ('yux_admin', 'YUX Admin', 'internal'),
  ('yux_manager', 'YUX Manager', 'internal'),
  ('client_admin', 'Client Admin', 'client'),
  ('client_member', 'Client Member', 'client')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  scope = EXCLUDED.scope,
  updated_at = NOW();

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('yux_admin', 'platform.manage'),
  ('yux_admin', 'clients.read'),
  ('yux_admin', 'clients.write'),
  ('yux_admin', 'crm.read'),
  ('yux_admin', 'crm.write'),
  ('yux_admin', 'leads.read'),
  ('yux_admin', 'leads.write'),
  ('yux_admin', 'projects.read'),
  ('yux_admin', 'projects.write'),
  ('yux_admin', 'deliveries.read'),
  ('yux_admin', 'deliveries.write'),
  ('yux_admin', 'approvals.read'),
  ('yux_admin', 'approvals.write'),
  ('yux_admin', 'proposals.read'),
  ('yux_admin', 'proposals.write'),
  ('yux_admin', 'campaigns.read'),
  ('yux_admin', 'campaigns.write'),
  ('yux_admin', 'reports.read'),
  ('yux_admin', 'reports.write'),
  ('yux_admin', 'automations.read'),
  ('yux_admin', 'automations.write'),
  ('yux_admin', 'support.read'),
  ('yux_admin', 'support.write'),
  ('yux_admin', 'finance.read'),
  ('yux_admin', 'finance.write'),
  ('yux_admin', 'blueprints.read'),
  ('yux_admin', 'blueprints.write'),
  ('yux_manager', 'clients.read'),
  ('yux_manager', 'clients.write'),
  ('yux_manager', 'crm.read'),
  ('yux_manager', 'crm.write'),
  ('yux_manager', 'leads.read'),
  ('yux_manager', 'leads.write'),
  ('yux_manager', 'projects.read'),
  ('yux_manager', 'projects.write'),
  ('yux_manager', 'deliveries.read'),
  ('yux_manager', 'deliveries.write'),
  ('yux_manager', 'approvals.read'),
  ('yux_manager', 'approvals.write'),
  ('yux_manager', 'proposals.read'),
  ('yux_manager', 'proposals.write'),
  ('yux_manager', 'campaigns.read'),
  ('yux_manager', 'campaigns.write'),
  ('yux_manager', 'reports.read'),
  ('yux_manager', 'reports.write'),
  ('yux_manager', 'automations.read'),
  ('yux_manager', 'automations.write'),
  ('yux_manager', 'support.read'),
  ('yux_manager', 'support.write'),
  ('yux_manager', 'finance.read'),
  ('yux_manager', 'finance.write'),
  ('yux_manager', 'blueprints.read'),
  ('client_admin', 'projects.read'),
  ('client_admin', 'approvals.read'),
  ('client_admin', 'approvals.write'),
  ('client_admin', 'campaigns.read'),
  ('client_admin', 'reports.read'),
  ('client_admin', 'support.read'),
  ('client_admin', 'support.write'),
  ('client_admin', 'finance.read'),
  ('client_member', 'projects.read'),
  ('client_member', 'approvals.read'),
  ('client_member', 'campaigns.read'),
  ('client_member', 'reports.read'),
  ('client_member', 'support.read')
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
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();

WITH package_map(package_key, module_key) AS (
  VALUES
    ('presenca_digital_ia', 'clients'),
    ('presenca_digital_ia', 'projects'),
    ('presenca_digital_ia', 'support'),
    ('presenca_digital_ia', 'whatsapp_ai'),
    ('presenca_digital_ia', 'bi_reports'),
    ('atendimento_inteligente', 'clients'),
    ('atendimento_inteligente', 'crm'),
    ('atendimento_inteligente', 'projects'),
    ('atendimento_inteligente', 'support'),
    ('atendimento_inteligente', 'whatsapp_ai'),
    ('atendimento_inteligente', 'bi_reports'),
    ('maquina_comercial', 'clients'),
    ('maquina_comercial', 'crm'),
    ('maquina_comercial', 'projects'),
    ('maquina_comercial', 'proposals'),
    ('maquina_comercial', 'whatsapp_ai'),
    ('maquina_comercial', 'campaigns'),
    ('maquina_comercial', 'bi_reports'),
    ('maquina_comercial', 'automations'),
    ('maquina_comercial', 'support'),
    ('operacao_inteligente', 'clients'),
    ('operacao_inteligente', 'projects'),
    ('operacao_inteligente', 'bi_reports'),
    ('operacao_inteligente', 'automations'),
    ('operacao_inteligente', 'support'),
    ('operacao_inteligente', 'finance'),
    ('software_sob_medida', 'clients'),
    ('software_sob_medida', 'crm'),
    ('software_sob_medida', 'projects'),
    ('software_sob_medida', 'proposals'),
    ('software_sob_medida', 'whatsapp_ai'),
    ('software_sob_medida', 'campaigns'),
    ('software_sob_medida', 'bi_reports'),
    ('software_sob_medida', 'automations'),
    ('software_sob_medida', 'support'),
    ('software_sob_medida', 'finance'),
    ('software_sob_medida', 'blueprints')
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
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  description = EXCLUDED.description,
  updated_at = NOW();

WITH blueprint_map(blueprint_key, module_key) AS (
  VALUES
    ('clinicas', 'clients'),
    ('clinicas', 'crm'),
    ('clinicas', 'projects'),
    ('clinicas', 'whatsapp_ai'),
    ('clinicas', 'campaigns'),
    ('clinicas', 'bi_reports'),
    ('clinicas', 'support'),
    ('imobiliarias', 'clients'),
    ('imobiliarias', 'crm'),
    ('imobiliarias', 'projects'),
    ('imobiliarias', 'proposals'),
    ('imobiliarias', 'whatsapp_ai'),
    ('imobiliarias', 'campaigns'),
    ('imobiliarias', 'bi_reports'),
    ('revendas_carro', 'clients'),
    ('revendas_carro', 'crm'),
    ('revendas_carro', 'proposals'),
    ('revendas_carro', 'whatsapp_ai'),
    ('revendas_carro', 'campaigns'),
    ('revendas_carro', 'bi_reports'),
    ('escolas', 'clients'),
    ('escolas', 'crm'),
    ('escolas', 'projects'),
    ('escolas', 'whatsapp_ai'),
    ('escolas', 'campaigns'),
    ('escolas', 'bi_reports'),
    ('ecommerce', 'clients'),
    ('ecommerce', 'crm'),
    ('ecommerce', 'projects'),
    ('ecommerce', 'campaigns'),
    ('ecommerce', 'bi_reports'),
    ('ecommerce', 'automations'),
    ('ecommerce', 'support'),
    ('agencias', 'clients'),
    ('agencias', 'crm'),
    ('agencias', 'projects'),
    ('agencias', 'proposals'),
    ('agencias', 'campaigns'),
    ('agencias', 'bi_reports'),
    ('agencias', 'support'),
    ('consultorias', 'clients'),
    ('consultorias', 'crm'),
    ('consultorias', 'projects'),
    ('consultorias', 'proposals'),
    ('consultorias', 'bi_reports'),
    ('consultorias', 'automations'),
    ('turismo', 'clients'),
    ('turismo', 'crm'),
    ('turismo', 'whatsapp_ai'),
    ('turismo', 'campaigns'),
    ('turismo', 'bi_reports'),
    ('turismo', 'support'),
    ('industria_b2b', 'clients'),
    ('industria_b2b', 'crm'),
    ('industria_b2b', 'projects'),
    ('industria_b2b', 'proposals'),
    ('industria_b2b', 'automations'),
    ('industria_b2b', 'bi_reports')
)
INSERT INTO public.blueprint_modules (blueprint_id, module_key)
SELECT b.id, bm.module_key
FROM blueprint_map bm
JOIN public.blueprints b ON b.key = bm.blueprint_key
ON CONFLICT (blueprint_id, module_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
