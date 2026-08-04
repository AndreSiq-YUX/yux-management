-- Aggregated CRM task center: lifecycle audit fields and filter indexes.
ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.lead_tasks
SET cancelled_at = updated_at
WHERE status = 'cancelled' AND cancelled_at IS NULL;

ALTER TABLE public.lead_tasks
  DROP CONSTRAINT IF EXISTS lead_tasks_cancellation_state;

ALTER TABLE public.lead_tasks
  ADD CONSTRAINT lead_tasks_cancellation_state CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_lead_tasks_org_status_due
  ON public.lead_tasks(organization_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_assigned_status_due
  ON public.lead_tasks(assigned_to, status, due_at)
  WHERE assigned_to IS NOT NULL;
