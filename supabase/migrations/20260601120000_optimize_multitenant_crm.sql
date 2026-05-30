-- Index new CRM foreign keys and enable CRM in the demo machine-commercial contract.

CREATE INDEX IF NOT EXISTS idx_automation_executions_enrollment_id
  ON public.automation_executions(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_automation_executions_step_id
  ON public.automation_executions(step_id);
CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_sequence_id
  ON public.crm_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_to
  ON public.crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_enrollment_id
  ON public.crm_tasks(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_interactions_client_id
  ON public.interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_lead_id
  ON public.interactions(lead_id);

INSERT INTO public.contract_modules (contract_id, module_key, enabled)
SELECT c.id, 'crm', true
FROM public.contracts c
WHERE c.status = 'active'
  AND c.name = 'Contrato Maquina Comercial - Empresa ABC'
ON CONFLICT (contract_id, module_key) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

