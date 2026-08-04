-- CRM pipeline management invariants and history lookup indexes.

WITH ranked_defaults AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY crm_instance_id
           ORDER BY updated_at DESC, created_at ASC, id ASC
         ) AS position
  FROM public.crm_pipelines
  WHERE crm_instance_id IS NOT NULL
    AND is_default = TRUE
    AND is_active = TRUE
)
UPDATE public.crm_pipelines target
SET is_default = FALSE,
    updated_at = NOW()
FROM ranked_defaults ranked
WHERE target.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_pipelines_one_default_per_instance
  ON public.crm_pipelines(crm_instance_id)
  WHERE crm_instance_id IS NOT NULL
    AND is_default = TRUE
    AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_changed
  ON public.lead_stage_history(lead_id, changed_at DESC);
