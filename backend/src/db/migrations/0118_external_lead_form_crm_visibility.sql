-- Keep leads accepted by public forms visible in the governed client CRM.
UPDATE public.leads target_lead
SET crm_instance_id = target_pipeline.crm_instance_id,
    assignment_state = COALESCE(
      target_lead.assignment_state,
      'in_queue'::public.crm_assignment_state
    ),
    assignment_mode = COALESCE(
      target_lead.assignment_mode,
      target_instance.default_assignment_mode
    ),
    updated_at = NOW()
FROM public.crm_pipelines target_pipeline
JOIN public.crm_instances target_instance
  ON target_instance.id = target_pipeline.crm_instance_id
WHERE target_lead.pipeline_id = target_pipeline.id
  AND target_lead.crm_instance_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.landing_page_form_submissions target_submission
    WHERE target_submission.lead_id = target_lead.id
  );
