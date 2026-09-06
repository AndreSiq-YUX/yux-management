-- Stable identity for CRM sequence step scheduling. Existing duplicate history is
-- preserved: the oldest row becomes the canonical step execution and later rows
-- retain a distinct legacy identity.

ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS dispatch_identity TEXT;

WITH ranked AS (
  SELECT id, enrollment_id, step_id,
         ROW_NUMBER() OVER (
           PARTITION BY enrollment_id, step_id
           ORDER BY created_at ASC, id ASC
         ) AS sequence_rank
    FROM public.automation_executions
)
UPDATE public.automation_executions execution
   SET dispatch_identity = CASE
     WHEN ranked.enrollment_id IS NOT NULL AND ranked.step_id IS NOT NULL AND ranked.sequence_rank = 1
       THEN format('sequence:%s:step:%s', ranked.enrollment_id, ranked.step_id)
     ELSE format('legacy:%s', execution.id)
   END
  FROM ranked
 WHERE ranked.id = execution.id
   AND execution.dispatch_identity IS NULL;

ALTER TABLE public.automation_executions
  ALTER COLUMN dispatch_identity SET DEFAULT ('legacy:' || gen_random_uuid()::TEXT),
  ALTER COLUMN dispatch_identity SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_executions_dispatch_identity
  ON public.automation_executions(dispatch_identity);

-- Rehydrate still-pending executions created by the legacy trigger, which did
-- not copy step metadata such as template and consent evidence.
UPDATE public.automation_executions execution
   SET payload = jsonb_build_object('subject', step.subject, 'body', step.body)
                 || COALESCE(step.metadata, '{}'::jsonb)
                 || execution.payload
  FROM public.crm_sequence_steps step
 WHERE step.id = execution.step_id
   AND execution.status IN ('pending', 'failed');

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
  SELECT * INTO first_step
    FROM public.crm_sequence_steps
   WHERE sequence_id = NEW.sequence_id AND is_active
   ORDER BY order_index
   LIMIT 1;

  IF first_step.id IS NULL THEN RETURN NEW; END IF;

  execute_at := COALESCE(NEW.next_execution_at, NOW()) + make_interval(mins => first_step.delay_minutes);
  UPDATE public.crm_sequence_enrollments SET next_execution_at = execute_at WHERE id = NEW.id;

  INSERT INTO public.automation_executions (
    organization_id, lead_id, enrollment_id, step_id, action_type, payload,
    scheduled_at, dispatch_identity
  ) VALUES (
    NEW.organization_id, NEW.lead_id, NEW.id, first_step.id, first_step.action_type,
    jsonb_build_object('subject', first_step.subject, 'body', first_step.body)
      || COALESCE(first_step.metadata, '{}'::jsonb),
    execute_at, format('sequence:%s:step:%s', NEW.id, first_step.id)
  )
  ON CONFLICT (dispatch_identity) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_first_crm_sequence_step() FROM PUBLIC;
