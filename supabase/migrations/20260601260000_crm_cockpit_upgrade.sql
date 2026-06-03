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

ALTER TABLE public.pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CRM members read pipeline templates" ON public.pipeline_templates
  FOR SELECT USING (
    organization_id IS NULL
    OR private.can_access_crm_organization(organization_id)
  );

CREATE POLICY "Internal users manage pipeline templates" ON public.pipeline_templates
  FOR ALL USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "CRM members read pipeline template stages" ON public.pipeline_template_stages
  FOR SELECT USING (EXISTS (
    SELECT 1
    FROM public.pipeline_templates pt
    WHERE pt.id = template_id
      AND (
        pt.organization_id IS NULL
        OR private.can_access_crm_organization(pt.organization_id)
      )
  ));

CREATE POLICY "Internal users manage pipeline template stages" ON public.pipeline_template_stages
  FOR ALL USING (private.is_internal_user())
  WITH CHECK (private.is_internal_user());

CREATE POLICY "CRM members manage lead custom fields" ON public.lead_custom_field_values
  FOR ALL USING (private.can_access_crm_lead(lead_id))
  WITH CHECK (private.can_access_crm_lead(lead_id));

CREATE POLICY "CRM members manage lead tasks" ON public.lead_tasks
  FOR ALL USING (private.can_access_crm_lead(lead_id))
  WITH CHECK (private.can_access_crm_lead(lead_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_template_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_custom_field_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tasks TO authenticated;

NOTIFY pgrst, 'reload schema';
