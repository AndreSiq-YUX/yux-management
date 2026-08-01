-- Reconcile CRM entitlement with its governed operational instance.
-- Enabling CRM creates a draft; a configured pipeline allows activation.

INSERT INTO public.crm_instances (
  organization_id,
  contract_id,
  status
)
SELECT
  target_organization.id,
  target_contract.id,
  'draft'
FROM public.contracts target_contract
JOIN public.contract_modules target_module
  ON target_module.contract_id = target_contract.id
 AND target_module.module_key = 'crm'
 AND target_module.enabled = TRUE
JOIN LATERAL (
  SELECT candidate.id
  FROM public.organizations candidate
  WHERE candidate.client_id = target_contract.client_id
    AND candidate.kind = 'client'
  ORDER BY candidate.created_at ASC
  LIMIT 1
) target_organization ON TRUE
WHERE target_contract.status = 'active'
ON CONFLICT (contract_id) DO NOTHING;

UPDATE public.crm_instances target_instance
SET status = 'active',
    updated_at = NOW()
FROM public.contracts target_contract
JOIN public.contract_modules target_module
  ON target_module.contract_id = target_contract.id
 AND target_module.module_key = 'crm'
 AND target_module.enabled = TRUE
WHERE target_instance.contract_id = target_contract.id
  AND target_contract.status = 'active'
  AND target_instance.status = 'draft'
  AND EXISTS (
    SELECT 1
    FROM public.crm_pipelines target_pipeline
    WHERE target_pipeline.crm_instance_id = target_instance.id
      AND target_pipeline.is_active = TRUE
  );

UPDATE public.crm_instances target_instance
SET status = 'paused',
    updated_at = NOW()
WHERE target_instance.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.contracts target_contract
    JOIN public.contract_modules target_module
      ON target_module.contract_id = target_contract.id
     AND target_module.module_key = 'crm'
     AND target_module.enabled = TRUE
    WHERE target_contract.id = target_instance.contract_id
      AND target_contract.status = 'active'
  );
