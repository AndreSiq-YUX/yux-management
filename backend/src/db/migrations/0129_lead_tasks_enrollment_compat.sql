-- Preserve sequence lineage after consolidating legacy crm_tasks into lead_tasks.
ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS enrollment_id UUID
    REFERENCES public.crm_sequence_enrollments(id) ON DELETE SET NULL;

UPDATE public.lead_tasks target
SET enrollment_id = source.enrollment_id
FROM public.crm_tasks source
WHERE target.id = source.id
  AND target.enrollment_id IS NULL
  AND source.enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_tasks_enrollment_id
  ON public.lead_tasks(enrollment_id)
  WHERE enrollment_id IS NOT NULL;
