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

ALTER TABLE public.blueprint_pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_report_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_application_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage blueprint pipeline templates" ON public.blueprint_pipeline_templates
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint pipeline stages" ON public.blueprint_pipeline_stages
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint custom fields" ON public.blueprint_custom_fields
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint message templates" ON public.blueprint_message_templates
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint automation templates" ON public.blueprint_automation_templates
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint report presets" ON public.blueprint_report_presets
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());
CREATE POLICY "Internal users manage blueprint application runs" ON public.blueprint_application_runs
  FOR ALL USING (private.is_internal_user()) WITH CHECK (private.is_internal_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_pipeline_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_pipeline_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_custom_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_message_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_automation_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_report_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_application_runs TO authenticated;

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

NOTIFY pgrst, 'reload schema';
