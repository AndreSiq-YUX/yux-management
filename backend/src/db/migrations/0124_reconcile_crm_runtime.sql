-- Reconcile the CRM runtime for workspaces created before crm_instances became
-- the source of truth for pipelines. This makes the first commercial screen
-- usable without asking an operator to repair legacy rows manually.

WITH eligible_contracts AS (
  SELECT DISTINCT ON (contract.id)
    contract.id AS contract_id,
    organization.id AS organization_id
  FROM public.contracts contract
  JOIN public.contract_modules module
    ON module.contract_id = contract.id
   AND module.module_key = 'crm'
   AND module.enabled = TRUE
  JOIN public.organizations organization
    ON organization.client_id = contract.client_id
   AND organization.kind = 'client'
  WHERE contract.status = 'active'
  ORDER BY contract.id, organization.created_at ASC
)
INSERT INTO public.crm_instances (organization_id, contract_id, status)
SELECT contract_id, organization_id, 'draft'
FROM eligible_contracts
ON CONFLICT (contract_id) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    updated_at = NOW();

WITH runtime_instances AS (
  SELECT DISTINCT ON (instance.organization_id)
    instance.id,
    instance.organization_id
  FROM public.crm_instances instance
  JOIN public.contracts contract ON contract.id = instance.contract_id
  JOIN public.contract_modules module
    ON module.contract_id = contract.id
   AND module.module_key = 'crm'
   AND module.enabled = TRUE
  WHERE contract.status = 'active'
    AND instance.status <> 'archived'
  ORDER BY instance.organization_id,
           (instance.status = 'active') DESC,
           instance.created_at DESC
)
UPDATE public.crm_pipelines pipeline
SET crm_instance_id = runtime.id,
    updated_at = NOW()
FROM runtime_instances runtime
WHERE pipeline.organization_id = runtime.organization_id
  AND pipeline.crm_instance_id IS NULL;

WITH runtime_instances AS (
  SELECT DISTINCT ON (instance.organization_id)
    instance.id,
    instance.organization_id
  FROM public.crm_instances instance
  JOIN public.contracts contract ON contract.id = instance.contract_id
  JOIN public.contract_modules module
    ON module.contract_id = contract.id
   AND module.module_key = 'crm'
   AND module.enabled = TRUE
  WHERE contract.status = 'active'
    AND instance.status <> 'archived'
  ORDER BY instance.organization_id,
           (instance.status = 'active') DESC,
           instance.created_at DESC
)
INSERT INTO public.crm_pipelines (
  organization_id,
  crm_instance_id,
  name,
  description,
  is_default,
  is_active
)
SELECT runtime.organization_id,
       runtime.id,
       'Comercial',
       'Funil principal de oportunidades comerciais',
       TRUE,
       TRUE
FROM runtime_instances runtime
WHERE NOT EXISTS (
  SELECT 1
  FROM public.crm_pipelines pipeline
  WHERE pipeline.organization_id = runtime.organization_id
    AND pipeline.crm_instance_id = runtime.id
    AND pipeline.is_active = TRUE
)
ON CONFLICT (organization_id, name) DO UPDATE
SET crm_instance_id = COALESCE(public.crm_pipelines.crm_instance_id, EXCLUDED.crm_instance_id),
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO public.crm_pipeline_stages (
  pipeline_id,
  key,
  name,
  color,
  order_index,
  is_won,
  is_lost
)
SELECT pipeline.id,
       stage.key,
       stage.name,
       stage.color,
       stage.order_index,
       stage.is_won,
       stage.is_lost
FROM public.crm_pipelines pipeline
CROSS JOIN (
  VALUES
    ('new', 'Novo', '#64748b', 0, FALSE, FALSE),
    ('qualified', 'Qualificado', '#2563eb', 1, FALSE, FALSE),
    ('proposal', 'Proposta', '#7c3aed', 2, FALSE, FALSE),
    ('negotiation', 'Negociação', '#d97706', 3, FALSE, FALSE),
    ('won', 'Ganho', '#16a34a', 4, TRUE, FALSE),
    ('lost', 'Perdido', '#dc2626', 5, FALSE, TRUE)
) AS stage(key, name, color, order_index, is_won, is_lost)
WHERE pipeline.crm_instance_id IS NOT NULL
  AND pipeline.is_active = TRUE
ON CONFLICT (pipeline_id, key) DO NOTHING;

CREATE TEMP TABLE crm_runtime_defaults (
  crm_instance_id UUID PRIMARY KEY,
  pipeline_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO crm_runtime_defaults (crm_instance_id, pipeline_id)
SELECT DISTINCT ON (pipeline.crm_instance_id)
  pipeline.crm_instance_id,
  pipeline.id
FROM public.crm_pipelines pipeline
WHERE pipeline.crm_instance_id IS NOT NULL
  AND pipeline.is_active = TRUE
ORDER BY pipeline.crm_instance_id,
         pipeline.is_default DESC,
         pipeline.updated_at DESC,
         pipeline.created_at ASC,
         pipeline.id;

UPDATE public.crm_pipelines pipeline
SET is_default = FALSE,
    updated_at = NOW()
WHERE pipeline.crm_instance_id IN (SELECT crm_instance_id FROM crm_runtime_defaults)
  AND pipeline.is_default = TRUE;

UPDATE public.crm_pipelines pipeline
SET is_default = TRUE,
    updated_at = NOW()
FROM crm_runtime_defaults runtime
WHERE pipeline.id = runtime.pipeline_id;

UPDATE public.crm_instances instance
SET max_pipeline_count = GREATEST(instance.max_pipeline_count, 3),
    allow_client_pipeline_customization = TRUE,
    updated_at = NOW()
WHERE instance.id IN (SELECT crm_instance_id FROM crm_runtime_defaults)
  AND instance.status = 'draft';

UPDATE public.crm_instances instance
SET status = 'active',
    updated_at = NOW()
WHERE instance.id IN (SELECT crm_instance_id FROM crm_runtime_defaults)
  AND instance.status = 'draft';

UPDATE public.leads lead
SET crm_instance_id = pipeline.crm_instance_id,
    updated_at = NOW()
FROM public.crm_pipelines pipeline
WHERE lead.pipeline_id = pipeline.id
  AND pipeline.crm_instance_id IS NOT NULL
  AND lead.crm_instance_id IS DISTINCT FROM pipeline.crm_instance_id;

UPDATE public.leads lead
SET stage_id = COALESCE(
      (
        SELECT stage.id
        FROM public.crm_pipeline_stages stage
        WHERE stage.pipeline_id = lead.pipeline_id
          AND stage.is_active = TRUE
          AND stage.key = LOWER(COALESCE(lead.stage, 'new'))
        LIMIT 1
      ),
      (
        SELECT stage.id
        FROM public.crm_pipeline_stages stage
        WHERE stage.pipeline_id = lead.pipeline_id
          AND stage.is_active = TRUE
        ORDER BY stage.order_index ASC, stage.id ASC
        LIMIT 1
      )
    ),
    updated_at = NOW()
WHERE lead.pipeline_id IS NOT NULL
  AND lead.stage_id IS NULL;
