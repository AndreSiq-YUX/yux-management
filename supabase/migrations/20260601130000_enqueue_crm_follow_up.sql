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

NOTIFY pgrst, 'reload schema';
