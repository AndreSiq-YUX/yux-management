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

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_access_crm_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.memberships m ON m.organization_id = o.id
      JOIN public.contracts c ON c.client_id = o.client_id AND c.status = 'active'
      JOIN public.contract_modules cm ON cm.contract_id = c.id AND cm.module_key = 'crm' AND cm.enabled
      WHERE o.id = target_organization_id
        AND o.kind = 'client'
        AND m.user_id = (SELECT auth.uid())
    );
$$;

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
GRANT EXECUTE ON FUNCTION private.can_access_crm_organization(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_crm_pipeline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_crm_lead(UUID) TO authenticated;

DROP POLICY IF EXISTS "Internal users can manage leads" ON public.leads;
CREATE POLICY "CRM organization members can manage leads" ON public.leads
  FOR ALL USING (private.can_access_crm_organization(organization_id))
  WITH CHECK (private.can_access_crm_organization(organization_id));

DROP POLICY IF EXISTS "Internal users can manage interactions" ON public.interactions;
CREATE POLICY "CRM organization members can manage interactions" ON public.interactions
  FOR ALL USING (private.can_access_crm_organization(organization_id))
  WITH CHECK (private.can_access_crm_organization(organization_id));

CREATE POLICY "CRM organization members can manage pipelines" ON public.crm_pipelines
  FOR ALL USING (private.can_access_crm_organization(organization_id))
  WITH CHECK (private.can_access_crm_organization(organization_id));
CREATE POLICY "CRM organization members can manage stages" ON public.crm_pipeline_stages
  FOR ALL USING (private.can_access_crm_pipeline(pipeline_id))
  WITH CHECK (private.can_access_crm_pipeline(pipeline_id));
CREATE POLICY "CRM organization members can manage sequences" ON public.crm_sequences
  FOR ALL USING (private.can_access_crm_organization(organization_id))
  WITH CHECK (private.can_access_crm_organization(organization_id));
CREATE POLICY "CRM organization members can manage sequence steps" ON public.crm_sequence_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.crm_sequences s
      WHERE s.id = sequence_id
        AND private.can_access_crm_organization(s.organization_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_sequences s
      WHERE s.id = sequence_id
        AND private.can_access_crm_organization(s.organization_id)
    )
  );
CREATE POLICY "CRM organization members can manage enrollments" ON public.crm_sequence_enrollments
  FOR ALL USING (private.can_access_crm_organization(organization_id))
  WITH CHECK (private.can_access_crm_organization(organization_id));
CREATE POLICY "CRM organization members can manage tasks" ON public.crm_tasks
  FOR ALL USING (private.can_access_crm_organization(organization_id))
  WITH CHECK (private.can_access_crm_organization(organization_id));
CREATE POLICY "CRM organization members can read executions" ON public.automation_executions
  FOR SELECT USING (private.can_access_crm_organization(organization_id));
CREATE POLICY "CRM organization members can create executions" ON public.automation_executions
  FOR INSERT WITH CHECK (private.can_access_crm_organization(organization_id));

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
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequence_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sequence_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT SELECT, INSERT ON public.automation_executions TO authenticated;

NOTIFY pgrst, 'reload schema';
